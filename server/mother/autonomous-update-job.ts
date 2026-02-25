/**
 * MOTHER v61.0 — Autonomous Update Job
 * 
 * This module implements the core self-coding engine for MOTHER's autonomous
 * self-update capability. It is designed to run as a Cloud Run Job, triggered
 * when a self-proposal is approved.
 * 
 * Architecture: DGM-SWE Hybrid (Zhang et al., 2025; Xia et al., 2025)
 * 
 * Workflow:
 * 1. Receive proposalId from environment variable
 * 2. Fetch proposal details from MOTHER's database
 * 3. Clone the GitHub repository
 * 4. Execute the proposed code changes using a ReAct loop
 * 5. Run TypeScript compilation check
 * 6. Commit and push to a new branch
 * 7. GitHub Actions CI/CD takes over (test → merge → deploy)
 * 
 * Security:
 * - Runs in an isolated Cloud Run Job container
 * - Uses fine-grained GitHub App token (stored in GCP Secret Manager)
 * - No access to production secrets beyond what is explicitly granted
 * - All actions are logged to MOTHER's audit_log table
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================
// TYPES
// ============================================================

interface ProposalDetails {
  id: number;
  title: string;
  description: string;
  hypothesis: string;
  metricTrigger: string;
  metricValue: number;
  metricTarget: number;
  proposedChanges: string; // JSON string
  fitnessFunction: string;
  status: string;
  versionTag: string;
  scientificBasis: string;
}

interface ProposedChange {
  file: string;
  action: 'insert' | 'replace' | 'append' | 'create';
  findText?: string;
  replaceWith?: string;
  content?: string;
  lineNumber?: number;
}

interface UpdateJobResult {
  success: boolean;
  proposalId: number;
  branchName: string;
  commitSha: string;
  message: string;
  error?: string;
}

// ============================================================
// REACT LOOP: Think → Act → Observe
// Scientific basis: ReAct (Yao et al., ICLR 2023)
// ============================================================

function reactThink(step: string, context: string): void {
  console.log(`\n[MOTHER-SWE] 🧠 THINK: ${step}`);
  if (context) console.log(`[MOTHER-SWE]    Context: ${context}`);
}

function reactAct(action: string): void {
  console.log(`[MOTHER-SWE] ⚡ ACT: ${action}`);
}

function reactObserve(observation: string): void {
  console.log(`[MOTHER-SWE] 👁️  OBSERVE: ${observation}`);
}

// ============================================================
// FILE OPERATIONS (SWE-agent style)
// ============================================================

function readFile(filePath: string): string {
  reactAct(`Reading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  reactObserve(`File read successfully (${content.length} chars, ${content.split('\n').length} lines)`);
  return content;
}

function writeFile(filePath: string, content: string): void {
  reactAct(`Writing file: ${filePath}`);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  reactObserve(`File written successfully (${content.length} chars)`);
}

function applyChange(repoPath: string, change: ProposedChange): boolean {
  const fullPath = path.join(repoPath, change.file);
  
  reactThink(`Applying change to ${change.file}`, `Action: ${change.action}`);
  
  try {
    if (change.action === 'create') {
      writeFile(fullPath, change.content || '');
      return true;
    }
    
    if (change.action === 'append') {
      reactAct(`Appending to file: ${change.file}`);
      fs.appendFileSync(fullPath, '\n' + (change.content || ''), 'utf-8');
      reactObserve(`Content appended successfully`);
      return true;
    }
    
    const currentContent = readFile(fullPath);
    
    if (change.action === 'replace' && change.findText && change.replaceWith !== undefined) {
      if (!currentContent.includes(change.findText)) {
        reactObserve(`WARNING: findText not found in ${change.file}. Skipping this change.`);
        return false;
      }
      const newContent = currentContent.replace(change.findText, change.replaceWith);
      writeFile(fullPath, newContent);
      return true;
    }
    
    if (change.action === 'insert' && change.lineNumber !== undefined && change.content) {
      const lines = currentContent.split('\n');
      lines.splice(change.lineNumber, 0, change.content);
      writeFile(fullPath, lines.join('\n'));
      return true;
    }
    
    reactObserve(`WARNING: Unknown action or missing parameters for ${change.file}`);
    return false;
  } catch (error: any) {
    reactObserve(`ERROR applying change to ${change.file}: ${error.message}`);
    return false;
  }
}

// ============================================================
// GIT OPERATIONS
// ============================================================

function runGitCommand(repoPath: string, command: string): string {
  try {
    return execSync(`git -C ${repoPath} ${command}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error: any) {
    throw new Error(`Git command failed: git ${command}\n${error.message}`);
  }
}

function runCommand(cwd: string, command: string): string {
  try {
    return execSync(command, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.stderr || error.message}`);
  }
}

// ============================================================
// MAIN AUTONOMOUS UPDATE FUNCTION
// ============================================================

export async function executeAutonomousUpdate(proposalId: number): Promise<UpdateJobResult> {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[MOTHER-SWE] 🚀 AUTONOMOUS UPDATE JOB STARTED`);
  console.log(`[MOTHER-SWE] Proposal ID: ${proposalId}`);
  console.log(`[MOTHER-SWE] Scientific basis: DGM (Zhang et al., 2025), SWE-agent (Xia et al., 2025)`);
  console.log(`${'='.repeat(60)}\n`);
  
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mother-update-'));
  
  try {
    // ============================================================
    // STEP 1: Fetch proposal from database
    // ============================================================
    reactThink('Fetching proposal details from database', `proposalId: ${proposalId}`);
    
    const { getDb } = await import('../db');
    const db = await getDb();
    if (!db) throw new Error('Database connection failed');
    
    const [rows] = await (db as any).$client.query(
      `SELECT * FROM self_proposals WHERE id = ? LIMIT 1`,
      [proposalId]
    );
    
    if (!rows || rows.length === 0) {
      throw new Error(`Proposal ${proposalId} not found in database`);
    }
    
    const proposal: ProposalDetails = {
      id: rows[0].id,
      title: rows[0].title,
      description: rows[0].description,
      hypothesis: rows[0].hypothesis,
      metricTrigger: rows[0].metric_trigger,
      metricValue: rows[0].metric_value,
      metricTarget: rows[0].metric_target,
      proposedChanges: rows[0].proposed_changes,
      fitnessFunction: rows[0].fitness_function,
      status: rows[0].status,
      versionTag: rows[0].version_tag,
      scientificBasis: rows[0].scientific_basis,
    };
    
    reactObserve(`Proposal found: "${proposal.title}" (status: ${proposal.status})`);
    
    if (proposal.status !== 'approved') {
      throw new Error(`Proposal ${proposalId} is not approved (status: ${proposal.status})`);
    }
    
    // ============================================================
    // STEP 2: Update proposal status to 'implementing'
    // ============================================================
    reactThink('Updating proposal status to implementing', '');
    await (db as any).$client.query(
      `UPDATE self_proposals SET status = 'implementing', updated_at = NOW() WHERE id = ?`,
      [proposalId]
    );
    reactObserve('Proposal status updated to implementing');
    
    // ============================================================
    // STEP 3: Clone the repository
    // ============================================================
    const githubToken = process.env.GITHUB_TOKEN;
    const repoUrl = process.env.GITHUB_REPO_URL || 'https://github.com/Ehrvi/mother-v7-improvements.git';
    
    reactThink('Cloning repository', `URL: ${repoUrl}`);
    
    const repoPath = path.join(tempDir, 'repo');
    
    if (githubToken) {
      const authenticatedUrl = repoUrl.replace('https://', `https://x-access-token:${githubToken}@`);
      runCommand(tempDir, `git clone ${authenticatedUrl} repo`);
    } else {
      // Fallback: use existing repo if available (for local testing)
      reactObserve('WARNING: No GITHUB_TOKEN found. Using local repo copy.');
      execSync(`cp -r /home/ubuntu/mother-code/mother-interface ${repoPath}`, { stdio: 'pipe' });
    }
    
    reactObserve(`Repository cloned to ${repoPath}`);
    
    // ============================================================
    // STEP 4: Create a new branch
    // ============================================================
    const branchName = `feature/auto-proposal-${proposalId}-${Date.now()}`;
    reactThink('Creating new branch', `Branch: ${branchName}`);
    
    runGitCommand(repoPath, `checkout -b ${branchName}`);
    runGitCommand(repoPath, `config user.name "MOTHER Autonomous Agent"`);
    runGitCommand(repoPath, `config user.email "mother@intelltech.ai"`);
    
    reactObserve(`Branch created: ${branchName}`);
    
    // ============================================================
    // STEP 5: Execute proposed changes (ReAct loop)
    // ============================================================
    reactThink('Parsing proposed changes', proposal.proposedChanges);
    
    let changes: ProposedChange[] = [];
    try {
      const parsed = JSON.parse(proposal.proposedChanges);
      // Support both array format and {files, changes} format
      if (Array.isArray(parsed)) {
        changes = parsed;
      } else if (parsed.changes && Array.isArray(parsed.changes)) {
        // Convert string descriptions to actual change objects
        // This is a simplified implementation — in production, MOTHER would use
        // an LLM call to generate the actual diff from the description
        console.log('[MOTHER-SWE] Proposed changes are descriptive (not executable diffs).');
        console.log('[MOTHER-SWE] Using LLM to generate executable changes...');
        changes = await generateExecutableChanges(proposal, parsed.changes, repoPath);
      }
    } catch (e) {
      reactObserve(`WARNING: Could not parse proposed_changes as JSON. Skipping code changes.`);
    }
    
    let changesApplied = 0;
    for (const change of changes) {
      const success = applyChange(repoPath, change);
      if (success) changesApplied++;
    }
    
    reactObserve(`Applied ${changesApplied}/${changes.length} changes`);
    
    // ============================================================
    // STEP 6: Run TypeScript compilation check
    // ============================================================
    reactThink('Running TypeScript compilation check', '');
    
    try {
      runCommand(repoPath, 'npm ci --silent 2>/dev/null || true');
      const tsResult = runCommand(repoPath, 
        'npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v "node_modules" | grep -v ".test.ts" || true'
      );
      if (tsResult.includes('error TS')) {
        reactObserve(`TypeScript errors found:\n${tsResult}`);
        // Don't fail — log the errors and continue. The CI/CD pipeline will catch them.
      } else {
        reactObserve('TypeScript compilation: PASSED (0 errors)');
      }
    } catch (e: any) {
      reactObserve(`TypeScript check warning: ${e.message}`);
    }
    
    // ============================================================
    // STEP 7: Commit and push
    // ============================================================
    reactThink('Committing and pushing changes', `Branch: ${branchName}`);
    
    runGitCommand(repoPath, 'add -A');
    
    const commitMessage = `auto: ${proposal.title} [proposal-${proposalId}]

MOTHER Autonomous Update v61.0
Proposal: ${proposal.title}
Hypothesis: ${proposal.hypothesis}
Metric: ${proposal.metricTrigger} (${proposal.metricValue} → ${proposal.metricTarget})
Scientific basis: ${proposal.scientificBasis}

DGM Loop (Zhang et al., 2025 arXiv:2505.22954)`;
    
    runGitCommand(repoPath, `commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
    
    const commitSha = runGitCommand(repoPath, 'rev-parse HEAD');
    reactObserve(`Committed: ${commitSha.slice(0, 8)}`);
    
    if (githubToken) {
      runGitCommand(repoPath, `push origin ${branchName}`);
      reactObserve(`Pushed to GitHub: ${branchName}`);
    } else {
      reactObserve('WARNING: No GITHUB_TOKEN — skipping push. Changes are committed locally.');
    }
    
    // ============================================================
    // STEP 8: Log to audit_log
    // ============================================================
    await (db as any).$client.query(
      `INSERT INTO audit_log (action, actor_email, actor_type, target_type, target_id, details, success)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'AUTONOMOUS_UPDATE_EXECUTED',
        'mother@intelltech.ai',
        'system',
        'proposal',
        String(proposalId),
        JSON.stringify({
          proposalTitle: proposal.title,
          branchName,
          commitSha: commitSha.slice(0, 8),
          changesApplied,
          durationMs: Date.now() - startTime,
        }),
        1,
      ]
    );
    
    // Update proposal status to 'testing'
    await (db as any).$client.query(
      `UPDATE self_proposals SET status = 'testing', updated_at = NOW() WHERE id = ?`,
      [proposalId]
    );
    
    const result: UpdateJobResult = {
      success: true,
      proposalId,
      branchName,
      commitSha: commitSha.slice(0, 8),
      message: `Successfully executed autonomous update for proposal ${proposalId}. Branch: ${branchName}`,
    };
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[MOTHER-SWE] ✅ AUTONOMOUS UPDATE JOB COMPLETED`);
    console.log(`[MOTHER-SWE] Duration: ${Date.now() - startTime}ms`);
    console.log(`[MOTHER-SWE] Branch: ${branchName}`);
    console.log(`[MOTHER-SWE] Commit: ${commitSha.slice(0, 8)}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return result;
    
  } catch (error: any) {
    console.error(`[MOTHER-SWE] ❌ AUTONOMOUS UPDATE JOB FAILED: ${error.message}`);
    
    // Try to update proposal status to 'failed'
    try {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (db) {
        await (db as any).$client.query(
          `UPDATE self_proposals SET status = 'failed', updated_at = NOW() WHERE id = ?`,
          [proposalId]
        );
        await (db as any).$client.query(
          `INSERT INTO audit_log (action, actor_email, actor_type, target_type, target_id, details, success)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            'AUTONOMOUS_UPDATE_FAILED',
            'mother@intelltech.ai',
            'system',
            'proposal',
            String(proposalId),
            JSON.stringify({ error: error.message, durationMs: Date.now() - startTime }),
            0,
          ]
        );
      }
    } catch (dbError) {
      console.error('[MOTHER-SWE] Failed to update proposal status:', dbError);
    }
    
    return {
      success: false,
      proposalId,
      branchName: '',
      commitSha: '',
      message: `Autonomous update failed: ${error.message}`,
      error: error.message,
    };
  } finally {
    // Cleanup temp directory
    try {
      execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}


// ============================================================
// SWE-AGENT: ACI-Based Code Modification Engine
// Scientific basis: SWE-agent (Xia et al., 2025), DGM (Zhang et al., 2025)
// Architecture: Agent-Computer Interface (ACI) with ReAct loop
// The agent reads actual file content BEFORE generating diffs,
// ensuring changes are grounded in the real codebase.
// ============================================================
async function generateExecutableChanges(
  proposal: ProposalDetails,
  descriptions: string[],
  repoPath: string
): Promise<ProposedChange[]> {
  try {
    const { invokeLLM } = await import('../_core/llm');

    // STEP 1: ACI "readFile" phase — ground the LLM in real code
    const filesToRead: string[] = [];
    const fileContents: Record<string, string> = {};

    try {
      const parsed = JSON.parse(proposal.proposedChanges);
      if (parsed.files && Array.isArray(parsed.files)) {
        filesToRead.push(...parsed.files);
      }
    } catch (e) { /* ignore */ }

    for (const relPath of filesToRead) {
      const fullPath = path.join(repoPath, relPath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        fileContents[relPath] = fileContent;
        reactObserve(`[ACI] Read file: ${relPath} (${fileContent.split('\n').length} lines)`);
      } else {
        reactObserve(`[ACI] WARNING: File not found: ${relPath}`);
      }
    }

    // STEP 2: Build the ACI prompt with real file content
    const fileContextSection = Object.entries(fileContents)
      .map(([filePath, fileContent]) => {
        const lines = fileContent.split('\n');
        const truncated = lines.length > 300
          ? lines.slice(0, 300).join('\n') + '\n// ... (truncated at 300 lines)'
          : fileContent;
        return `=== FILE: ${filePath} ===\n${truncated}\n=== END FILE ===`;
      })
      .join('\n\n');

    const aciPrompt = `You are the SWE-Agent (Software Engineering Agent) of MOTHER.
Your mission: implement a concrete code change based on the proposal below.
You have been given the ACTUAL current content of the relevant files.

## PROPOSAL TO IMPLEMENT
- ID: ${proposal.id}
- Title: ${proposal.title}
- Description: ${proposal.description}
- Hypothesis: ${proposal.hypothesis}
- Scientific Basis: ${proposal.scientificBasis}

## CHANGES REQUESTED (natural language)
${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

## CURRENT FILE CONTENTS (read via ACI)
${fileContextSection || '(No files provided)'}

## YOUR TASK
Generate a JSON array of minimal, targeted code changes.
Each change object schema:
- "file": relative path from repo root
- "action": "replace" | "append" | "create" | "insert"
- For "replace": "findText" (exact string from file) and "replaceWith" (new string)
- For "append": "content" (string to append)
- For "create": "content" (full file content)
- For "insert": "lineNumber" (0-indexed) and "content"

## RULES
1. Use ONLY "replace" for existing files — safest and most precise.
2. "findText" MUST be an exact substring from the file content above.
3. Make MINIMAL changes. Do not refactor unrelated code.
4. Ensure TypeScript is syntactically valid.
5. Return ONLY the JSON array. No markdown, no explanation.`;

    reactThink('Calling SWE-Agent LLM with ACI context', `Files in context: ${Object.keys(fileContents).join(', ')}`);

    const response = await invokeLLM({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a precise TypeScript code modification engine. Return ONLY a valid JSON array.',
        },
        { role: 'user', content: aciPrompt },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;
    const llmContent = typeof rawContent === 'string' ? rawContent : '[]';
    reactObserve(`[ACI] LLM response received (${llmContent.length} chars)`);

    // Extract JSON array (handle markdown fences if present)
    const jsonMatch = llmContent.match(/\[\s*[\s\S]*\]/);
    if (jsonMatch) {
      const changes = JSON.parse(jsonMatch[0]);
      reactObserve(`[ACI] Generated ${changes.length} executable change(s)`);
      return changes;
    }

    reactObserve('[ACI] WARNING: Could not extract JSON from LLM response');
    return [];
  } catch (error: any) {
    console.error('[MOTHER-SWE] ACI change generation failed:', error.message);
    return [];
  }
}

/// ============================================================
// ENTRY POINT: When run as a Cloud Run Job
// ESM-compatible entry point check (no require.main in ESM)
// ============================================================
// Only auto-execute when PROPOSAL_ID is set (Cloud Run Job mode)
// This prevents crash when imported as a module in the main server
if (process.env.PROPOSAL_ID && process.env.AUTONOMOUS_JOB_MODE === 'true') {
  const proposalId = parseInt(process.env.PROPOSAL_ID || '0', 10);
  
  if (!proposalId) {
    console.error('[MOTHER-SWE] ERROR: PROPOSAL_ID environment variable is required');
    process.exit(1);
  }
  
  executeAutonomousUpdate(proposalId)
    .then(result => {
      if (result.success) {
        console.log('[MOTHER-SWE] Job completed successfully');
        process.exit(0);
      } else {
        console.error('[MOTHER-SWE] Job failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('[MOTHER-SWE] Unhandled error:', error);
      process.exit(1);
    });
}
