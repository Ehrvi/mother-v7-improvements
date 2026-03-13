/**
 * SHMS File Drive — server/shms/file-drive.ts
 * MOTHER v7 | Module 8
 *
 * Scientific basis:
 * - MIME type registry (IANA, RFC 2046) — multipurpose internet mail extensions
 * - Secure file storage: OWASP File Upload Cheat Sheet (input validation, MIME check, size limits)
 * - Metadata indexing: Dublin Core Metadata Element Set (DCMI, 2012)
 *
 * References:
 * - IETF RFC 2046 (1996). MIME Part Two: Media Types. https://www.rfc-editor.org/rfc/rfc2046
 * - OWASP (2023). File Upload Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
 * - Dublin Core Metadata Initiative (2012). DCMI Metadata Terms. https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileCategory =
  | 'report'
  | 'drawing'
  | 'photo'
  | 'measurement'
  | 'certificate'
  | 'procedure'
  | 'other';

export type FileStatus = 'active' | 'archived' | 'deleted';

export interface SHMSFile {
  id: string;
  structureId: string;
  category: FileCategory;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;    // ISO 8601
  uploadedBy: string;
  status: FileStatus;
  tags: string[];
  description?: string;
  checksum: string;      // SHA-256 hex (for integrity validation)
  version: number;
  parentId?: string;     // for versioning chain
}

export interface FileUploadRequest {
  structureId: string;
  category: FileCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  tags?: string[];
  description?: string;
  parentId?: string;
}

export interface FileSearchResult {
  files: SHMSFile[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── OWASP allowed MIME types for SHMS ───────────────────────────────────────

export const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/json',
] as const;

/** 100 MB in bytes */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitise a filename against path traversal attacks.
 * OWASP File Upload Cheat Sheet §File Name Sanitization:
 * - Strip directory separators (/ and \)
 * - Strip null bytes
 * - Allow only printable ASCII characters
 * - Reject names that start with a dot (hidden files)
 * - Maximum 255 characters
 */
function sanitiseFileName(name: string): { sanitised: string; violations: string[] } {
  const violations: string[] = [];
  let sanitised = name;

  if (/[/\\]/.test(sanitised)) {
    violations.push('File name contains path separators (/ or \\)');
    sanitised = sanitised.replace(/[/\\]/g, '_');
  }

  if (/\0/.test(sanitised)) {
    violations.push('File name contains null byte');
    sanitised = sanitised.replace(/\0/g, '');
  }

  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E]/.test(sanitised)) {
    violations.push('File name contains non-printable or non-ASCII characters');
    // eslint-disable-next-line no-control-regex
    sanitised = sanitised.replace(/[^\x20-\x7E]/g, '_');
  }

  if (sanitised.startsWith('.')) {
    violations.push('File name must not start with a dot (hidden file)');
  }

  if (sanitised.length > 255) {
    violations.push('File name exceeds 255 characters');
  }

  if (sanitised.trim() === '' || sanitised === '') {
    violations.push('File name must not be empty');
  }

  return { sanitised, violations };
}

/**
 * Generate a deterministic-looking SHA-256 stub checksum.
 * In production this would be computed from actual file bytes.
 * Here we derive it from metadata (structureId + name + size + timestamp).
 */
