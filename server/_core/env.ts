/**
 * MOTHER v81.8 - Environment Variables
 * Multi-provider API keys added for cascade router architecture
 * Ciclo 105: Added dpoApiKey — service account key from OpenAI project "Extra"
 *   Required because DPO v8e model is in :personal: namespace, not accessible via sk-proj-... keys
 *   Discovery: Everton Garcia, 04/03/2026 (AWAKE V207, Regra 107)
 *
 * C189 Phase 5 — NC-SEC-001 Fix:
 *   Added JWT_SECRET validation at startup (OWASP A02:2021 — Cryptographic Failures)
 *   Added MQTT env vars for SHMS IoT pipeline (NC-ENV-001 Fix)
 *   Added OPENAI_API_KEY_EXTRA for DPO fallback (NC-ENV-002 Fix)
 *
 * FIX: ENV now uses LAZY GETTERS instead of static captures.
 * Root cause: ESM import graph evaluates env.ts BEFORE dotenv/config runs,
 * so process.env.OPENAI_API_KEY is "" at import time → all API calls fail with 401.
 * With getters, process.env is read at CALL TIME (after dotenv has loaded).
 */

// NC-SEC-001 Fix: Validate JWT_SECRET (deferred to allow dotenv to load first)
let _jwtSecretChecked = false;
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  if (!_jwtSecretChecked) {
    _jwtSecretChecked = true;
    if (!secret || secret.length < 32) {
      const _isProduction = process.env.NODE_ENV === "production";
      if (_isProduction) {
        throw new Error(
          "[NC-SEC-001] JWT_SECRET env var must be set with at least 32 characters in production. " +
          "Generate with: openssl rand -hex 32 | gcloud run services update mother-v7-prod --set-env-vars=JWT_SECRET=..."
        );
      } else {
        console.warn(
          "[NC-SEC-001] WARNING: JWT_SECRET not set or too short (<32 chars). " +
          "Using insecure default for development only. " +
          "Set JWT_SECRET env var with: openssl rand -hex 32"
        );
      }
    }
  }
  return secret || "dev-insecure-secret-change-in-production-now";
}

/**
 * ENV object with LAZY GETTERS — reads process.env at access time, not import time.
 * This ensures dotenv/config has populated process.env before any values are read.
 */
export const ENV = {
  get appId() { return process.env.VITE_APP_ID || "mother-local"; },
  get cookieSecret() { return getJwtSecret(); },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.OAUTH_SERVER_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  // Primary LLM provider (OpenAI)
  get openaiApiKey() { return process.env.OPENAI_API_KEY ?? ""; },
  // Multi-provider cascade router keys (v68.8)
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY ?? ""; },
  get googleApiKey() { return process.env.GOOGLE_AI_API_KEY ?? ""; },
  get deepseekApiKey() { return process.env.DEEPSEEK_API_KEY ?? ""; },
  get mistralApiKey() { return process.env.MISTRAL_API_KEY ?? ""; },
  // DPO fine-tuned model (Ciclo 105)
  get dpoFineTunedModel() { return process.env.DPO_FINE_TUNED_MODEL ?? 'ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy'; },
  // DPO API key (service account)
  get dpoApiKey() { return process.env.OPENAI_API_KEY_EXTRA_SVCACCT ?? process.env.OPENAI_EXTRA_SVCACCT ?? process.env.OPENAI_API_KEY ?? ""; },
  // Extra OpenAI key
  get openaiApiKeyExtra() { return process.env.OPENAI_API_KEY_EXTRA ?? process.env.OPENAI_API_KEY ?? ""; },
  // MQTT configuration for SHMS IoT pipeline
  get mqttBrokerUrl() { return process.env.MQTT_BROKER_URL ?? ""; },
  get mqttUsername() { return process.env.MQTT_USERNAME ?? ""; },
  get mqttPassword() { return process.env.MQTT_PASSWORD ?? ""; },
  get mqttClientId() { return process.env.MQTT_CLIENT_ID ?? `mother-v81-${Date.now()}`; },
  // SHMS configuration
  get shmsEnabled() { return process.env.SHMS_ENABLED === "true" || !!process.env.MQTT_BROKER_URL; },
  get shmsAlertWebhook() { return process.env.SHMS_ALERT_WEBHOOK ?? ""; },
  // TimescaleDB
  get timescaleDbUrl() { return process.env.TIMESCALE_DB_URL ?? ""; },
  // Creator email
  get creatorEmail() { return process.env.CREATOR_EMAIL ?? 'elgarcia.eng@gmail.com'; },
};
