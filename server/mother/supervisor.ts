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
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

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
 * Uses ChatOpenAI with structured output to intelligently route between workers.
 */
const routingSchema = z.object({
  next: z.enum(["code_agent", "memory_agent", "validation_agent", "END"]).describe(
    "The next worker to invoke. Choose 'code_agent' for code manipulation tasks, 'memory_agent' for storing/recalling information, 'validation_agent' for testing/benchmarking, or 'END' if the goal is already achieved."
  ),
  reasoning: z.string().describe("Brief explanation of why this worker was chosen"),
});

async function routerNode(state: typeof SupervisorState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const goal = lastMessage.content.toString();

  // Use LLM to decide routing
  const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });

  const structuredLLM = llm.withStructuredOutput(routingSchema);

  const routingDecision = await structuredLLM.invoke([
    {
      role: "system",
      content: `You are a routing agent for the MOTHER DGM system. Based on the user's goal, decide which worker should handle the task:
- code_agent: For reading, writing, or modifying files and code
- memory_agent: For storing information or recalling past interactions
- validation_agent: For running tests, benchmarks, or validating code quality
- END: If the goal is already achieved or doesn't require any worker

Analyze the goal and choose the most appropriate worker.`,
    },
    {
      role: "user",
      content: `Goal: ${goal}`,
    },
  ]);

  console.log(`[Supervisor] Router decided: ${routingDecision.next} (Reasoning: ${routingDecision.reasoning})`);

  return {
    next: routingDecision.next,
    messages: [new AIMessage(`Routing to ${routingDecision.next}... Reasoning: ${routingDecision.reasoning}`)],
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
    next: "archive",
    messages: [new AIMessage("ValidationAgent: Task completed (placeholder)")],
  };
}

/**
 * Archive Node - Saves evolution metadata to dgm_archive table
 * 
 * Stores the fitness score and execution metadata for DGM evolutionary tracking.
 */
async function archiveNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] ArchiveNode executing...");

  try {
    const { getDb } = await import("../db");
    const { dgmArchive } = await import("../../drizzle/schema");
    
    const db = await getDb();
    if (!db) {
      console.error("[ArchiveNode] Database connection failed");
      return {
        next: END,
        messages: [new AIMessage("ArchiveNode: Failed to connect to database")],
      };
    }

    // Extract fitness score from messages (ValidationAgent should set this)
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content.toString();
    
    // Parse fitness score from message (format: "Fitness Score: X.XX")
    const fitnessMatch = content.match(/Fitness Score: ([0-9.]+)/);
    const fitnessScore = fitnessMatch ? parseFloat(fitnessMatch[1]) : 0.0;

    // Save to dgm_archive
    await db.insert(dgmArchive).values({
      parentId: null, // TODO: Track parent evolution in future versions
      fitnessScore,
      codeSnapshotUrl: null, // TODO: Upload code snapshot to S3 in future versions
      metadata: JSON.stringify({
        messageCount: state.messages.length,
        timestamp: new Date().toISOString(),
        goal: state.messages[0]?.content.toString() || "unknown",
      }),
    });

    console.log(`[ArchiveNode] Saved evolution with fitness score: ${fitnessScore}`);

    return {
      next: END,
      messages: [new AIMessage(`ArchiveNode: Evolution archived with fitness score ${fitnessScore}`)],
    };
  } catch (error) {
    console.error("[ArchiveNode] Error:", error);
    return {
      next: END,
      messages: [new AIMessage(`ArchiveNode: Error - ${error}`)],
    };
  }
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
    .addNode("archive", archiveNode)
    
    // Add edges
    .addEdge(START, "router")
    
    // Conditional routing from router to workers
    .addConditionalEdges("router", (state) => state.next, {
      code_agent: "code_agent",
      memory_agent: "memory_agent",
      validation_agent: "validation_agent",
    })
    
    // Workers route to END or archive
    .addEdge("code_agent", END)
    .addEdge("memory_agent", END)
    .addEdge("validation_agent", "archive") // ValidationAgent → Archive → END
    .addEdge("archive", END);

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
