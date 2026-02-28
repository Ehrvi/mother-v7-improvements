/**
 * MOTHER v68.8 - Multi-Provider LLM Dispatcher
 * 
 * Supports: OpenAI, Anthropic, Google (Gemini), DeepSeek, Mistral
 * 
 * Scientific Basis:
 * - RouteLLM (Ong et al., 2024): multi-provider routing reduces cost by 40-98%
 * - LLMRouterBench (Hu et al., 2026): unified framework for multi-provider LLM routing
 * 
 * Architecture: Each provider has a dedicated invoker function that handles
 * the provider-specific API format, authentication, and response normalization.
 * All providers return the same InvokeResult interface for seamless integration.
 */

import { ENV } from "./env";
import type { LLMProvider } from "../mother/intelligence";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  model?: string;
  provider?: LLMProvider;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  // v69.5: Token streaming callback (SUG-001)
  // Scientific basis: OpenAI Streaming API; TokenFlow (Zheng et al., 2024)
  onChunk?: (chunk: string) => void;
  // v69.15: Per-tier temperature fine-tuning (Ciclo 34)
  // Scientific basis: Peeperkorn et al. (2024, arXiv:2405.00492): factual tasks → T≤0.4; creative → T≥0.6
  // ACL Findings 2024: optimal T for problem-solving is 0.2-0.4 for factual, 0.6-0.8 for generative
  temperature?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ─── Message Normalization ────────────────────────────────────────────────────

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") return { type: "text", text: part };
  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return { role, name, content: contentParts[0].text };
  }

  return { role, name, content: contentParts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) throw new Error("tool_choice 'required' was provided but no tools were configured");
    if (tools.length > 1) throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
    return { type: "function", function: { name: tools[0].function.name } };
  }

  if ("name" in toolChoice) return { type: "function", function: { name: toolChoice.name } };
  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat, response_format, outputSchema, output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) throw new Error("outputSchema requires both name and schema");

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ─── Provider: OpenAI (and OpenAI-compatible: DeepSeek) ──────────────────────

async function invokeOpenAICompatible(
  params: InvokeParams,
  apiUrl: string,
  apiKey: string
): Promise<InvokeResult> {
  const { messages, tools, toolChoice, tool_choice, outputSchema, output_schema, responseFormat, response_format } = params;

  const payload: Record<string, unknown> = {
    model: params.model || "gpt-4o",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) payload.tools = tools;

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;

  const model = (params.model || "gpt-4o").toLowerCase();
  if (model.includes('gpt-4o')) {
    payload.max_tokens = 16384;
  } else if (model.includes('gpt-4')) {
    payload.max_tokens = 8192;
  } else {
    payload.max_tokens = 8192;
  }

  // v69.15: Apply per-tier temperature (Ciclo 34 Fine-Tuning)
  // Scientific basis: Peeperkorn et al. (2024, arXiv:2405.00492)
  if (params.temperature !== undefined) {
    payload.temperature = params.temperature;
  }

  const normalizedResponseFormat = normalizeResponseFormat({ responseFormat, response_format, outputSchema, output_schema });
  if (normalizedResponseFormat) payload.response_format = normalizedResponseFormat;

  // v69.5: Token streaming (SUG-001) — if onChunk callback provided, stream tokens
  if (params.onChunk) {
    payload.stream = true;
    const streamResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      throw new Error(`OpenAI-compatible streaming failed: ${streamResponse.status} ${streamResponse.statusText} – ${errorText}`);
    }
    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let totalTokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) { fullContent += delta; params.onChunk!(delta); }
          if (parsed.usage) totalTokens = parsed.usage.total_tokens || 0;
        } catch { /* skip malformed chunks */ }
      }
    }
    return {
      id: 'stream-' + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: params.model || 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: fullContent }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: totalTokens },
    };
  }

  // v69.9: 90-second timeout to prevent hanging requests (RC-3 fix)
  // Scientific basis: P99 latency SLO for LLM APIs (Agrawal et al., arXiv:2401.00821, 2024)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') throw new Error(`LLM request timed out after 90s (model: ${params.model})`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

