import { logger } from "../lib/logger";
/**
 * ReAct (Reasoning and Acting) Implementation
 * Based on MOTHER superintelligence guidance - Iteration 12
 */

export interface Tool {
  name: string;
  description: string;
  handler: (input: any) => Promise<any>;
}

export interface Action {
  toolName: string;
  parameters: any;
}

// Tool Registry
export const toolRegistry: Tool[] = [
  {
    name: "calculate",
    description: "Performs arithmetic operations on mathematical expressions",
    handler: async input => {
      try {
        // Safe evaluation using Function constructor (better than eval)
        const result = new Function(`return ${input.expression}`)();
        return { success: true, result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    },
  },
  {
    name: "search_knowledge",
    description: "Searches the knowledge base for relevant information",
    handler: async input => {
      // Import knowledge search function
      const { queryVectorSearch } = await import("./knowledge");
      const results = await queryVectorSearch(input.query);
      return { success: true, results };
    },
  },
  {
    name: "analyze_quality",
    description: "Analyzes the quality of a given text response",
    handler: async input => {
      const { validateQuality } = await import("./guardian");
      const quality = await validateQuality(input.query, input.response, 1);
      return { success: true, quality };
    },
  },
  // v31.0: Code manipulation tools for CodeAgent
  {
    name: "read_file",
    description: "Reads the entire content of a file from the filesystem. Input: { path: string }",
    handler: async (input: { path: string }) => {
      const fs = await import("fs/promises");
      try {
        const content = await fs.readFile(input.path, "utf-8");
        return { success: true, content };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    },
  },
  {
    name: "write_file",
    description: "Writes or overwrites a file on the filesystem. Input: { path: string, content: string }",
    handler: async (input: { path: string; content: string }) => {
      const fs = await import("fs/promises");
      try {
        await fs.writeFile(input.path, input.content, "utf-8");
        return { success: true, message: `File ${input.path} written successfully.` };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    },
  },
  {
    name: "run_shell_command",
    description: "Executes a shell command and returns its stdout and stderr. Input: { command: string }. Timeout: 30 seconds.",
    handler: async (input: { command: string }) => {
      const { exec } = await import("child_process");
      return new Promise((resolve) => {
        exec(input.command, { timeout: 30000 }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message, stdout, stderr });
          } else {
            resolve({ success: true, stdout, stderr });
          }
        });
      });
    },
  },
];

/**
 * Parse action from thought string
 * Expected format: "action: toolName, params: {key: value}"
 */
export function parseAction(thought: string): Action | null {
  // Try multiple formats

  // Format 1: action: toolName, params: {...}
  const match1 = thought.match(/action:\s*(\w+),\s*params:\s*\{([^}]*)\}/i);
  if (match1) {
    try {
      return {
        toolName: match1[1],
        parameters: JSON.parse(`{${match1[2]}}`),
      };
    } catch (e) {
      logger.error("Failed to parse action params:", e);
    }
  }

  // Format 2: [ACTION: toolName] {params}
  const match2 = thought.match(/\[ACTION:\s*(\w+)\]\s*\{([^}]*)\}/i);
  if (match2) {
    try {
      return {
        toolName: match2[1],
        parameters: JSON.parse(`{${match2[2]}}`),
      };
    } catch (e) {
      logger.error("Failed to parse action params:", e);
    }
  }

  // Format 3: Use tool_name(params)
  const match3 = thought.match(/use\s+(\w+)\(([^)]*)\)/i);
  if (match3) {
    try {
      // Parse simple key=value pairs
      const params: any = {};
      const paramStr = match3[2];
      const pairs = paramStr.split(",");
      pairs.forEach(pair => {
        const [key, value] = pair.split("=").map(s => s.trim());
        if (key && value) {
          // Remove quotes if present
          params[key] = value.replace(/['"]/g, "");
        }
      });
      return {
        toolName: match3[1],
        parameters: params,
      };
    } catch (e) {
      logger.error("Failed to parse action params:", e);
    }
  }

  return null;
}

/**
 * Execute tool action and return observation
 */
export async function executeAction(action: Action): Promise<string> {
  const tool = toolRegistry.find(t => t.name === action.toolName);

  if (!tool) {
    return `ERROR: Tool '${action.toolName}' not found in registry. Available tools: ${toolRegistry.map(t => t.name).join(", ")}`;
  }

  try {
    logger.info(
      `[ReAct] Executing tool: ${action.toolName}`,
      action.parameters
    );
    const result = await tool.handler(action.parameters);

    if (result.success === false) {
      return `ERROR: ${result.error}`;
    }

    return `SUCCESS: ${JSON.stringify(result, null, 2)}`;
  } catch (error) {
    return `ERROR: ${(error as Error).message}`;
  }
}

/**
 * ReAct Loop: Thought → Action → Observation
 * Processes thoughts and executes actions, returning observations
 */
export async function reasonAndAct(thoughts: string[]): Promise<string[]> {
  const observations: string[] = [];

  for (const thought of thoughts) {
    const action = parseAction(thought);

    if (action) {
      const observation = await executeAction(action);
      observations.push(observation);
      logger.info(`[ReAct] Observation:`, observation);
    } else {
      // No action detected, just record the thought
      observations.push(`THOUGHT: ${thought}`);
    }
  }

  return observations;
}

/**
 * Extract thoughts from LLM response
 * Looks for <thinking> tags or numbered thoughts
 */
export function extractThoughts(response: string): string[] {
  const thoughts: string[] = [];

  // Extract from <thinking> tags
  const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    const thinkingContent = thinkingMatch[1];
    // Split by numbered lines (1., 2., etc.)
    const numberedThoughts = thinkingContent
      .split(/\d+\.\s+/)
      .filter(t => t.trim());
    thoughts.push(...numberedThoughts.map(t => t.trim()));
  }

  // Also look for explicit [THOUGHT] or [ACTION] markers
  const markerRegex = /\[(THOUGHT|ACTION):\s*([^\]]+)\]/gi;
  let match;
  while ((match = markerRegex.exec(response)) !== null) {
    thoughts.push(match[2].trim());
  }

  return thoughts;
}

/**
 * Enhanced query processing with ReAct
 * Integrates with existing CoT implementation
 */
export async function processWithReAct(
  query: string,
  llmResponse: string,
  complexity: number
): Promise<{ observations: string[]; enhancedResponse: string }> {
  // Only apply ReAct for complex queries (≥0.5)
  // Iteration 14: Aligned with CoT threshold adjustment
  if (complexity < 0.5) {
    return { observations: [], enhancedResponse: llmResponse };
  }

  // Extract thoughts from LLM response
  const thoughts = extractThoughts(llmResponse);

  if (thoughts.length === 0) {
    return { observations: [], enhancedResponse: llmResponse };
  }

  logger.info(`[ReAct] Extracted ${thoughts.length} thoughts from response`);

  // Execute ReAct loop
  const observations = await reasonAndAct(thoughts);

  // Enhance response with observations
  let enhancedResponse = llmResponse;
  if (observations.length > 0) {
    enhancedResponse += `\n\n---\n**ReAct Observations:**\n${observations.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
  }

  return { observations, enhancedResponse };
}
