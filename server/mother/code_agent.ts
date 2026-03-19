/**
 * MOTHER v31.1 - CodeAgent Implementation (with Retry Logic and Rollback)
 * 
 * Implements the third pillar of the cognitive architecture: Agency.
 * The CodeAgent is an autonomous agent capable of modifying the MOTHER codebase
 * to achieve specified objectives.
 * 
 * Architecture: Simplified agent loop (planner → executor → analyzer)
 * Note: This implementation uses a manual loop instead of LangGraph due to API
 * compatibility issues with v1.1.5. The conceptual architecture remains the same.
 * 
 * References:
 * [14] LangChain Team. (2025). LangGraph: Building Stateful, Multi-Actor Applications with LLMs.
 * [17] Robeyns, M., et al. (2025). A Self-Improving Coding Agent. arXiv:2504.15228.
 */

import { invokeLLM } from "../_core/llm";
import { toolRegistry } from "./react";
import { logger } from "../lib/logger";

/**
 * AgentState defines the complete state of the CodeAgent during execution
 */
export interface AgentState {
  // Input
  task: string;
  
  // Planning
  plan: Array<{
    tool: string;
    input: any;
    description: string;
  }>;
  currentStepIndex: number;
  
  // Execution
  executedSteps: Array<{
    step: string;
    toolName: string;
    input: any;
    result: any;
  }>;
  
  // Analysis
  observations: string[];
  errors: string[];
  
  // Output
  finalCode: string | null;
  status: "planning" | "executing" | "analyzing" | "completed" | "failed" | "retrying";
  message: string;
  
  // v31.1: Retry and rollback
  retryCount: number;
  maxRetries: number;
  gitCommitHash: string | null;
}

/**
 * Planner: Generates a step-by-step plan using the LLM
 */
async function generatePlan(task: string): Promise<Array<{ tool: string; input: any; description: string }>> {
  logger.info(`[CodeAgent] Planner: Generating plan for task: "${task}"`);
  
  // v32.0: Consult episodic memory for similar past solutions
  let memoryContext = "";
  try {
    const { searchEpisodicMemory } = await import("../db-episodic-memory");
    const pastSolutions = await searchEpisodicMemory(task, 3);
    
    if (pastSolutions.length > 0) {
      logger.info(`[CodeAgent] Planner: Found ${pastSolutions.length} similar past solutions in memory`);
      memoryContext = "\n\nPast Solutions (from episodic memory):\n" + 
        pastSolutions
          .map((sol, i) => `${i + 1}. Query: "${sol.query}"\n   Response: "${sol.response}"\n   Similarity: ${sol.similarity.toFixed(3)}`)
          .join("\n\n");
    } else {
      logger.info("[CodeAgent] Planner: No similar past solutions found in memory");
    }
  } catch (error) {
    logger.warn("[CodeAgent] Planner: Failed to query episodic memory:", error);
  }
  
  const toolDescriptions = toolRegistry
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");
  
  const planPrompt = `You are a CodeAgent planning a software engineering task.

Task: ${task}

Available Tools:
${toolDescriptions}${memoryContext}

Generate a step-by-step plan to accomplish this task. Each step should specify:
1. The tool to use
2. The input parameters for the tool
3. What the step accomplishes

Format your response as a JSON array of steps:
[
  {
    "tool": "tool_name",
    "input": { "param": "value" },
    "description": "What this step does"
  }
]

IMPORTANT: 
- ALWAYS use read_file FIRST to read existing files before modifying them
- When modifying files, you MUST preserve ALL existing content and only add/modify the specific parts needed
- The write_file tool requires the COMPLETE file content, not just the changes
- After reading a file, include a step to "Modify the content by adding/changing X while preserving all other content"
- Use run_shell_command for operations like "pnpm db:push"
- Be specific with file paths (relative to project root)
- Keep the plan concise (3-5 steps maximum)

Example plan for adding a field to a table:
1. read_file: Read the schema file
2. write_file: Write the COMPLETE file content with the new field added to the specific table (preserve all other tables and content)
3. run_shell_command: Run pnpm db:push to apply changes`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a helpful coding assistant that generates precise execution plans." },
      { role: "user", content: planPrompt }
    ],
  });
  
  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === 'string' ? rawContent : "";
  
  // Extract JSON from response (handle markdown code blocks)
  let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    jsonMatch = content.match(/\[[\s\S]*\]/);
  } else {
    jsonMatch = jsonMatch[1].match(/\[[\s\S]*\]/);
  }
  
  if (!jsonMatch) {
    throw new Error("Failed to extract plan from LLM response");
  }
  
  const plan = JSON.parse(jsonMatch[0]);
  
  logger.info(`[CodeAgent] Planner: Generated plan with ${plan.length} steps`);
  
  return plan;
}

