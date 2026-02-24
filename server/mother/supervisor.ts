/**
 * MOTHER v40.0: Supervisor - Darwin Gödel Machine (DGM) Orchestrator
 *
 * This supervisor coordinates multiple worker agents (CodeAgent, MemoryAgent, ValidationAgent)
 * using LangGraph's StateGraph architecture with persistent MySQL checkpointing.
 *
 * Architecture:
 * - StateGraph: Defines the workflow graph with conditional routing
 * - SupervisorState: Shared state with messages and next field for routing
 * - MySqlCheckpointer: Persistent state storage in TiDB/MySQL
 * - Workers: Specialized agents for code manipulation, memory management, and validation
 *
 * Scientific basis:
 * - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954)
 * - ReAct: Synergizing Reasoning and Acting (Yao et al., ICLR 2023)
 * - LangGraph multi-agent supervisor pattern
 *
 * v40.0 Changes:
 * - Fixed: "Branch condition returned unknown or null destination" when router returns "END"
 * - Integrated: Real ValidationAgent (ReAct) with empirical fitness scoring
 * - Improved: ArchiveNode now receives fitness score from ValidationAgent output
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MySqlCheckpointer } from "./checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { archiveNode as archiveNodeImpl } from "./archive_node";
import { createValidationAgent } from "./validation_agent";

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
      "The next worker to invoke. Choose 'code_agent' for code manipulation tasks, 'memory_agent' for storing/recalling information, 'validation_agent' for testing/benchmarking, or 'END' if the goal is already achieved."
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
 * Code Agent Node - Placeholder (will be replaced with actual ReAct CodeAgent in v40.1)
 */
async function codeAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] CodeAgent executing...");
  return {
    next: END,
    messages: [new AIMessage("CodeAgent: Task completed (placeholder - v40.1 will implement ReAct CodeAgent)")],
  };
}

/**
 * Memory Agent Node - Placeholder (will be replaced with actual ReAct MemoryAgent in v40.2)
 */
async function memoryAgentNode(state: typeof SupervisorState.State) {
  console.log("[Supervisor] MemoryAgent executing...");
  return {
    next: END,
    messages: [new AIMessage("MemoryAgent: Task completed (placeholder - v40.2 will implement ReAct MemoryAgent with vector search)")],
  };
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

    // Extract the goal/code from the last human message
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

    // Extract the last AI message from the agent
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
 * v40.0 fix: Added END to the conditional edges map to prevent
 * "Branch condition returned unknown or null destination" error.
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

    // FIX v40.0: Include END in the conditional edges map
    .addConditionalEdges("router", (state) => state.next, {
      code_agent: "code_agent",
      memory_agent: "memory_agent",
      validation_agent: "validation_agent",
      END: END,
    })

    .addEdge("code_agent", END)
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
