/**
 * MCP Gateway — server/mother/mcp-gateway.ts
 * MOTHER v96.0 | Ciclo C214 | NC-SENS-004
 *
 * Model Context Protocol (MCP) gateway enabling MOTHER to connect to
 * external services (Gmail, Calendar, Drive, GitHub, Apollo, etc.)
 * via standardized MCP server protocol.
 *
 * Scientific basis:
 * - Anthropic (2024) "Model Context Protocol" — open standard for LLM tool integration
 *   https://modelcontextprotocol.io/introduction
 * - Schick et al. (2023) "Toolformer: Language Models Can Teach Themselves to Use Tools"
 *   arXiv:2302.04761 — tool-augmented LLMs
 * - Qin et al. (2023) "ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs"
 *   arXiv:2307.16789 — API integration for LLMs
 *
 * Architecture:
 *   MCPServer: represents a connected MCP server (Gmail, Calendar, etc.)
 *   MCPTool: a callable tool exposed by an MCP server
 *   MCPGateway: manages server connections and tool dispatch
 */

export interface MCPServer {
  name: string;
  description: string;
  tools: MCPTool[];
  isConnected: boolean;
  lastHealthCheck?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface MCPCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
  toolName: string;
  serverName: string;
  durationMs: number;
}

export interface MCPDetectionResult {
  requiresMCP: boolean;
  suggestedServer: string;
  suggestedTool: string;
  confidence: number;
  reason: string;
}

// Registry of known MCP servers and their capabilities
const MCP_SERVER_REGISTRY: Record<string, Partial<MCPServer>> = {
  gmail: {
    name: 'gmail',
    description: 'Gmail email operations: send, read, search, label',
    tools: [
      { name: 'send_email', description: 'Send an email', inputSchema: { to: 'string', subject: 'string', body: 'string' }, serverName: 'gmail' },
      { name: 'search_emails', description: 'Search emails by query', inputSchema: { query: 'string', maxResults: 'number' }, serverName: 'gmail' },
      { name: 'read_email', description: 'Read a specific email', inputSchema: { messageId: 'string' }, serverName: 'gmail' },
    ],
  },
  'google-calendar': {
    name: 'google-calendar',
    description: 'Google Calendar: create events, list events, update, delete',
    tools: [
      { name: 'create_event', description: 'Create a calendar event', inputSchema: { title: 'string', start: 'string', end: 'string' }, serverName: 'google-calendar' },
      { name: 'list_events', description: 'List upcoming events', inputSchema: { maxResults: 'number', timeMin: 'string' }, serverName: 'google-calendar' },
    ],
  },
  'google-drive': {
    name: 'google-drive',
    description: 'Google Drive: upload, download, list, share files',
    tools: [
      { name: 'upload_file', description: 'Upload a file to Drive', inputSchema: { name: 'string', content: 'string', mimeType: 'string' }, serverName: 'google-drive' },
      { name: 'list_files', description: 'List files in Drive', inputSchema: { query: 'string', maxResults: 'number' }, serverName: 'google-drive' },
      { name: 'download_file', description: 'Download a file from Drive', inputSchema: { fileId: 'string' }, serverName: 'google-drive' },
    ],
  },
  github: {
    name: 'github',
    description: 'GitHub: repos, issues, PRs, commits, code search',
    tools: [
      { name: 'search_code', description: 'Search code on GitHub', inputSchema: { query: 'string', repo: 'string' }, serverName: 'github' },
      { name: 'create_issue', description: 'Create a GitHub issue', inputSchema: { repo: 'string', title: 'string', body: 'string' }, serverName: 'github' },
      { name: 'list_repos', description: 'List user repositories', inputSchema: { username: 'string' }, serverName: 'github' },
    ],
  },
  apollo: {
    name: 'apollo',
    description: 'Apollo B2B: people search, company data, email finder',
    tools: [
      { name: 'search_people', description: 'Search for people by name/company', inputSchema: { name: 'string', company: 'string' }, serverName: 'apollo' },
      { name: 'enrich_company', description: 'Get company data', inputSchema: { domain: 'string' }, serverName: 'apollo' },
    ],
  },
};

// In-memory connection state
const connectedServers = new Map<string, MCPServer>();

/**
 * Register an MCP server as connected.
 */
