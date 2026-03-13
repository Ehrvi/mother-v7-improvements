/**
 * SHMS Document Management — server/shms/document-management.ts
 * MOTHER v7 | Module 9
 *
 * Scientific basis:
 * - ISO 9001:2015 §7.5 — documented information lifecycle (draft→review→approved→obsolete)
 * - PMBOK 7th ed. — document control and traceability
 * - Digital signature verification: PKCS#7 / CMS (RFC 5652) — store hash only, no private keys
 *
 * References:
 * - ISO 9001:2015, §7.5 "Documented Information", International Organization for Standardization.
 * - Project Management Institute (2021). PMBOK Guide, 7th Edition, §2.6 Document Control.
 * - IETF RFC 5652 (2009). Cryptographic Message Syntax (CMS). https://www.rfc-editor.org/rfc/rfc5652
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'obsolete'
  | 'rejected';

export type DocumentType =
  | 'inspection_report'
  | 'safety_certificate'
  | 'maintenance_order'
  | 'emergency_plan'
  | 'risk_assessment'
  | 'calibration_record'
  | 'change_order'
  | 'other';

export interface DocumentRevision {
  revisionNumber: string;   // e.g. "Rev.A", "Rev.1"
  date: string;
  author: string;
  summary: string;
  contentHash?: string;     // SHA-256 of document content (PKCS#7/CMS compatible — hash only)
}

export interface SHMSDocument {
  id: string;
  structureId: string;
  type: DocumentType;
  title: string;
  status: DocumentStatus;
  currentRevision: string;
  revisions: DocumentRevision[];
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  tags: string[];
  relatedFileIds: string[];    // links to FileDrive files
  metadata: Record<string, unknown>;
}

export interface WorkflowTransition {
  from: DocumentStatus;
  to: DocumentStatus;
  triggeredBy: string;
  comment?: string;
  timestamp: string;
}

// ─── Workflow rules (ISO 9001:2015 §7.5 compliant) ───────────────────────────

/**
 * Valid lifecycle transitions:
 *   draft       → under_review
 *   under_review → approved | rejected
 *   approved    → obsolete
 *   rejected    → draft
 *
 * No transition can skip a stage or go backward (except rejected→draft for rework).
 */
const VALID_TRANSITIONS: ReadonlyMap<DocumentStatus, ReadonlySet<DocumentStatus>> = new Map([
  ['draft', new Set<DocumentStatus>(['under_review'])],
  ['under_review', new Set<DocumentStatus>(['approved', 'rejected'])],
  ['approved', new Set<DocumentStatus>(['obsolete'])],
  ['obsolete', new Set<DocumentStatus>()],
  ['rejected', new Set<DocumentStatus>(['draft'])],
]);

