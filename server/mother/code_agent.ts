/**
 * MOTHER v31.0 - CodeAgent Implementation
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
  status: "planning" | "executing" | "analyzing" | "completed" | "failed";
  message: string;
}

/**
 * Planner: Generates a step-by-step plan using the LLM
 */
async function generatePlan(task: string): Promise<Array<{ tool: string; input: any; description: string }>> {
  logger.info(`[CodeAgent] Planner: Generating plan for task: "${task}"`);
  
  const toolDescriptions = toolRegistry
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");
  
  const planPrompt = `You are a CodeAgent planning a software engineering task.

Task: ${task}

Available Tools:
${toolDescriptions}

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
- Be specific with file paths (e.g., /home/ubuntu/mother-interface/drizzle/schema.ts)
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
 * Analyzer: Analyzes the result and decides whether to continue or fail
 */
function analyzeResult(result: any, stepIndex: number, totalSteps: number): {
  shouldContinue: boolean;
  message: string;
} {
  if (!result.success) {
    logger.warn(`[CodeAgent] Analyzer: Step ${stepIndex + 1} failed`);
    return {
      shouldContinue: false,
      message: `Task failed at step ${stepIndex + 1}: ${result.error}`,
    };
  }
  
  if (stepIndex + 1 >= totalSteps) {
    logger.info("[CodeAgent] Analyzer: All steps completed successfully");
    return {
      shouldContinue: false,
      message: "Task completed successfully",
    };
  }
  
  logger.info(`[CodeAgent] Analyzer: Step ${stepIndex + 1}/${totalSteps} succeeded, continuing`);
  return {
    shouldContinue: true,
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
  };
  
  try {
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
        const analysis = analyzeResult(result, i, state.plan.length);
        
        if (!analysis.shouldContinue) {
          state.status = result.success ? "completed" : "failed";
          state.message = analysis.message;
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
