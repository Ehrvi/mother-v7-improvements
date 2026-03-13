/**
 * Tool Registry — Plugin-based tool management for MOTHER platform
 * Replaces monolithic tool-engine.ts with extensible registry pattern
 * Each application (SHMS, future apps) registers its own tools
 */

import { createLogger } from '../_core/logger';

const log = createLogger('TOOL_REGISTRY');

// Tool definition compatible with OpenAI Function Calling format
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolContext {
  userEmail?: string;
  userId?: number;
  isCreator?: boolean;
  applicationId?: string;
}

export interface ToolPlugin {
  id: string;
  name: string;
  domain: string;
  version: string;
  tools: ToolDefinition[];
  initialize?(): Promise<void>;
  execute(toolName: string, args: Record<string, any>, context: ToolContext): Promise<ToolResult>;
  formatResult?(toolName: string, result: ToolResult): string;
}

class ToolRegistryImpl {
  private plugins: Map<string, ToolPlugin> = new Map();
  private toolToPlugin: Map<string, string> = new Map();
  private initialized = false;

  /**
   * Register a tool plugin. Each plugin provides a set of tools for a specific domain.
   */
  register(plugin: ToolPlugin): void {
    if (this.plugins.has(plugin.id)) {
      log.warn(`[Registry] Plugin '${plugin.id}' already registered, replacing`);
    }

    this.plugins.set(plugin.id, plugin);

    for (const tool of plugin.tools) {
      const toolName = tool.function.name;
      if (this.toolToPlugin.has(toolName) && this.toolToPlugin.get(toolName) !== plugin.id) {
        log.warn(`[Registry] Tool '${toolName}' already registered by plugin '${this.toolToPlugin.get(toolName)}', overriding with '${plugin.id}'`);
      }
      this.toolToPlugin.set(toolName, plugin.id);
    }

    log.info(`[Registry] Registered plugin '${plugin.id}' (${plugin.domain}) with ${plugin.tools.length} tools`);
  }

  /**
   * Unregister a plugin and all its tools.
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    for (const tool of plugin.tools) {
      this.toolToPlugin.delete(tool.function.name);
    }
    this.plugins.delete(pluginId);
    log.info(`[Registry] Unregistered plugin '${pluginId}'`);
  }

  /**
   * Initialize all registered plugins.
   */
  async initializeAll(): Promise<void> {
    if (this.initialized) return;

    for (const [id, plugin] of this.plugins) {
      if (plugin.initialize) {
        try {
          await plugin.initialize();
          log.info(`[Registry] Plugin '${id}' initialized`);
        } catch (err) {
          log.error(`[Registry] Plugin '${id}' initialization failed:`, (err as Error).message);
        }
      }
    }
    this.initialized = true;
  }

  /**
   * Get all registered tool definitions (for LLM function calling).
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      tools.push(...plugin.tools);
    }
    return tools;
  }

  /**
   * Get tools for a specific domain.
   */
  getToolsForDomain(domain: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.domain === domain) {
        tools.push(...plugin.tools);
      }
    }
    return tools;
  }

  /**
   * Execute a tool by name.
   */
  async execute(toolName: string, args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const pluginId = this.toolToPlugin.get(toolName);
    if (!pluginId) {
      return { success: false, error: `Tool '${toolName}' not found in registry` };
    }

    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return { success: false, error: `Plugin '${pluginId}' not found` };
    }

    const start = Date.now();
    try {
      const result = await plugin.execute(toolName, args, context);
      log.info(`[Registry] ${toolName} executed in ${Date.now() - start}ms (${result.success ? 'OK' : 'FAIL'})`);
      return result;
    } catch (err) {
      log.error(`[Registry] ${toolName} execution error:`, (err as Error).message);
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Format a tool result for LLM consumption.
   */
  formatResult(toolName: string, result: ToolResult): string {
    const pluginId = this.toolToPlugin.get(toolName);
    if (pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.formatResult) {
        return plugin.formatResult(toolName, result);
      }
    }

    if (!result.success) {
      return `Tool '${toolName}' failed: ${result.error}`;
    }
    return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  }

  /**
   * Get registry statistics.
   */
  getStats(): { plugins: number; tools: number; domains: string[] } {
    const domains = new Set<string>();
    for (const plugin of this.plugins.values()) {
      domains.add(plugin.domain);
    }
    return {
      plugins: this.plugins.size,
      tools: this.toolToPlugin.size,
      domains: Array.from(domains),
    };
  }

  /**
   * List all registered plugins with their tools.
   */
  listPlugins(): Array<{ id: string; name: string; domain: string; version: string; toolCount: number }> {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      version: p.version,
      toolCount: p.tools.length,
    }));
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistryImpl();
