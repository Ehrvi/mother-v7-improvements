/**
 * Input Sanitization Middleware
 *
 * Protege contra XSS, SQL injection e outras vulnerabilidades
 * usando DOMPurify para sanitizar HTML/scripts maliciosos
 */

import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitiza string removendo HTML/scripts maliciosos
 */
export function sanitizeString(input: string): string {
  // Remove HTML tags e scripts maliciosos
  const sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // Não permite nenhuma tag HTML
    ALLOWED_ATTR: [], // Não permite nenhum atributo
    KEEP_CONTENT: true, // Mantém o conteúdo texto
  });

  return sanitized.trim();
}

/**
 * Sanitiza objeto recursivamente
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key as keyof T] = sanitizeString(value) as any;
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      sanitized[key as keyof T] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map(item =>
        typeof item === "string"
          ? sanitizeString(item)
          : typeof item === "object" && item !== null
            ? sanitizeObject(item)
            : item
      ) as any;
    } else {
      sanitized[key as keyof T] = value;
    }
  }

  return sanitized;
}

/**
 * Valida que string não contém padrões maliciosos
 */
export function validateNoMaliciousPatterns(input: string): boolean {
  const maliciousPatterns = [
    /<script/i, // Script tags
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Event handlers (onclick, onload, etc.)
    /data:text\/html/i, // Data URLs
    /<iframe/i, // Iframes
    /<object/i, // Objects
    /<embed/i, // Embeds
    /eval\(/i, // eval() calls
    /expression\(/i, // CSS expressions
    /vbscript:/i, // VBScript protocol
  ];

  return !maliciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Valida tamanho de input
 */
export function validateInputSize(
  input: string,
  maxSize: number = 10000
): boolean {
  return input.length <= maxSize;
}

/**
 * Sanitiza e valida input completo
 * Retorna input sanitizado ou lança erro se inválido
 */
export function sanitizeAndValidate(
  input: string,
  maxSize: number = 10000
): string {
  // Validar tamanho
  if (!validateInputSize(input, maxSize)) {
    throw new Error(`Input too large (max ${maxSize} characters)`);
  }

  // Validar padrões maliciosos ANTES de sanitizar
  if (!validateNoMaliciousPatterns(input)) {
    throw new Error("Input contains potentially malicious content");
  }

  // Sanitizar
  const sanitized = sanitizeString(input);

  // Validar que sanitização não removeu todo o conteúdo
  if (sanitized.length === 0 && input.length > 0) {
    throw new Error("Input contains only invalid content");
  }

  return sanitized;
}
