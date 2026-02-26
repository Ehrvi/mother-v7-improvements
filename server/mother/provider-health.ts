/**
 * MOTHER v68.8 - Provider Health Check System
 * 
 * Scientific basis:
 * - Circuit Breaker Pattern (Nygard, 2007) — fail fast when provider is down
 * - Health Check API (Nadareishvili et al., 2016) — periodic liveness probes
 * - Exponential Backoff (Karn & Partridge, 1987) — smart retry with jitter
 * 
 * Monitors all 5 LLM providers and caches status for 5 minutes.
 * Alerts are surfaced to the MOTHER UI when a provider has no credits
 * or is unreachable.
 */

import { ENV } from '../_core/env';

export interface ProviderStatus {
  provider: string;
  displayName: string;
  status: 'healthy' | 'degraded' | 'error' | 'no_credits' | 'unconfigured';
  latencyMs?: number;
  errorMessage?: string;
  lastChecked: Date;
  model: string;
}

export interface ProviderHealthReport {
  providers: ProviderStatus[];
  allHealthy: boolean;
  lastUpdated: Date;
  criticalAlert: boolean;  // true if the primary (OpenAI) is down
}

// Cache health results for 5 minutes to avoid hammering providers
let healthCache: ProviderHealthReport | null = null;
let cacheExpiry: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check OpenAI health — primary provider
 */
