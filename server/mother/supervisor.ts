/**
 * MOTHER v35.0: Supervisor - Darwin Gödel Machine (DGM) Orchestrator
 * 
 * This supervisor coordinates multiple worker agents (CodeAgent, MemoryAgent, ValidationAgent)
 * using LangGraph's StateGraph architecture with persistent MySQL checkpointing.
 * 
 * Architecture:
 * - StateGraph: Defines the workflow graph with conditional routing
 * - SupervisorState: Shared state with messages and next field for routing
 * - MySqlCheckpointer: Persistent state storage in TiDB/MySQL
 * - Workers: Specialized agents for code manipulation, memory management, and validation
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MySqlCheckpointer } from "./checkpoint";

/**
 * SupervisorState - Shared state across all nodes
 * 
 * - messages: Conversation history (LangGraph MessagesAnnotation pattern)
 * - next: Routing decision (which worker to invoke next, or "END")
 */
const SupervisorState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (existing, update) => update ?? existing,
    default: () => "router",
  }),
});

/**
 * Router Node - Decides which worker to invoke based on the goal
 * 
 * This is a simplified router. In production, you would use an LLM to analyze
 * the goal and decide which worker is best suited for the task.
 */
async function routerNode(state: typeof SupervisorState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const goal = lastMessage.content.toString().toLowerCase();

  // Simple keyword-based routing (replace with LLM-based routing in production)
  let nextWorker = "code_agent"; // default

  if (goal.includes("memory") || goal.includes("remember") || goal.includes("recall")) {
    nextWorker = "memory_agent";
  } else if (goal.includes("validate") || goal.includes("test") || goal.includes("benchmark")) {
    nextWorker = "validation_agent";
  } else if (goal.includes("code") || goal.includes("file") || goal.includes("modify")) {
    nextWorker = "code_agent";
  }

  console.log(`[Supervisor] Router decided: ${nextWorker}`);

  return {
    next: nextWorker,
    messages: [new AIMessage(`Routing to ${nextWorker}...`)],
  };
}

/**
 * Code Agent Node - Placeholder (will be replaced with actual CodeAgent)
 */
async function codeAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] CodeAgent executing...");

  // TODO: Replace with actual CodeAgent invocation
  // For now, just return a placeholder response
  return {
    next: END,
    messages: [new AIMessage("CodeAgent: Task completed (placeholder)")],
  };
}

/**
 * Memory Agent Node - Placeholder (will be replaced with actual MemoryAgent)
 */
async function memoryAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] MemoryAgent executing...");

  // TODO: Replace with actual MemoryAgent invocation
  return {
    next: END,
    messages: [new AIMessage("MemoryAgent: Task completed (placeholder)")],
  };
}

/**
 * Validation Agent Node - Placeholder (will be replaced with actual ValidationAgent)
 */
async function validationAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] ValidationAgent executing...");

  // TODO: Replace with actual ValidationAgent invocation
  return {
    next: END,
    messages: [new AIMessage("ValidationAgent: Task completed (placeholder)")],
  };
}

/**
 * Build and compile the Supervisor graph
 */
export function buildSupervisorGraph() {
  const checkpointer = new MySqlCheckpointer();

  // Create the StateGraph
  const workflow = new StateGraph(SupervisorState)
    // Add nodes
    .addNode("router", routerNode)
    .addNode("code_agent", codeAgentNode)
    .addNode("memory_agent", memoryAgentNode)
    .addNode("validation_agent", validationAgentNode)
    
    // Add edges
    .addEdge(START, "router")
    
    // Conditional routing from router to workers
    .addConditionalEdges("router", (state) => state.next, {
      code_agent: "code_agent",
      memory_agent: "memory_agent",
      validation_agent: "validation_agent",
    })
    
    // All workers route to END
    .addEdge("code_agent", END)
    .addEdge("memory_agent", END)
    .addEdge("validation_agent", END);

  // Compile with checkpointer
  const app = workflow.compile({ checkpointer });

  return app;
}

/**
 * Invoke the supervisor with a goal
 * 
 * @param goal - The user's goal/task
 * @param threadId - Unique thread ID for checkpointing
 * @returns The final state after execution
 */
export async function invokeSupervisor(goal: string, threadId: string) {
  const app = buildSupervisorGraph();

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const result = await app.invoke(
    {
      messages: [new HumanMessage(goal)],
    },
    config
  );

  return result;
}

/**
 * Get the state history for a thread
 * 
 * @param threadId - Unique thread ID
 * @returns Array of state snapshots
 */
export async function getSupervisorStatus(threadId: string) {
  const app = buildSupervisorGraph();

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const stateHistory = [];
  for await (const state of app.getStateHistory(config)) {
    stateHistory.push(state);
  }

  return stateHistory;
}