/**
 * Executor: Executes a single step by invoking the specified tool
 */
async function executeStep(step: { tool: string; input: any; description: string }): Promise<any> {
  logger.info(`[CodeAgent] Executor: Executing step: ${step.description}`);
  
  const tool = toolRegistry.find(t => t.name === step.tool);
  if (!tool) {
    throw new Error(`Tool "${step.tool}" not found in registry`);
  }
  
  const result = await tool.handler(step.input);
  
  logger.info(`[CodeAgent] Executor: Step completed`, { success: result.success });
  
  return result;
}

/**
 * Analyzer: Analyzes the result and decides whether to continue, retry, or fail
 * v31.1: Enhanced with retry decision logic
 */
function analyzeResult(
  result: any, 
  stepIndex: number, 
  totalSteps: number, 
  retryCount: number, 
  maxRetries: number
): {
  shouldContinue: boolean;
  shouldRetry: boolean;
  message: string;
} {
  if (!result.success) {
    logger.warn(`[CodeAgent] Analyzer: Step ${stepIndex + 1} failed`);
    
    // v31.1: Decide whether to retry
    if (retryCount < maxRetries) {
      logger.info(`[CodeAgent] Analyzer: Retry ${retryCount + 1}/${maxRetries} for step ${stepIndex + 1}`);
      return {
        shouldContinue: false,
        shouldRetry: true,
        message: `Step ${stepIndex + 1} failed, retrying (${retryCount + 1}/${maxRetries}): ${result.error}`,
      };
    }
    
    // Max retries exceeded, fail
    return {
      shouldContinue: false,
      shouldRetry: false,
      message: `Task failed at step ${stepIndex + 1} after ${maxRetries} retries: ${result.error}`,
    };
  }
  
  if (stepIndex + 1 >= totalSteps) {
    logger.info("[CodeAgent] Analyzer: All steps completed successfully");
    return {
      shouldContinue: false,
      shouldRetry: false,
      message: "Task completed successfully",
    };
  }
  
  logger.info(`[CodeAgent] Analyzer: Step ${stepIndex + 1}/${totalSteps} succeeded, continuing`);
  return {
    shouldContinue: true,
    shouldRetry: false,
    message: `Step ${stepIndex + 1}/${totalSteps} completed`,
  };
}

/**
 * Main CodeAgent execution function
 * 
 * Implements the agent loop: Plan → Execute → Analyze → Repeat
 */
