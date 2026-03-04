/**
 * MOTHER v68.8 - Environment Variables
 * Multi-provider API keys added for cascade router architecture
 * Ciclo 105: Added dpoApiKey — service account key from OpenAI project "Extra"
 *   Required because DPO v8e model is in :personal: namespace, not accessible via sk-proj-... keys
 *   Discovery: Everton Garcia, 04/03/2026 (AWAKE V207, Regra 107)
 */
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
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
  dpoApiKey: process.env.OPENAI_API_KEY_EXTRA_SVCACCT ?? process.env.OPENAI_API_KEY ?? "",
};