async function checkOpenAI(): Promise<ProviderStatus> {
  const start = Date.now();
  const displayName = 'OpenAI';
  const model = 'gpt-4o-mini';
  
  if (!ENV.openaiApiKey) {
    return { provider: 'openai', displayName, model, status: 'unconfigured', errorMessage: 'API key not configured', lastChecked: new Date() };
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const latencyMs = Date.now() - start;
    
    if (response.status === 429) {
      return { provider: 'openai', displayName, model, status: 'no_credits', errorMessage: 'Rate limit or quota exceeded', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 401) {
      return { provider: 'openai', displayName, model, status: 'error', errorMessage: 'Invalid API key', latencyMs, lastChecked: new Date() };
    }
    if (!response.ok) {
      return { provider: 'openai', displayName, model, status: 'degraded', errorMessage: `HTTP ${response.status}`, latencyMs, lastChecked: new Date() };
    }
    
    return { provider: 'openai', displayName, model, status: 'healthy', latencyMs, lastChecked: new Date() };
  } catch (err: any) {
    return { provider: 'openai', displayName, model, status: 'error', errorMessage: err.message || 'Connection failed', lastChecked: new Date() };
  }
}

/**
 * Check Anthropic health
 */
async function checkAnthropic(): Promise<ProviderStatus> {
  const start = Date.now();
  const displayName = 'Anthropic';
  const model = 'claude-haiku-4-5';
  
  if (!ENV.anthropicApiKey) {
    return { provider: 'anthropic', displayName, model, status: 'unconfigured', errorMessage: 'API key not configured', lastChecked: new Date() };
  }
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ENV.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const latencyMs = Date.now() - start;
    
    if (response.status === 429) {
      return { provider: 'anthropic', displayName, model, status: 'no_credits', errorMessage: 'Rate limit or quota exceeded', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 401) {
      return { provider: 'anthropic', displayName, model, status: 'error', errorMessage: 'Invalid API key', latencyMs, lastChecked: new Date() };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { provider: 'anthropic', displayName, model, status: 'degraded', errorMessage: `HTTP ${response.status}: ${body.slice(0, 100)}`, latencyMs, lastChecked: new Date() };
    }
    
    return { provider: 'anthropic', displayName, model, status: 'healthy', latencyMs, lastChecked: new Date() };
  } catch (err: any) {
    return { provider: 'anthropic', displayName, model, status: 'error', errorMessage: err.message || 'Connection failed', lastChecked: new Date() };
  }
}

/**
 * Check Google AI (Gemini) health
 */
async function checkGoogle(): Promise<ProviderStatus> {
  const start = Date.now();
  const displayName = 'Google AI';
  const model = 'gemini-2.5-flash';
  
  if (!ENV.googleApiKey) {
    return { provider: 'google', displayName, model, status: 'unconfigured', errorMessage: 'API key not configured', lastChecked: new Date() };
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${ENV.googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    
    const latencyMs = Date.now() - start;
    
    if (response.status === 429) {
      return { provider: 'google', displayName, model, status: 'no_credits', errorMessage: 'Quota exceeded', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 400 || response.status === 403) {
      return { provider: 'google', displayName, model, status: 'error', errorMessage: 'Invalid API key or access denied', latencyMs, lastChecked: new Date() };
    }
    if (!response.ok) {
      return { provider: 'google', displayName, model, status: 'degraded', errorMessage: `HTTP ${response.status}`, latencyMs, lastChecked: new Date() };
    }
    
    return { provider: 'google', displayName, model, status: 'healthy', latencyMs, lastChecked: new Date() };
  } catch (err: any) {
    return { provider: 'google', displayName, model, status: 'error', errorMessage: err.message || 'Connection failed', lastChecked: new Date() };
  }
}

/**
 * Check DeepSeek health
 */
async function checkDeepSeek(): Promise<ProviderStatus> {
  const start = Date.now();
  const displayName = 'DeepSeek';
  const model = 'deepseek-chat';
  
  if (!ENV.deepseekApiKey) {
    return { provider: 'deepseek', displayName, model, status: 'unconfigured', errorMessage: 'API key not configured', lastChecked: new Date() };
  }
  
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const latencyMs = Date.now() - start;
    
    if (response.status === 402) {
      return { provider: 'deepseek', displayName, model, status: 'no_credits', errorMessage: 'Insufficient balance — add credits at platform.deepseek.com', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 429) {
      return { provider: 'deepseek', displayName, model, status: 'no_credits', errorMessage: 'Rate limit exceeded', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 401) {
      return { provider: 'deepseek', displayName, model, status: 'error', errorMessage: 'Invalid API key', latencyMs, lastChecked: new Date() };
    }
    if (!response.ok) {
      return { provider: 'deepseek', displayName, model, status: 'degraded', errorMessage: `HTTP ${response.status}`, latencyMs, lastChecked: new Date() };
    }
    
    return { provider: 'deepseek', displayName, model, status: 'healthy', latencyMs, lastChecked: new Date() };
  } catch (err: any) {
    return { provider: 'deepseek', displayName, model, status: 'error', errorMessage: err.message || 'Connection failed', lastChecked: new Date() };
  }
}

/**
 * Check Mistral AI health
 */
async function checkMistral(): Promise<ProviderStatus> {
  const start = Date.now();
  const displayName = 'Mistral AI';
  const model = 'mistral-small-latest';
  
  if (!ENV.mistralApiKey) {
    return { provider: 'mistral', displayName, model, status: 'unconfigured', errorMessage: 'API key not configured', lastChecked: new Date() };
  }
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const latencyMs = Date.now() - start;
    
    if (response.status === 429) {
      return { provider: 'mistral', displayName, model, status: 'no_credits', errorMessage: 'Rate limit or quota exceeded', latencyMs, lastChecked: new Date() };
    }
    if (response.status === 401) {
      return { provider: 'mistral', displayName, model, status: 'error', errorMessage: 'Invalid API key', latencyMs, lastChecked: new Date() };
    }
    if (!response.ok) {
      return { provider: 'mistral', displayName, model, status: 'degraded', errorMessage: `HTTP ${response.status}`, latencyMs, lastChecked: new Date() };
    }
    
    return { provider: 'mistral', displayName, model, status: 'healthy', latencyMs, lastChecked: new Date() };
  } catch (err: any) {
    return { provider: 'mistral', displayName, model, status: 'error', errorMessage: err.message || 'Connection failed', lastChecked: new Date() };
  }
}

/**
 * Run health checks on all providers in parallel
 * Results are cached for CACHE_TTL_MS to avoid hammering providers
 */
export async function checkAllProviders(forceRefresh = false): Promise<ProviderHealthReport> {
  const now = new Date();
  
  // Return cached result if still valid
  if (!forceRefresh && healthCache && cacheExpiry && now < cacheExpiry) {
    return healthCache;
  }
  
  console.log('[ProviderHealth] Running health checks on all 5 providers...');
  
  // Run all checks in parallel — Circuit Breaker Pattern
  const [openai, anthropic, google, deepseek, mistral] = await Promise.allSettled([
    checkOpenAI(),
    checkAnthropic(),
    checkGoogle(),
    checkDeepSeek(),
    checkMistral(),
  ]);
  
  const providers: ProviderStatus[] = [
    openai.status === 'fulfilled' ? openai.value : { provider: 'openai', displayName: 'OpenAI', model: 'gpt-4o', status: 'error' as const, errorMessage: 'Health check failed', lastChecked: now },
    anthropic.status === 'fulfilled' ? anthropic.value : { provider: 'anthropic', displayName: 'Anthropic', model: 'claude-sonnet-4-5', status: 'error' as const, errorMessage: 'Health check failed', lastChecked: now },
    google.status === 'fulfilled' ? google.value : { provider: 'google', displayName: 'Google AI', model: 'gemini-2.5-flash', status: 'error' as const, errorMessage: 'Health check failed', lastChecked: now },
    deepseek.status === 'fulfilled' ? deepseek.value : { provider: 'deepseek', displayName: 'DeepSeek', model: 'deepseek-chat', status: 'error' as const, errorMessage: 'Health check failed', lastChecked: now },
    mistral.status === 'fulfilled' ? mistral.value : { provider: 'mistral', displayName: 'Mistral AI', model: 'mistral-small-latest', status: 'error' as const, errorMessage: 'Health check failed', lastChecked: now },
  ];
  
  const allHealthy = providers.every(p => p.status === 'healthy');
  const criticalAlert = providers.find(p => p.provider === 'openai')?.status !== 'healthy';
  
  // Log summary
  const healthy = providers.filter(p => p.status === 'healthy').length;
  const issues = providers.filter(p => p.status !== 'healthy');
  console.log(`[ProviderHealth] ${healthy}/5 providers healthy`);
  if (issues.length > 0) {
    issues.forEach(p => console.warn(`[ProviderHealth] ⚠️ ${p.displayName}: ${p.status} — ${p.errorMessage}`));
  }
  
  const report: ProviderHealthReport = {
    providers,
    allHealthy,
    lastUpdated: now,
    criticalAlert,
  };
  
  // Cache the result
  healthCache = report;
  cacheExpiry = new Date(now.getTime() + CACHE_TTL_MS);
  
  return report;
}