export function registerMCPServer(serverName: string): MCPServer {
  const template = MCP_SERVER_REGISTRY[serverName];
  if (!template) {
    throw new Error(`Unknown MCP server: ${serverName}. Available: ${Object.keys(MCP_SERVER_REGISTRY).join(', ')}`);
  }

  const server: MCPServer = {
    name: serverName,
    description: template.description ?? '',
    tools: (template.tools ?? []) as MCPTool[],
    isConnected: true,
    lastHealthCheck: new Date(),
  };

  connectedServers.set(serverName, server);
  return server;
}

/**
 * Get all available tools across all registered servers.
 */
export function getAllMCPTools(): MCPTool[] {
  const tools: MCPTool[] = [];
  for (const server of connectedServers.values()) {
    if (server.isConnected) {
      tools.push(...server.tools);
    }
  }
  return tools;
}

/**
 * Detect if a query requires MCP tool usage.
 * Returns the most likely server and tool to use.
 */
export function detectMCPRequirement(query: string): MCPDetectionResult {
  const patterns: Array<{ pattern: RegExp; server: string; tool: string; confidence: number }> = [
    { pattern: /send.*email|email.*to|write.*email/i, server: 'gmail', tool: 'send_email', confidence: 0.9 },
    { pattern: /search.*email|find.*email|inbox/i, server: 'gmail', tool: 'search_emails', confidence: 0.85 },
    { pattern: /calendar|schedule.*meeting|create.*event|book.*appointment/i, server: 'google-calendar', tool: 'create_event', confidence: 0.9 },
    { pattern: /upcoming.*event|what.*scheduled|my.*calendar/i, server: 'google-calendar', tool: 'list_events', confidence: 0.85 },
    { pattern: /upload.*drive|save.*drive|google drive/i, server: 'google-drive', tool: 'upload_file', confidence: 0.9 },
    { pattern: /github.*search|search.*code|find.*repo/i, server: 'github', tool: 'search_code', confidence: 0.85 },
    { pattern: /find.*contact|search.*company|B2B|lead/i, server: 'apollo', tool: 'search_people', confidence: 0.8 },
  ];

  for (const { pattern, server, tool, confidence } of patterns) {
    if (pattern.test(query)) {
      return {
        requiresMCP: true,
        suggestedServer: server,
        suggestedTool: tool,
        confidence,
        reason: `Query matches MCP pattern for ${server}/${tool}`,
      };
    }
  }

  return {
    requiresMCP: false,
    suggestedServer: '',
    suggestedTool: '',
    confidence: 0,
    reason: 'No MCP tool required for this query',
  };
}

/**
 * Generate MCP tool availability description for system prompt injection.
 */
export function generateMCPToolsDescription(): string {
  const allTools = getAllMCPTools();
  if (allTools.length === 0) {
    return '## MCP Tools: Nenhum servidor MCP conectado.';
  }

  const byServer: Record<string, MCPTool[]> = {};
  for (const tool of allTools) {
    if (!byServer[tool.serverName]) byServer[tool.serverName] = [];
    byServer[tool.serverName].push(tool);
  }

  const lines = ['## NC-SENS-004: MCP TOOLS DISPONÍVEIS'];
  for (const [serverName, tools] of Object.entries(byServer)) {
    lines.push(`\n### ${serverName}`);
    for (const tool of tools) {
      lines.push(`- **${tool.name}**: ${tool.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Simulate MCP tool call (real implementation would use manus-mcp-cli subprocess).
 * In production, this calls the actual MCP server via JSON-RPC.
 */
export async function callMCPTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPCallResult> {
  const start = Date.now();
  const server = connectedServers.get(serverName);

  if (!server || !server.isConnected) {
    return {
      success: false,
      error: `MCP server '${serverName}' not connected. Call registerMCPServer('${serverName}') first.`,
      toolName,
      serverName,
      durationMs: Date.now() - start,
    };
  }

  const tool = server.tools.find(t => t.name === toolName);
  if (!tool) {
    return {
      success: false,
      error: `Tool '${toolName}' not found in server '${serverName}'`,
      toolName,
      serverName,
      durationMs: Date.now() - start,
    };
  }

  // In production: spawn manus-mcp-cli tool call --server serverName --input JSON.stringify(args)
  // For now, return structured placeholder indicating what would be called
  return {
    success: true,
    result: {
      message: `MCP call dispatched: ${serverName}/${toolName}`,
      args,
      note: 'Production: calls manus-mcp-cli subprocess',
    },
    toolName,
    serverName,
    durationMs: Date.now() - start,
  };
}