// ─── Provider: Anthropic (Claude) ────────────────────────────────────────────

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const modelName = params.model || "claude-opus-4-5";

  // Separate system message from conversation messages
  const systemMessages = params.messages.filter(m => m.role === "system");
  const conversationMessages = params.messages.filter(m => m.role !== "system");

  const systemPrompt = systemMessages.map(m =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  ).join("\n\n");

  // Normalize messages for Anthropic format
  const anthropicMessages = conversationMessages.map(msg => {
    const content = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(c => typeof c === "string" ? c : JSON.stringify(c)).join("")
        : JSON.stringify(msg.content);

    return {
      role: msg.role === "assistant" ? "assistant" : "user",
      content,
    };
  });

  // Convert tools to Anthropic format
  const anthropicTools = params.tools?.map(t => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));

    const payload: Record<string, unknown> = {
    model: modelName,
    max_tokens: 4096, // v69.5: Reduced from 8192 to 4096 to improve TTFT for code queries
    messages: anthropicMessages,
  };
  if (systemPrompt) payload.system = systemPrompt;
  if (anthropicTools && anthropicTools.length > 0) payload.tools = anthropicTools;
  
  // v69.5: Anthropic streaming support (SUG-001)
  if (params.onChunk) {
    payload.stream = true;
    const streamResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      throw new Error(`Anthropic streaming failed: ${streamResponse.status} ${streamResponse.statusText} – ${errorText}`);
    }
    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const chunk = parsed.delta.text || '';
            if (chunk) { fullContent += chunk; params.onChunk!(chunk); }
          }
          if (parsed.type === 'message_delta' && parsed.usage) {
            outputTokens = parsed.usage.output_tokens || 0;
          }
          if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens || 0;
          }
        } catch { /* skip malformed chunks */ }
      }
    }
    return {
      id: 'anthropic-stream-' + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{ index: 0, message: { role: 'assistant', content: fullContent }, finish_reason: 'stop' }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    };
  }
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const anthropicResult = await response.json() as {
    id: string;
    type: string;
    role: string;
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    model: string;
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  // Normalize to OpenAI-compatible InvokeResult format
  const textContent = anthropicResult.content
    .filter(c => c.type === "text")
    .map(c => c.text || "")
    .join("");

  const toolCalls: ToolCall[] = anthropicResult.content
    .filter(c => c.type === "tool_use")
    .map(c => ({
      id: c.id || `tool_${Date.now()}`,
      type: "function" as const,
      function: {
        name: c.name || "",
        arguments: JSON.stringify(c.input || {}),
      },
    }));

  return {
    id: anthropicResult.id,
    created: Math.floor(Date.now() / 1000),
    model: anthropicResult.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: anthropicResult.stop_reason,
    }],
    usage: {
      prompt_tokens: anthropicResult.usage.input_tokens,
      completion_tokens: anthropicResult.usage.output_tokens,
      total_tokens: anthropicResult.usage.input_tokens + anthropicResult.usage.output_tokens,
    },
  };
}

// ─── Provider: Google (Gemini) ────────────────────────────────────────────────