export async function runCodeAgent(task: string): Promise<AgentState> {
  logger.info(`[CodeAgent] Starting execution for task: "${task}"`);
  
  const state: AgentState = {
    task,
    plan: [],
    currentStepIndex: 0,
    executedSteps: [],
    observations: [],
    errors: [],
    finalCode: null,
    status: "planning",
    message: "Initializing...",
    retryCount: 0,
    maxRetries: 2, // v31.1: Allow up to 2 retries per step
    gitCommitHash: null,
  };
  
  try {
    // v31.1: Create Git commit before starting (for rollback)
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      
      // Check if we're in a git repository
      try {
        const projectRoot = process.env.MOTHER_PROJECT_ROOT || process.cwd(); // P1 fix
        await execAsync("git rev-parse --git-dir", { cwd: projectRoot });
        
        // Create a commit with current state
        await execAsync(
          'git add -A && git commit -m "CodeAgent: Pre-execution state (v31.1)" --allow-empty',
          { cwd: projectRoot }
        );
        
        // Get the commit hash
        const { stdout } = await execAsync("git rev-parse HEAD", { cwd: projectRoot });
        state.gitCommitHash = stdout.trim();
        
        logger.info(`[CodeAgent] Git commit created: ${state.gitCommitHash}`);
      } catch (gitError) {
        logger.warn("[CodeAgent] Not in a git repository or git commit failed, proceeding without rollback capability");
      }
    } catch (error) {
      logger.warn("[CodeAgent] Git setup failed, proceeding without rollback capability:", error);
    }
    
    // Phase 1: Planning
    state.status = "planning";
    state.plan = await generatePlan(task);
    state.message = `Plan generated with ${state.plan.length} steps`;
    
    // Phase 2: Execution Loop
    state.status = "executing";
    
    for (let i = 0; i < state.plan.length; i++) {
      state.currentStepIndex = i;
      const step = state.plan[i];
      
      try {
        // Execute the step
        const result = await executeStep(step);
        
        // Record execution
        state.executedSteps.push({
          step: step.description,
          toolName: step.tool,
          input: step.input,
          result,
        });
        
        // Add observation
        const observation = `Step ${i + 1}: ${step.description} - ${result.success ? "SUCCESS" : "FAILED"}`;
        state.observations.push(observation);
        
        if (!result.success) {
          state.errors.push(result.error || "Unknown error");
        }
        
        // Phase 3: Analysis
        state.status = "analyzing";
        const analysis = analyzeResult(result, i, state.plan.length, state.retryCount, state.maxRetries);
        
        // v31.1: Handle retry logic
        if (analysis.shouldRetry) {
          state.status = "retrying";
          state.message = analysis.message;
          state.retryCount++;
          i--; // Retry the same step
          continue;
        }
        
        // Reset retry count on success
        if (result.success) {
          state.retryCount = 0;
        }
        
        if (!analysis.shouldContinue) {
          state.status = result.success ? "completed" : "failed";
          state.message = analysis.message;
          
          // v31.1: Rollback on failure
          if (!result.success && state.gitCommitHash) {
            logger.warn("[CodeAgent] Task failed, rolling back to pre-execution state");
            try {
              const { exec } = await import("child_process");
              const { promisify } = await import("util");
              const execAsync = promisify(exec);
              
              await execAsync(`git reset --hard ${state.gitCommitHash}`, { cwd: process.env.MOTHER_PROJECT_ROOT || process.cwd() }); // P1 fix
              logger.info("[CodeAgent] Rollback successful");
              state.message += " (rolled back to pre-execution state)";
            } catch (rollbackError) {
              logger.error("[CodeAgent] Rollback failed:", rollbackError);
              state.message += " (WARNING: rollback failed)";
            }
          }
          
          break;
        }
        
        state.status = "executing";
        state.message = analysis.message;
        
      } catch (error) {
        logger.error(`[CodeAgent] Step ${i + 1} failed with exception:`, error);
        state.errors.push((error as Error).message);
        state.observations.push(`Step ${i + 1}: EXCEPTION - ${(error as Error).message}`);
        state.status = "failed";
        state.message = `Task failed at step ${i + 1}: ${(error as Error).message}`;
        break;
      }
    }
    
    // Final status check
    if (state.status !== "completed" && state.status !== "failed") {
      state.status = "completed";
      state.message = "All steps executed successfully";
    }
    
    logger.info(`[CodeAgent] Execution completed with status: ${state.status}`);
    return state;
    
  } catch (error) {
    logger.error("[CodeAgent] Execution failed:", error);
    state.status = "failed";
    state.message = `Execution failed: ${(error as Error).message}`;
    state.errors.push((error as Error).message);
    return state;
  }
}

/**
 * Export a simplified interface for tRPC
 */
export async function invokeCodeAgent(task: string): Promise<{
  success: boolean;
  message: string;
  state: AgentState;
}> {
  const state = await runCodeAgent(task);
  
  return {
    success: state.status === "completed",
    message: state.message,
    state,
  };
}
