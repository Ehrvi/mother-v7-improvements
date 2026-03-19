/**
 * Google Workspace Bridge — server/mother/google-workspace-bridge.ts
 * MOTHER v99.0 | Ciclo C216 | NC-GWS-001
 *
 * Bridges MOTHER to Google Workspace via rclone + gws CLI.
 * Enables: Google Docs creation, Sheets data, Drive upload, Slides generation.
 *
 * Scientific basis:
 * - Google Workspace API Documentation (2024) — REST API v4
 *   https://developers.google.com/workspace
 * - Nakano et al. (2021) "WebGPT: Browser-assisted question-answering"
 *   arXiv:2112.09332 — tool-augmented document creation
 * - Schick et al. (2023) "Toolformer: Language Models Can Teach Themselves to Use Tools"
 *   arXiv:2302.04761 — document tool integration
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface GWSDocRequest {
  title: string;
  content: string;         // Markdown content
  folderId?: string;       // Google Drive folder ID
  shareWith?: string[];    // Email addresses to share with
}

export interface GWSDocResult {
  success: boolean;
  documentId?: string;
  documentUrl?: string;
  shareableLink?: string;
  error?: string;
  durationMs: number;
}

export interface GWSSheetRequest {
  title: string;
  data: Record<string, unknown>[];  // Array of row objects
  sheetName?: string;
  folderId?: string;
}

export interface GWSSheetResult {
  success: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  shareableLink?: string;
  error?: string;
  durationMs: number;
}

export interface GWSUploadResult {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  shareableLink?: string;
  error?: string;
  durationMs: number;
}

// E-FIX: Twelve-Factor App — no hardcoded paths (Wiggins, 2017)
const RCLONE_CONFIG = process.env.RCLONE_CONFIG || path.join(os.homedir(), '.gdrive-rclone.ini');
const RCLONE_REMOTE = 'manus_google_drive';
const MOTHER_DRIVE_FOLDER = 'MOTHER-v7.0';

/**
 * Detect if a query requires Google Workspace operations.
 */
export function detectGWSRequest(query: string): {
  isGWSRequest: boolean;
  operation: 'docs' | 'sheets' | 'drive' | 'slides' | null;
  reason: string;
} {
  const patterns = [
    { pattern: /criar.*doc|google.*doc|escrever.*documento/i, operation: 'docs' as const },
    { pattern: /criar.*planilha|google.*sheets|spreadsheet/i, operation: 'sheets' as const },
    { pattern: /upload.*drive|salvar.*drive|google.*drive/i, operation: 'drive' as const },
    { pattern: /criar.*slides|google.*slides|apresentação/i, operation: 'slides' as const },
  ];

  for (const { pattern, operation } of patterns) {
    if (pattern.test(query)) {
      return { isGWSRequest: true, operation, reason: `Query matches GWS pattern: ${operation}` };
    }
  }

  return { isGWSRequest: false, operation: null, reason: 'No GWS operation required' };
}

/**
 * Upload a file to Google Drive via rclone.
 */
export async function uploadToDrive(
  localFilePath: string,
  remotePath?: string
): Promise<GWSUploadResult> {
  const start = Date.now();

  if (!fs.existsSync(localFilePath)) {
    return { success: false, error: `File not found: ${localFilePath}`, durationMs: 0 };
  }

  const fileName = path.basename(localFilePath);
  const targetPath = remotePath ?? `${MOTHER_DRIVE_FOLDER}/${fileName}`;

  try {
    await execAsync(
      `rclone copy "${localFilePath}" "${RCLONE_REMOTE}:${path.dirname(targetPath)}" --config ${RCLONE_CONFIG}`,
      { timeout: 60000 }
    );

    // Get shareable link
    const { stdout } = await execAsync(
      `rclone link "${RCLONE_REMOTE}:${targetPath}" --config ${RCLONE_CONFIG}`,
      { timeout: 30000 }
    );

    const shareableLink = stdout.trim();

    return {
      success: true,
      fileUrl: `https://drive.google.com/file/d/${shareableLink}`,
      shareableLink,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Create a Google Doc from Markdown content via gws CLI.
 * Falls back to Drive upload if gws CLI not available.
 */
export async function createGoogleDoc(request: GWSDocRequest): Promise<GWSDocResult> {
  const start = Date.now();

  // Write content to temp file
  const tmpFile = `/tmp/mother-doc-${Date.now()}.md`;
  fs.writeFileSync(tmpFile, request.content, 'utf-8');

  try {
    // Try gws CLI first
    const gwsAvailable = await checkGWSAvailable();

    if (gwsAvailable) {
      const { stdout } = await execAsync(
        `manus-mcp-cli tool call create_document --server google-drive --input '${JSON.stringify({ title: request.title, content: request.content })}'`,
        { timeout: 30000 }
      );
      const result = JSON.parse(stdout);
      return {
        success: true,
        documentId: result.id,
        documentUrl: result.url,
        shareableLink: result.shareableLink,
        durationMs: Date.now() - start,
      };
    }

    // Fallback: upload as .md to Drive
    const uploadResult = await uploadToDrive(tmpFile, `${MOTHER_DRIVE_FOLDER}/docs/${request.title}.md`);
    return {
      success: uploadResult.success,
      documentUrl: uploadResult.fileUrl,
      shareableLink: uploadResult.shareableLink,
      error: uploadResult.error,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * Check if gws/manus-mcp-cli is available.
 */
async function checkGWSAvailable(): Promise<boolean> {
  try {
    execSync('which manus-mcp-cli', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * List files in MOTHER's Google Drive folder.
 */
export async function listDriveFiles(folderPath?: string): Promise<{
  success: boolean;
  files: Array<{ name: string; path: string; size: number; modTime: string }>;
  error?: string;
}> {
  const targetPath = folderPath ?? MOTHER_DRIVE_FOLDER;

  try {
    const { stdout } = await execAsync(
      `rclone lsjson "${RCLONE_REMOTE}:${targetPath}" --config ${RCLONE_CONFIG}`,
      { timeout: 30000 }
    );

    const files = JSON.parse(stdout);
    return {
      success: true,
      files: files.map((f: { Name: string; Path: string; Size: number; ModTime: string }) => ({
        name: f.Name,
        path: f.Path,
        size: f.Size,
        modTime: f.ModTime,
      })),
    };
  } catch (err) {
    return {
      success: false,
      files: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate GWS capability description for system prompt.
 */
export function generateGWSDescription(): string {
  return [
    '## NC-GWS-001: GOOGLE WORKSPACE DISPONÍVEL',
    'MOTHER pode criar e gerenciar documentos Google via Drive.',
    '- Upload de arquivos para Google Drive',
    '- Criação de Google Docs a partir de Markdown',
    '- Listagem de arquivos na pasta MOTHER-v7.0',
    '- Links compartilháveis para todos os arquivos',
  ].join('\n');
}