function generateChecksumStub(req: FileUploadRequest, id: string): string {
  const seed = `${id}:${req.structureId}:${req.name}:${req.sizeBytes}:${Date.now()}`;
  return createHash('sha256').update(seed).digest('hex');
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a file upload request against OWASP recommendations.
 *
 * Checks:
 * 1. MIME type must be in the SHMS allow-list (IANA RFC 2046)
 * 2. File size must be < 100 MB
 * 3. File name sanitization (no path traversal, no null bytes)
 * 4. structureId must be present and non-empty
 * 5. uploadedBy must be present and non-empty
 */
export function validateFileUpload(req: FileUploadRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. MIME type check (OWASP: validate content type)
  if (!ALLOWED_MIME_TYPES.includes(req.mimeType)) {
    errors.push(
      `MIME type "${req.mimeType}" is not permitted. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }

  // 2. Size check
  if (req.sizeBytes <= 0) {
    errors.push('File size must be greater than 0 bytes');
  } else if (req.sizeBytes > MAX_FILE_SIZE_BYTES) {
    const mb = (req.sizeBytes / (1024 * 1024)).toFixed(2);
    errors.push(`File size ${mb} MB exceeds the 100 MB limit`);
  }

  // 3. File name sanitization
  const { violations } = sanitiseFileName(req.name);
  errors.push(...violations);

  // 4. structureId
  if (!req.structureId || req.structureId.trim() === '') {
    errors.push('structureId is required');
  }

  // 5. uploadedBy
  if (!req.uploadedBy || req.uploadedBy.trim() === '') {
    errors.push('uploadedBy is required');
  }

  return { valid: errors.length === 0, errors };
}

// ─── FileDriveManager ─────────────────────────────────────────────────────────

export class FileDriveManager {
  private files: Map<string, SHMSFile> = new Map();

  /**
   * Register a new file after validating the upload request.
   * Generates a UUID, checksum stub, version number, and timestamp.
   * Dublin Core metadata is embedded in the returned SHMSFile record.
   */
  registerFile(req: FileUploadRequest): SHMSFile {
    const validation = validateFileUpload(req);
    if (!validation.valid) {
      throw new Error(`File upload validation failed: ${validation.errors.join('; ')}`);
    }

    // Determine version number by inspecting the parent chain
    let version = 1;
    if (req.parentId) {
      const versionHistory = this.getVersionHistory(req.parentId);
      version = versionHistory.length + 1;
    }

    const id = randomUUID();
    const checksum = generateChecksumStub(req, id);
    const now = new Date().toISOString();

    const file: SHMSFile = {
      id,
      structureId: req.structureId,
      category: req.category,
      name: req.name,
      originalName: req.name,
      mimeType: req.mimeType,
      sizeBytes: req.sizeBytes,
      uploadedAt: now,
      uploadedBy: req.uploadedBy,
      status: 'active',
      tags: req.tags ?? [],
      description: req.description,
      checksum,
      version,
      parentId: req.parentId,
    };

    this.files.set(id, file);
    return file;
  }

  getFile(id: string): SHMSFile | undefined {
    return this.files.get(id);
  }

  /**
   * Return all files for a given structure, optionally filtered by category and status.
   * Only non-deleted files are returned unless status='deleted' is explicitly requested.
   */
  getFilesForStructure(
    structureId: string,
    filter?: { category?: FileCategory; status?: FileStatus },
  ): SHMSFile[] {
    const results: SHMSFile[] = [];
    for (const file of this.files.values()) {
      if (file.structureId !== structureId) continue;
      if (filter?.category && file.category !== filter.category) continue;
      if (filter?.status) {
        if (file.status !== filter.status) continue;
      } else {
        // By default, exclude hard-deleted files
        if (file.status === 'deleted') continue;
      }
      results.push(file);
    }
    return results.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  archiveFile(id: string): void {
    const file = this.files.get(id);
    if (!file) throw new Error(`File not found: ${id}`);
    if (file.status === 'deleted') throw new Error(`File ${id} is already deleted`);
    this.files.set(id, { ...file, status: 'archived' });
  }

  /** Soft delete — sets status to 'deleted', preserves record for audit trail. */
  deleteFile(id: string): void {
    const file = this.files.get(id);
    if (!file) throw new Error(`File not found: ${id}`);
    this.files.set(id, { ...file, status: 'deleted' });
  }

  /**
   * Search files within a structure by name, description, and tags.
   * Case-insensitive. Only returns active/archived files.
   */
  searchFiles(structureId: string, query: string): SHMSFile[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getFilesForStructure(structureId);

    return this.getFilesForStructure(structureId).filter((file) => {
      if (file.name.toLowerCase().includes(q)) return true;
      if (file.description?.toLowerCase().includes(q)) return true;
      if (file.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /**
   * Walk the version chain from a parentId upward, returning all versions in
   * ascending order (oldest first).
   */
  getVersionHistory(parentId: string): SHMSFile[] {
    const chain: SHMSFile[] = [];

    // Find the root of the chain
    const root = this.files.get(parentId);
    if (root) chain.push(root);

    // Collect all files whose parentId chains back to parentId
    const children: SHMSFile[] = [];
    for (const file of this.files.values()) {
      if (file.parentId === parentId && file.id !== parentId) {
        children.push(file);
      }
    }

    children.sort((a, b) => a.version - b.version);
    chain.push(...children);
    return chain;
  }

  /**
   * Paginated search across files in a structure.
   * Combines category filter, free-text query, and pagination.
   */
  search(params: {
    structureId?: string;
    category?: FileCategory;
    query?: string;
    page?: number;
    pageSize?: number;
  }): FileSearchResult {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    let candidates: SHMSFile[];

    if (params.structureId) {
      candidates = this.getFilesForStructure(params.structureId, { category: params.category });
    } else {
      candidates = [];
      const seen = new Set<string>();
      for (const file of this.files.values()) {
        if (file.status === 'deleted') continue;
        if (params.category && file.category !== params.category) continue;
        if (!seen.has(file.id)) {
          candidates.push(file);
          seen.add(file.id);
        }
      }
      candidates.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    }

    // Apply free-text filter
    if (params.query) {
      const q = params.query.toLowerCase().trim();
      candidates = candidates.filter((file) => {
        if (file.name.toLowerCase().includes(q)) return true;
        if (file.description?.toLowerCase().includes(q)) return true;
        if (file.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    const total = candidates.length;
    const start = (page - 1) * pageSize;
    const files = candidates.slice(start, start + pageSize);

    return { files, total, page, pageSize };
  }
}

export const fileDriveManager: FileDriveManager = new FileDriveManager();
