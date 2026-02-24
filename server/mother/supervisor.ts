/**
 * MOTHER v41.0: Supervisor - Darwin Gödel Machine (DGM) Orchestrator
 *
 * This supervisor coordinates multiple worker agents (CodeAgent, MemoryAgent, ValidationAgent)
 * using LangGraph's StateGraph architecture with persistent MySQL checkpointing.
 *
 * Architecture:
 * - StateGraph: Defines the workflow graph with conditional routing
 * - SupervisorState: Shared state with messages and next field for routing
 * - MySqlCheckpointer: Persistent state storage in TiDB/MySQL
 * - Workers: REAL agents for code manipulation, memory management, and validation
 *
 * Scientific basis:
 * - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954)
 * - ReAct: Synergizing Reasoning and Acting (Yao et al., ICLR 2023)
 * - A-MEM: Agentic Memory for LLM Agents (Xu et al., arXiv:2502.12110)
 * - Self-Improving Coding Agent (Robeyns et al., arXiv:2504.15228)
 * - LangGraph multi-agent supervisor pattern
 *
 * v41.0 Changes (Strategic Merge):
 * - Integrated: REAL CodeAgent (v31.1) with planner-executor-analyzer loop
 * - Integrated: REAL MemoryAgent (v35.0) with vector search on episodic_memory
 * - Preserved: REAL ValidationAgent (ReAct v40.0) with empirical fitness scoring
 * - Preserved: ArchiveNode with MySQL persistence
 * - Fixed: END routing bug from v40.0
 * - Added: Routing to code_agent and memory_agent in the DGM loop
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MySqlCheckpointer } from "./checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { archiveNode as archiveNodeImpl } from "./archive_node";
import { createValidationAgent } from "./validation_agent";
import { createMemoryAgent } from "./memory_agent";
import { invokeCodeAgent } from "./code_agent";

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
  next: z
    .enum(["code_agent", "memory_agent", "validation_agent", "END"])
    .describe(
      "The next worker to invoke. Choose 'code_agent' for code manipulation/implementation tasks, 'memory_agent' for storing/recalling information, 'validation_agent' for testing/benchmarking/validation, or 'END' if the goal is already achieved."
    ),
  reasoning: z
    .string()
    .describe("Brief explanation of why this worker was chosen"),
});

async function routerNode(state: typeof SupervisorState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const goal = lastMessage.content.toString();

  const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });
  const structuredLLM = llm.withStructuredOutput(routingSchema);

  const routingDecision = await structuredLLM.invoke([
    {
      role: "system",
      content: `You are a routing agent for the MOTHER DGM system. Based on the user's goal, decide which worker should handle the task:
- code_agent: For reading, writing, modifying files, implementing features, or any coding task
- memory_agent: For storing information, recalling past interactions, or managing episodic memory
- validation_agent: For running tests, benchmarks, validating code quality, or calculating fitness scores
- END: If the goal is already achieved or doesn't require any worker

Analyze the goal and choose the most appropriate worker.`,
    },
    {
      role: "user",
      content: `Goal: ${goal}`,
    },
  ]);

  console.log(
    `[Supervisor] Router decided: ${routingDecision.next} (Reasoning: ${routingDecision.reasoning})`
  );

  return {
    next: routingDecision.next,
    messages: [
      new AIMessage(
        `Routing to ${routingDecision.next}... Reasoning: ${routingDecision.reasoning}`
      ),
    ],
  };
}

/**
 * Code Agent Node - REAL implementation (v31.1)
 * 
 * Uses the CodeAgent from the main branch with:
 * - Planner: LLM generates a step-by-step plan
 * - Executor: Executes each step using the toolRegistry (read/write/exec)
 * - Analyzer: Evaluates results and retries if needed
 * - Episodic Memory: Searches past solutions before planning
 */
async function codeAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] CodeAgent executing (v31.1 - Real ReAct)...");

  try {
    const lastHumanMessage = state.messages
      .slice()
      .reverse()
      .find((m) => m._getType() === "human");

    const task = lastHumanMessage?.content?.toString() || "Implement the requested feature";

    const result = await invokeCodeAgent(task);

    console.log(`[Supervisor] CodeAgent completed: success=${result.success}, status=${result.state.status}`);

    return {
      next: "validation_agent",
      messages: [
        new AIMessage(
          `CodeAgent (v31.1): ${result.message}\n\nStatus: ${result.state.status}\nSteps executed: ${result.state.executedSteps?.length || 0}`
        ),
      ],
    };
  } catch (error) {
    console.error("[Supervisor] CodeAgent error:", error);
    return {
      next: "validation_agent",
      messages: [
        new AIMessage(
          `CodeAgent error: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
      ],
    };
  }
}

/**
 * Memory Agent Node - REAL implementation (v35.0)
 * 
 * Uses the MemoryAgent from the main branch with:
 * - store_memory: Generates embedding and stores in episodic_memory table
 * - recall_memory: Semantic search using cosine similarity on embeddings
 */
async function memoryAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] MemoryAgent executing (v35.0 - Real Vector Search)...");

  try {
    const agent = await createMemoryAgent();

    const lastHumanMessage = state.messages
      .slice()
      .reverse()
      .find((m) => m._getType() === "human");

    const goal = lastHumanMessage?.content?.toString() || "Manage memory";

    const agentResult = await agent.invoke({
      messages: [new HumanMessage(goal)],
    });

    const lastAgentMessage = agentResult.messages
      .slice()
      .reverse()
      .find((m: BaseMessage) => m._getType() === "ai");

    const agentResponse = lastAgentMessage?.content?.toString() || "Memory operation completed";

    console.log("[Supervisor] MemoryAgent completed:", agentResponse.substring(0, 200));

    return {
      next: END,
      messages: [new AIMessage(`MemoryAgent (v35.0): ${agentResponse}`)],
    };
  } catch (error) {
    console.error("[Supervisor] MemoryAgent error:", error);
    return {
      next: END,
      messages: [
        new AIMessage(
          `MemoryAgent error: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
      ],
    };
  }
}