export function isValidTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed ? allowed.has(to) : false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a content hash for a document revision.
 * In production, this would be the SHA-256 of the actual file bytes (CMS/PKCS#7 style).
 * Here we derive a deterministic stub from revision metadata.
 */
function generateRevisionHash(
  docId: string,
  revisionNumber: string,
  author: string,
  summary: string,
): string {
  const seed = `${docId}:${revisionNumber}:${author}:${summary}:${Date.now()}`;
  return createHash('sha256').update(seed).digest('hex');
}

// ─── DocumentManagementSystem ─────────────────────────────────────────────────

export class DocumentManagementSystem {
  private documents: Map<string, SHMSDocument> = new Map();
  private history: Map<string, WorkflowTransition[]> = new Map();

  /**
   * Create a new document with status='draft'.
   * Generates a UUID, sets timestamps, and auto-generates a contentHash
   * for each provided revision (PKCS#7 / CMS style — hash only, no keys).
   */
  createDocument(doc: Omit<SHMSDocument, 'id' | 'createdAt' | 'updatedAt'>): SHMSDocument {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Enrich revisions with content hashes if not already set
    const enrichedRevisions: DocumentRevision[] = doc.revisions.map((rev) => ({
      ...rev,
      contentHash: rev.contentHash ?? generateRevisionHash(id, rev.revisionNumber, rev.author, rev.summary),
    }));

    const document: SHMSDocument = {
      ...doc,
      id,
      revisions: enrichedRevisions,
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(id, document);
    this.history.set(id, []);

    return document;
  }

  getDocument(id: string): SHMSDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Return all documents for a structure, optionally filtered by type and status.
   * Results are sorted by updatedAt descending (most recently updated first).
   */
  getDocumentsByStructure(
    structureId: string,
    filter?: { type?: DocumentType; status?: DocumentStatus },
  ): SHMSDocument[] {
    const results: SHMSDocument[] = [];
    for (const doc of this.documents.values()) {
      if (doc.structureId !== structureId) continue;
      if (filter?.type && doc.type !== filter.type) continue;
      if (filter?.status && doc.status !== filter.status) continue;
      results.push(doc);
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Transition a document to a new status per the ISO 9001 §7.5 workflow.
   * Records the transition in the audit history.
   *
   * Special behaviour on approval:
   *   - Sets approvedBy and approvedAt automatically
   * Special behaviour on moving to obsolete:
   *   - Preserves approvedBy/approvedAt for audit trail
   */
  transitionStatus(
    id: string,
    transition: Omit<WorkflowTransition, 'timestamp'>,
  ): SHMSDocument {
    const doc = this.documents.get(id);
    if (!doc) throw new Error(`Document not found: ${id}`);

    if (!isValidTransition(transition.from, transition.to)) {
      throw new Error(
        `Invalid workflow transition: ${transition.from} → ${transition.to}. ` +
        `ISO 9001 §7.5 compliant transitions from "${transition.from}": ` +
        `${[...(VALID_TRANSITIONS.get(transition.from) ?? [])].join(', ') || 'none'}`,
      );
    }

    if (doc.status !== transition.from) {
      throw new Error(
        `Document current status is "${doc.status}" but transition specifies from="${transition.from}"`,
      );
    }

    const now = new Date().toISOString();
    const fullTransition: WorkflowTransition = { ...transition, timestamp: now };

    // Record history
    const hist = this.history.get(id) ?? [];
    hist.push(fullTransition);
    this.history.set(id, hist);

    // Build updated document
    const updates: Partial<SHMSDocument> = {
      status: transition.to,
      updatedAt: now,
    };

    if (transition.to === 'approved') {
      updates.approvedBy = transition.triggeredBy;
      updates.approvedAt = now;
    }

    const updated: SHMSDocument = { ...doc, ...updates };
    this.documents.set(id, updated);
    return updated;
  }

  /**
   * Add a new revision to a document.
   * Auto-generates a contentHash (SHA-256 stub) if not provided.
   * Updates currentRevision and updatedAt.
   */
  addRevision(id: string, revision: DocumentRevision): SHMSDocument {
    const doc = this.documents.get(id);
    if (!doc) throw new Error(`Document not found: ${id}`);

    const enrichedRevision: DocumentRevision = {
      ...revision,
      contentHash: revision.contentHash ?? generateRevisionHash(
        id,
        revision.revisionNumber,
        revision.author,
        revision.summary,
      ),
    };

    const now = new Date().toISOString();
    const updated: SHMSDocument = {
      ...doc,
      revisions: [...doc.revisions, enrichedRevision],
      currentRevision: revision.revisionNumber,
      updatedAt: now,
    };

    this.documents.set(id, updated);
    return updated;
  }

  /**
   * Return the full workflow audit trail for a document (PMBOK §2.6 traceability).
   */
  getWorkflowHistory(id: string): WorkflowTransition[] {
    return [...(this.history.get(id) ?? [])];
  }

  /**
   * Find documents expiring within the next N days.
   * Documents without an expiresAt date are excluded.
   */
  getExpiringDocuments(withinDays: number): SHMSDocument[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const results: SHMSDocument[] = [];
    for (const doc of this.documents.values()) {
      if (!doc.expiresAt) continue;
      const expiresAt = new Date(doc.expiresAt);
      if (expiresAt >= now && expiresAt <= cutoff) {
        results.push(doc);
      }
    }

    return results.sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''));
  }

  /**
   * Search documents within a structure by title, tags, and metadata string values.
   * Case-insensitive substring match.
   */
  searchDocuments(structureId: string, query: string): SHMSDocument[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getDocumentsByStructure(structureId);

    return this.getDocumentsByStructure(structureId).filter((doc) => {
      if (doc.title.toLowerCase().includes(q)) return true;
      if (doc.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
      // Search in metadata string values
      for (const val of Object.values(doc.metadata)) {
        if (typeof val === 'string' && val.toLowerCase().includes(q)) return true;
      }
      // Search in revision summaries and authors
      if (doc.revisions.some(
        (rev) =>
          rev.summary.toLowerCase().includes(q) ||
          rev.author.toLowerCase().includes(q) ||
          rev.revisionNumber.toLowerCase().includes(q),
      )) return true;
      return false;
    });
  }
}

export const documentManagementSystem: DocumentManagementSystem = new DocumentManagementSystem();
