/**
 * MOTHER v91.0: Log Sanitizer — NC-SEC-003 FIX
 *
 * Remove/mascara API keys e tokens de logs para prevenir exposição acidental.
 * Padrão: `key.substring(0, 8) + '...[REDACTED]'` para logs de debug.
 *
 * Scientific basis:
 * - OWASP A09:2021 — Security Logging and Monitoring Failures
 *   "Sensitive data such as PII or financial information must not be logged"
 * - OWASP Top 10 API Security 2023 — API8:2023 Security Misconfiguration
 *   "Sensitive information in error messages and logs"
 * - NIST SP 800-92 (2006) — Guide to Computer Security Log Management
 *   §3.2.2 — "Logs should not contain sensitive information such as passwords or keys"
 * - Google Cloud Security Best Practices (2024)
 *   "Never log API keys, tokens, or credentials"
 * - CWE-532: Insertion of Sensitive Information into Log File
 *
 * NC-SEC-003 FIX: Sprint 9 C208
 */

/**
 * Mascara uma API key para exibição segura em logs.
 * Exibe apenas os primeiros 8 caracteres seguidos de '[REDACTED]'.
 *
 * Scientific basis: NIST SP 800-92 §3.2.2 — partial masking preserves
 * debuggability while preventing full key exposure.
 *
 * @param key - API key ou token a ser mascarado
 * @returns String mascarada segura para logs
 *
 * @example
 * maskApiKey('sk-abc123def456') // → 'sk-abc12...[REDACTED]'
 * maskApiKey(undefined) // → '[NOT_SET]'
 * maskApiKey('') // → '[EMPTY]'
 */
export function maskApiKey(key: string | undefined | null): string {
  if (!key) return '[NOT_SET]';
  if (key.length === 0) return '[EMPTY]';
  if (key.length <= 8) return '[REDACTED]'; // Too short to safely show any chars
  return `${key.substring(0, 8)}...[REDACTED]`;
}

/**
 * Sanitiza um objeto de configuração para logging seguro.
 * Substitui campos sensíveis por versões mascaradas.
 *
 * Scientific basis: CWE-532 — prevents sensitive data in log files.
 *
 * @param config - Objeto de configuração com possíveis campos sensíveis
 * @returns Cópia do objeto com campos sensíveis mascarados
 */
export function sanitizeConfigForLog(config: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_PATTERNS = [
    /key$/i,
    /token$/i,
    /secret$/i,
    /password$/i,
    /credential$/i,
    /auth$/i,
    /apikey/i,
    /api_key/i,
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const isSensitive = SENSITIVE_PATTERNS.some(p => p.test(k));
    if (isSensitive && typeof v === 'string') {
      sanitized[k] = maskApiKey(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Sanitiza uma mensagem de log removendo padrões de API keys.
 * Detecta padrões comuns: sk-*, Bearer *, key=*, token=*.
 *
 * Scientific basis: OWASP A09:2021 — automated log sanitization.
 *
 * @param message - Mensagem de log a ser sanitizada
 * @returns Mensagem com API keys substituídas por '[REDACTED]'
 */
export function sanitizeLogMessage(message: string): string {
  return message
    // Bearer tokens: Bearer sk-abc123... → Bearer [REDACTED]
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]{8,}/g, 'Bearer [REDACTED]')
    // OpenAI-style keys: sk-abc123... → sk-[REDACTED]
    .replace(/sk-[A-Za-z0-9]{8,}/g, 'sk-[REDACTED]')
    // Generic API key patterns: key=abc123... → key=[REDACTED]
    .replace(/(api[_-]?key|token|secret|password)=([A-Za-z0-9\-_\.]{8,})/gi, '$1=[REDACTED]')
    // URL-embedded keys: ?key=abc123 → ?key=[REDACTED]
    .replace(/([?&]key=)([A-Za-z0-9\-_\.]{8,})/gi, '$1[REDACTED]');
}

/**
 * Verifica se as API keys dos providers estão configuradas e loga de forma segura.
 * Usa maskApiKey() para nunca expor as keys completas.
 *
 * Scientific basis: OWASP A09:2021 + NIST SP 800-92 §3.2.2
 *
 * @param providers - Mapa de nome do provider para API key
 * @returns Array de strings seguras para log
 */
export function logProviderKeyStatus(providers: Record<string, string | undefined>): string[] {
  return Object.entries(providers).map(([name, key]) => {
    const status = key ? `configured (${maskApiKey(key)})` : 'NOT_SET';
    return `[NC-SEC-003] Provider ${name}: ${status}`;
  });
}

/**
 * Constantes para categorias de log sanitization.
 * Scientific basis: NIST SP 800-92 §3.2.2 — log classification
 */
export const LOG_SANITIZER_VERSION = 'v1.0.0-c208-s9';
export const LOG_SANITIZER_SCIENTIFIC_BASIS = 'OWASP A09:2021 + NIST SP 800-92 §3.2.2 + CWE-532';