/**
 * Validation Agent Node - REAL ReAct implementation (v40.0)
 *
 * Uses createValidationAgent() which implements the ReAct pattern with:
 * - execute_code_in_sandbox: Runs code and measures empirical fitness
 * - run_typescript_check: Static type checking
 * - calculate_fitness_score: Normalized score aggregation
 */
async function validationAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] ValidationAgent executing (ReAct v40.0)...");

  try {
    const agent = await createValidationAgent();

    const lastHumanMessage = state.messages
      .slice()
      .reverse()
      .find((m) => m._getType() === "human");

    const goal = lastHumanMessage?.content?.toString() || "Validate the system";

    const agentResult = await agent.invoke({
      messages: [
        new HumanMessage(
          `Validate the following goal/code and calculate an empirical fitness score:\n\n${goal}`
        ),
      ],
    });

    const lastAgentMessage = agentResult.messages
      .slice()
      .reverse()
      .find((m: BaseMessage) => m._getType() === "ai");

    const agentResponse = lastAgentMessage?.content?.toString() || "Validation completed";

    console.log("[Supervisor] ValidationAgent completed:", agentResponse.substring(0, 200));

    return {
      next: "archive",
      messages: [new AIMessage(`ValidationAgent (ReAct): ${agentResponse}`)],
    };
  } catch (error) {
    console.error("[Supervisor] ValidationAgent error:", error);
    return {
      next: "archive",
      messages: [
        new AIMessage(
          `ValidationAgent error: ${error instanceof Error ? error.message : "Unknown error"}. Fitness score: 0.0`
        ),
      ],
    };
  }
}

/**
 * Archive Node Wrapper - Adapts archiveNode to StateGraph signature
 */
async function archiveNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] ArchiveNode executing...");

  const adaptedState = {
    messages: state.messages.map((msg) => ({
      role: msg._getType() === "human" ? "user" : "assistant",
      content: msg.content.toString(),
    })),
    currentNode: "archive",
    threadId: state.messages[0]?.id || `thread-${Date.now()}`,
    parentId: null,
  };

  const result = await archiveNodeImpl(adaptedState);

  return {
    next: END,
    messages:
      result.messages?.slice(-1).map((msg) => new AIMessage(msg.content)) || [],
  };
}

/**
 * Build and compile the Supervisor graph
 *
 * v41.0: Full DGM loop with real agents
 * - code_agent → validation_agent → archive (for implementation tasks)
 * - memory_agent → END (for memory tasks)
 * - validation_agent → archive → END (for validation tasks)
 */
export function buildSupervisorGraph() {
  const checkpointer = new MySqlCheckpointer();

  const workflow = new StateGraph(SupervisorState)
    .addNode("router", routerNode)
    .addNode("code_agent", codeAgentNode)
    .addNode("memory_agent", memoryAgentNode)
    .addNode("validation_agent", validationAgentNode)
    .addNode("archive", archiveNode)

    .addEdge(START, "router")

    // v40.0 fix: Include END in the conditional edges map
    .addConditionalEdges("router", (state) => state.next, {
      code_agent: "code_agent",
      memory_agent: "memory_agent",
      validation_agent: "validation_agent",
      END: END,
    })

    // code_agent routes to validation for fitness scoring
    .addConditionalEdges("code_agent", (state) => state.next, {
      validation_agent: "validation_agent",
      END: END,
    })

    .addEdge("memory_agent", END)
    .addEdge("validation_agent", "archive")
    .addEdge("archive", END);

  const app = workflow.compile({ checkpointer });
  return app;
}

/**
 * Invoke the supervisor with a goal
 */
export async function invokeSupervisor(goal: string, threadId: string) {
  const app = buildSupervisorGraph();

  const config = {
    configurable: { thread_id: threadId },
  };

  const result = await app.invoke(
    { messages: [new HumanMessage(goal)] },
    config
  );

  return result;
}

/**
 * Get the state history for a thread
 */
export async function getSupervisorStatus(threadId: string) {
  const app = buildSupervisorGraph();

  const config = {
    configurable: { thread_id: threadId },
  };

  const stateHistory = [];
  for await (const state of app.getStateHistory(config)) {
    stateHistory.push(state);
  }

  return stateHistory;
}
