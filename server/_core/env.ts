/**
 * MOTHER v68.8 - Environment Variables
 * Multi-provider API keys added for cascade router architecture
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
  // Job: ftjob-CSfkN1jaB2KwqANkgsVzTEFD (status: succeeded, 2026-03-01)
  dpoFineTunedModel: process.env.DPO_FINE_TUNED_MODEL ?? 'ft:gpt-4o-mini-2024-07-18:personal:mother-v76-identity-architecture-ciclo70:DEPn6tAD',
};
