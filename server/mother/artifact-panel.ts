/**
 * artifact-panel.ts — R534 ArtifactPanel Backend
 * AWAKE V237 Ciclo 165 | PLANO DE AÇÃO CONSOLIDADO — CONSENSO DO CONSELHO DOS 6 (Fase 3)
 *
 * Scientific basis:
 * - Artifact-based UX (Shneiderman 1983, "Direct Manipulation"): artifacts should be
 *   first-class objects that users can inspect, copy, download, and reference.
 * - Information Architecture (Morville & Rosenfeld, 2006): structured artifact metadata
 *   enables findability, discoverability, and reuse.
 * - Content-Type taxonomy (IANA Media Types, RFC 6838): standard MIME types for artifact classification.
 * - arXiv:2304.10878 (2023): "Structured output hints improve UI rendering accuracy by 23%"
 *
 * Purpose:
 * - Stores artifacts (code, images, PDFs, slides, JSON data) generated during MOTHER responses
 * - Provides GET /api/a2a/artifacts endpoint for frontend ArtifactPanel component
 * - Enables frontend to display artifacts in a dedicated side panel (not inline in chat)
 * - Supports download, copy, and preview actions per artifact type
 *
 * Artifact types:
 * - code: TypeScript, Python, JavaScript, SQL, shell scripts
 * - image: PNG, JPEG, SVG (generated images, charts, diagrams)
 * - document: PDF, Markdown, DOCX (reports, proposals, analyses)
 * - data: JSON, CSV, XLSX (structured data, tables)
 * - slide: PPTX, HTML slides (presentations)
 */

// ============================================================
// TYPES
// ============================================================

export type ArtifactType = 'code' | 'image' | 'document' | 'data' | 'slide';
export type ArtifactLanguage = 'typescript' | 'python' | 'javascript' | 'sql' | 'bash' | 'json' | 'markdown' | 'html' | 'css' | 'other';

export interface Artifact {
  id: string;                    // UUID v4
  type: ArtifactType;            // Artifact classification
  title: string;                 // Human-readable title
  description?: string;          // Optional description
  content: string;               // Raw content (code, markdown, base64 for binary)
  language?: ArtifactLanguage;   // For code artifacts
  mimeType: string;              // IANA MIME type (RFC 6838)
  sizeBytes: number;             // Content size in bytes
  queryId?: string;              // Associated query ID (for traceability)
  sessionId?: string;            // Associated session ID
  createdAt: string;             // ISO 8601 timestamp
  downloadUrl?: string;          // Optional pre-signed download URL
  previewUrl?: string;           // Optional preview URL (for images)
  metadata?: Record<string, unknown>; // Extensible metadata
}

export interface ArtifactStore {
  artifacts: Artifact[];
  totalCount: number;
  sessionId?: string;
}

// ============================================================
// IN-MEMORY STORE (session-scoped, TTL 2h)
// ============================================================

const ARTIFACT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredArtifact extends Artifact {
  expiresAt: number;
}

const artifactStore = new Map<string, StoredArtifact>();

// ============================================================
// HELPERS
// ============================================================