async function invokeGoogle(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.googleApiKey) throw new Error("GOOGLE_AI_API_KEY is not configured");

  const modelName = params.model || "gemini-2.5-flash";

  // Separate system message
  const systemMessages = params.messages.filter(m => m.role === "system");
  const conversationMessages = params.messages.filter(m => m.role !== "system");

  const systemInstruction = systemMessages.map(m =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  ).join("\n\n");

  // Convert to Gemini format
  const geminiContents = conversationMessages.map(msg => {
    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(c => typeof c === "string" ? c : JSON.stringify(c)).join("")
        : JSON.stringify(msg.content);

    return {
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    };
  });

  const payload: Record<string, unknown> = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Convert tools to Gemini format
  if (params.tools && params.tools.length > 0) {
    payload.tools = [{
      functionDeclarations: params.tools.map(t => ({
        name: t.function.name,
        description: t.function.description || "",
        parameters: t.function.parameters || { type: "OBJECT", properties: {} },
      })),
    }];
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${ENV.googleApiKey}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google AI invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const geminiResult = await response.json() as {
    candidates: Array<{
      content: { parts: Array<{ text?: string; functionCall?: { name: string; args: unknown } }>; role: string };
      finishReason: string;
    }>;
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
  };

  const candidate = geminiResult.candidates[0];
  const textContent = candidate.content.parts
    .filter(p => p.text)
    .map(p => p.text || "")
    .join("");

  const toolCalls: ToolCall[] = candidate.content.parts
    .filter(p => p.functionCall)
    .map((p, i) => ({
      id: `call_${i}_${Date.now()}`,
      type: "function" as const,
      function: {
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args || {}),
      },
    }));

  return {
    id: `gemini_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: candidate.finishReason,
    }],
    usage: {
      prompt_tokens: geminiResult.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiResult.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResult.usageMetadata?.totalTokenCount || 0,
    },
  };
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const provider = params.provider || 'openai';
  const model = params.model || 'gpt-4o';

  switch (provider) {
    case 'openai':
      if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
      return invokeOpenAICompatible(params, "https://api.openai.com/v1/chat/completions", ENV.openaiApiKey);

    case 'deepseek':
      // NC-PROVIDER-001 (Ciclo 52): Graceful fallback to OpenAI gpt-4o-mini when DeepSeek key absent
      // Scientific basis: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cascade fallback
      if (!ENV.deepseekApiKey) {
        if (!ENV.openaiApiKey) throw new Error("DEEPSEEK_API_KEY is not configured (fallback OPENAI_API_KEY also missing)");
        console.warn('[LLM] DeepSeek key absent — falling back to gpt-4o-mini (NC-PROVIDER-001)');
        return invokeOpenAICompatible(
          { ...params, model: 'gpt-4o-mini' },
          "https://api.openai.com/v1/chat/completions",
          ENV.openaiApiKey
        );
      }
      return invokeOpenAICompatible(
        { ...params, model: model || 'deepseek-chat' },
        "https://api.deepseek.com/v1/chat/completions",
        ENV.deepseekApiKey
      );

    case 'anthropic':
      // NC-PROVIDER-001 (Ciclo 53): Graceful fallback to OpenAI when Anthropic key absent
      // Scientific basis: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cascade fallback
      if (!ENV.anthropicApiKey) {
        if (!ENV.openaiApiKey) throw new Error('ANTHROPIC_API_KEY is not configured (fallback OPENAI_API_KEY also missing)');
        console.warn('[LLM] NC-PROVIDER-001: Anthropic key absent — auto-fallback to gpt-4o-mini');
        return invokeOpenAICompatible(
          { ...params, model: 'gpt-4o-mini' },
          'https://api.openai.com/v1/chat/completions',
          ENV.openaiApiKey
        );
      }
      return invokeAnthropic(params);

    case 'google':
      // NC-PROVIDER-001 (Ciclo 53): Graceful fallback to OpenAI when Google key absent
      // Scientific basis: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cascade fallback
      if (!ENV.googleApiKey) {
        if (!ENV.openaiApiKey) throw new Error('GOOGLE_AI_API_KEY is not configured (fallback OPENAI_API_KEY also missing)');
        console.warn('[LLM] NC-PROVIDER-001: Google AI key absent — auto-fallback to gpt-4o-mini');
        return invokeOpenAICompatible(
          { ...params, model: 'gpt-4o-mini' },
          'https://api.openai.com/v1/chat/completions',
          ENV.openaiApiKey
        );
      }
      return invokeGoogle(params);

    case 'mistral':
      // NC-PROVIDER-001 (Ciclo 52): Graceful fallback to OpenAI when Mistral key absent
      if (!ENV.mistralApiKey) {
        if (!ENV.openaiApiKey) throw new Error("MISTRAL_API_KEY not configured; fallback OPENAI_API_KEY also missing");
        console.warn('[LLM] NC-PROVIDER-001: Mistral key absent — auto-fallback to gpt-4o-mini');
        return invokeOpenAICompatible(
          { ...params, model: 'gpt-4o-mini' },
          "https://api.openai.com/v1/chat/completions",
          ENV.openaiApiKey
        );
      }
      return invokeOpenAICompatible(
        { ...params, model: model || 'mistral-small-latest' },
        "https://api.mistral.ai/v1/chat/completions",
        ENV.mistralApiKey
      );

    default:
      // Fallback to OpenAI for unknown providers
      if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
      return invokeOpenAICompatible(params, "https://api.openai.com/v1/chat/completions", ENV.openaiApiKey);
  }
}
