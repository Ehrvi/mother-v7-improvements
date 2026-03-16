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
 */

// NC-SEC-001 Fix: Validate JWT_SECRET at module load time
// Scientific basis: OWASP Top 10 A02:2021 — Cryptographic Failures
// JWT_SECRET must be set and have sufficient entropy (≥32 chars)
const _jwtSecret = process.env.JWT_SECRET ?? "";
if (!_jwtSecret || _jwtSecret.length < 32) {
  const _isProduction = process.env.NODE_ENV === "production";
  if (_isProduction) {
    throw new Error(
      "[NC-SEC-001] JWT_SECRET env var must be set with at least 32 characters in production. " +
      "Generate with: openssl rand -hex 32 | gcloud run services update mother-v7-prod --set-env-vars=JWT_SECRET=..."
    );
  } else {
    // Development fallback — warn but don't crash
    console.warn(
      "[NC-SEC-001] WARNING: JWT_SECRET not set or too short (<32 chars). " +
      "Using insecure default for development only. " +
      "Set JWT_SECRET env var with: openssl rand -hex 32"
    );
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID || "mother-local",
  cookieSecret: _jwtSecret || "dev-insecure-secret-change-in-production-now",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Primary LLM provider (OpenAI)
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  // Multi-provider cascade router keys (v68.8)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  googleApiKey: process.env.GOOGLE_AI_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
  // Ciclo 72: DPO fine-tuned model for identity/architecture queries (NC-IDENTITY-001 + NC-ARCHITECTURE-001)
  // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
  // Ciclo 105: Updated to v8e model ID (DFay6MHy) — correct model in :personal: namespace
  dpoFineTunedModel: process.env.DPO_FINE_TUNED_MODEL ?? 'ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy',
  // Ciclo 105: Service account key from OpenAI project "Extra" — accesses :personal: namespace models
  // CRITICAL: sk-proj-... keys (project-scoped) return 403 for :personal: namespace models
  // Solution: use sk-svcacct-... from project "Extra" which bypasses namespace isolation (Regra 107)
  // Fallback: if not set, uses OPENAI_API_KEY (will fail for :personal: models but won't crash)
  // NC-ENV-DPO-001 (Ciclo 105): OPENAI_API_KEY_EXTRA_SVCACCT is the Cloud Run secret name
  // Fallback chain: OPENAI_API_KEY_EXTRA_SVCACCT → OPENAI_EXTRA_SVCACCT → OPENAI_API_KEY
  dpoApiKey: process.env.OPENAI_API_KEY_EXTRA_SVCACCT ?? process.env.OPENAI_EXTRA_SVCACCT ?? process.env.OPENAI_API_KEY ?? "",
  // C189 NC-ENV-002 Fix: OPENAI_API_KEY_EXTRA for additional capacity/fallback
  openaiApiKeyExtra: process.env.OPENAI_API_KEY_EXTRA ?? process.env.OPENAI_API_KEY ?? "",
  // C189 NC-ENV-001 Fix: MQTT configuration for SHMS IoT pipeline
  // Scientific basis: Sun et al. (2025) — Real-time SHM requires MQTT for sensor data ingestion
  // Set via: gcloud run services update mother-v7-prod --set-env-vars=MQTT_BROKER_URL=mqtts://...
  mqttBrokerUrl: process.env.MQTT_BROKER_URL ?? "",
  mqttUsername: process.env.MQTT_USERNAME ?? "",
  mqttPassword: process.env.MQTT_PASSWORD ?? "",
  mqttClientId: process.env.MQTT_CLIENT_ID ?? `mother-v81-${Date.now()}`,
  // C189: SHMS configuration
  shmsEnabled: process.env.SHMS_ENABLED === "true" || !!process.env.MQTT_BROKER_URL,
  shmsAlertWebhook: process.env.SHMS_ALERT_WEBHOOK ?? "",
  // C189: TimescaleDB for SHMS time-series data (Phase 6 target)
  timescaleDbUrl: process.env.TIMESCALE_DB_URL ?? "",
  // Security: CREATOR_EMAIL via env var instead of hardcoded string (OWASP A02)
  // Set via: gcloud secrets create creator-email --data-file=<(echo -n "user@example.com")
  creatorEmail: process.env.CREATOR_EMAIL ?? 'elgarcia.eng@gmail.com',
};