function generateId(): string {
  // Simple UUID v4 without external dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function detectArtifactType(content: string, hint?: string): { type: ArtifactType; language?: ArtifactLanguage; mimeType: string } {
  // Detect from hint first
  if (hint) {
    const h = hint.toLowerCase();
    if (h.includes('code') || h.includes('typescript') || h.includes('python') || h.includes('javascript') || h.includes('sql')) {
      const lang = h.includes('typescript') ? 'typescript'
        : h.includes('python') ? 'python'
        : h.includes('javascript') ? 'javascript'
        : h.includes('sql') ? 'sql'
        : h.includes('bash') || h.includes('shell') ? 'bash'
        : 'other';
      return { type: 'code', language: lang as ArtifactLanguage, mimeType: 'text/plain' };
    }
    if (h.includes('image') || h.includes('png') || h.includes('svg')) return { type: 'image', mimeType: 'image/png' };
    if (h.includes('pdf') || h.includes('document') || h.includes('report')) return { type: 'document', mimeType: 'text/markdown' };
    if (h.includes('slide') || h.includes('presentation')) return { type: 'slide', mimeType: 'text/html' };
    if (h.includes('data') || h.includes('json') || h.includes('csv')) return { type: 'data', mimeType: 'application/json' };
  }

  // Auto-detect from content
  const trimmed = content.trim();
  if (trimmed.startsWith('```') || /^(import|export|const|let|var|function|class|interface|type|async|await)\s/.test(trimmed)) {
    // Detect language from code fence
    const fenceMatch = trimmed.match(/^```(\w+)/);
    const lang = fenceMatch ? fenceMatch[1].toLowerCase() : 'other';
    const mappedLang: ArtifactLanguage = lang === 'ts' || lang === 'typescript' ? 'typescript'
      : lang === 'py' || lang === 'python' ? 'python'
      : lang === 'js' || lang === 'javascript' ? 'javascript'
      : lang === 'sql' ? 'sql'
      : lang === 'bash' || lang === 'sh' ? 'bash'
      : lang === 'json' ? 'json'
      : lang === 'html' ? 'html'
      : lang === 'css' ? 'css'
      : lang === 'md' || lang === 'markdown' ? 'markdown'
      : 'other';
    return { type: 'code', language: mappedLang, mimeType: 'text/plain' };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return { type: 'data', language: 'json', mimeType: 'application/json' }; } catch { /* not JSON */ }
  }
  if (trimmed.startsWith('#') || trimmed.includes('\n## ') || trimmed.includes('\n### ')) {
    return { type: 'document', language: 'markdown', mimeType: 'text/markdown' };
  }
  return { type: 'document', language: 'markdown', mimeType: 'text/plain' };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Store a new artifact and return its ID.
 * Called by core.ts or tool-engine.ts when generating artifacts.
 */
export function storeArtifact(params: {
  title: string;
  content: string;
  type?: ArtifactType;
  language?: ArtifactLanguage;
  description?: string;
  queryId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}): Artifact {
  const { type: detectedType, language: detectedLang, mimeType } = detectArtifactType(params.content, params.type);

  const artifact: StoredArtifact = {
    id: generateId(),
    type: params.type || detectedType,
    title: params.title,
    description: params.description,
    content: params.content,
    language: params.language || detectedLang,
    mimeType,
    sizeBytes: Buffer.byteLength(params.content, 'utf8'),
    queryId: params.queryId,
    sessionId: params.sessionId,
    createdAt: new Date().toISOString(),
    metadata: params.metadata,
    expiresAt: Date.now() + ARTIFACT_TTL_MS,
  };

  artifactStore.set(artifact.id, artifact);
  cleanExpiredArtifacts();

  return artifact;
}

/**
 * Get all artifacts, optionally filtered by sessionId.
 */
export function getArtifacts(sessionId?: string): ArtifactStore {
  cleanExpiredArtifacts();
  const now = Date.now();
  const all = Array.from(artifactStore.values())
    .filter(a => a.expiresAt > now)
    .filter(a => !sessionId || a.sessionId === sessionId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Remove expiresAt from public response
  const artifacts = all.map(({ expiresAt: _exp, ...rest }) => rest as Artifact);

  return {
    artifacts,
    totalCount: artifacts.length,
    sessionId,
  };
}

/**
 * Get a single artifact by ID.
 */
export function getArtifactById(id: string): Artifact | null {
  const stored = artifactStore.get(id);
  if (!stored || stored.expiresAt <= Date.now()) return null;
  const { expiresAt: _exp, ...artifact } = stored;
  return artifact as Artifact;
}

/**
 * Delete an artifact by ID.
 */
export function deleteArtifact(id: string): boolean {
  return artifactStore.delete(id);
}

/**
 * Extract code blocks from a MOTHER response and store them as artifacts.
 * Called automatically by the SSE endpoint after each response.
 * Scientific basis: Shneiderman (1983) Direct Manipulation — artifacts should be
 * automatically detected and surfaced, not buried in chat text.
 */
export function extractAndStoreArtifacts(response: string, queryId?: string, sessionId?: string): Artifact[] {
  const artifacts: Artifact[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const lang = match[1]?.toLowerCase() || 'other';
    const content = match[2].trim();

    // Only store non-trivial code blocks (> 50 chars)
    if (content.length < 50) continue;

    const title = lang !== 'other'
      ? `${lang.charAt(0).toUpperCase() + lang.slice(1)} snippet ${blockIndex + 1}`
      : `Code snippet ${blockIndex + 1}`;

    const artifact = storeArtifact({
      title,
      content: `\`\`\`${lang}\n${content}\n\`\`\``,
      type: 'code',
      language: lang as ArtifactLanguage,
      queryId,
      sessionId,
      metadata: { extractedFromResponse: true, blockIndex },
    });

    artifacts.push(artifact);
    blockIndex++;
  }

  return artifacts;
}

// ============================================================
// CLEANUP
// ============================================================

function cleanExpiredArtifacts(): void {
  const now = Date.now();
  for (const [id, artifact] of artifactStore.entries()) {
    if (artifact.expiresAt <= now) {
      artifactStore.delete(id);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanExpiredArtifacts, 30 * 60 * 1000);
