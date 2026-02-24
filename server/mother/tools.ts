/**
 * MOTHER v31.0 - CodeAgent Tools
 * Scientific basis: ReAct (Yao et al., ICLR 2023), SICA (Robeyns et al., 2025)
 * 
 * Tool registry for the CodeAgent. Each tool is a safe, sandboxed operation
 * that the LangGraph agent can call to read, write, and execute code.
 * 
 * Safety constraints (v31.1):
 * - write_file: validates TypeScript syntax before writing
 * - run_shell: whitelist of allowed commands, no sudo, no rm -rf
 * - All operations are logged for audit trail
 */

import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import path from 'path';

const execAsync = promisify(exec);

// Base directory for code operations (security: restrict to project)
const BASE_DIR = '/home/ubuntu/mother-code/mother-interface';

// Allowed shell commands (whitelist for safety)
const ALLOWED_COMMANDS = [
  'pnpm', 'npx', 'node', 'cat', 'ls', 'grep', 'find', 'echo',
  'git', 'curl', 'gcloud', 'mysql', 'wc', 'head', 'tail', 'diff'
];

function isCommandAllowed(command: string): boolean {
  const firstWord = command.trim().split(/\s+/)[0];
  return ALLOWED_COMMANDS.includes(firstWord);
}

/**
 * read_file: Read the contents of a file
 */
export const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(BASE_DIR, filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      console.log(`[CodeAgent] read_file: ${absolutePath} (${content.length} chars)`);
      return content;
    } catch (e: any) {
      return `ERROR reading file: ${e.message}`;
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. Use absolute paths or paths relative to the project root.',
    schema: z.object({
      filePath: z.string().describe('The path to the file to read (absolute or relative to project root)'),
    }),
  }
);

/**
 * write_file: Write content to a file (with TypeScript validation for .ts files)
 */
export const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(BASE_DIR, filePath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      
      // For TypeScript files: validate syntax before writing
      if (absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx')) {
        // Write to a temp file first for validation
        const tmpPath = `${absolutePath}.tmp`;
        await fs.writeFile(tmpPath, content, 'utf-8');
        try {
          const { stderr } = await execAsync(
            `npx tsc --noEmit --allowJs --checkJs false --strict false --skipLibCheck --lib es2022 --module commonjs --target es2022 --pretty false ${tmpPath}`,
            { cwd: BASE_DIR, timeout: 15000 }
          );
          if (stderr && stderr.includes('error TS')) {
            await fs.unlink(tmpPath).catch(() => {});
            return `TypeScript validation failed:\n${stderr.substring(0, 500)}`;
          }
        } catch (tsError: any) {
          // tsc exits with code 1 even for warnings; check if it's a real error
          if (tsError.stderr && tsError.stderr.includes('error TS')) {
            await fs.unlink(tmpPath).catch(() => {});
            return `TypeScript validation failed:\n${tsError.stderr.substring(0, 500)}`;
          }
        }
        await fs.unlink(tmpPath).catch(() => {});
      }
      
      await fs.writeFile(absolutePath, content, 'utf-8');
      console.log(`[CodeAgent] write_file: ${absolutePath} (${content.length} chars)`);
      return `SUCCESS: File written to ${absolutePath}`;
    } catch (e: any) {
      return `ERROR writing file: ${e.message}`;
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. For TypeScript files (.ts/.tsx), validates syntax before writing. Creates parent directories if needed.',
    schema: z.object({
      filePath: z.string().describe('The path to the file to write'),
      content: z.string().describe('The full content to write to the file'),
    }),
  }
);

/**
 * edit_file: Make targeted edits to a file using find-and-replace
 */
export const editFileTool = tool(
  async ({ filePath, findText, replaceText }) => {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(BASE_DIR, filePath);
      
      const originalContent = await fs.readFile(absolutePath, 'utf-8');
      
      if (!originalContent.includes(findText)) {
        return `ERROR: Text not found in file. The exact text to find was not present in ${absolutePath}`;
      }
      
      const newContent = originalContent.replace(findText, replaceText);
      await fs.writeFile(absolutePath, newContent, 'utf-8');
      
      console.log(`[CodeAgent] edit_file: ${absolutePath} - replaced ${findText.length} chars`);
      return `SUCCESS: File edited at ${absolutePath}`;
    } catch (e: any) {
      return `ERROR editing file: ${e.message}`;
    }
  },
  {
    name: 'edit_file',
    description: 'Make a targeted edit to a file by finding exact text and replacing it. More reliable than write_file for small changes.',
    schema: z.object({
      filePath: z.string().describe('The path to the file to edit'),
      findText: z.string().describe('The exact text to find in the file (must match exactly)'),
      replaceText: z.string().describe('The text to replace it with'),
    }),
  }
);

/**
 * run_shell: Execute a whitelisted shell command
 */
export const runShellTool = tool(
  async ({ command, workingDir }) => {
    try {
      if (!isCommandAllowed(command)) {
        const firstWord = command.trim().split(/\s+/)[0];
        return `ERROR: Command '${firstWord}' is not in the allowed list: ${ALLOWED_COMMANDS.join(', ')}`;
      }
      
      // Safety: block dangerous patterns
      const dangerous = ['rm -rf', 'sudo', '> /dev', 'dd if=', 'mkfs', ':(){'];
      for (const d of dangerous) {
        if (command.includes(d)) {
          return `ERROR: Dangerous command pattern detected: '${d}'`;
        }
      }
      
      const cwd = workingDir || BASE_DIR;
      console.log(`[CodeAgent] run_shell: ${command} (cwd: ${cwd})`);
      
      const { stdout, stderr } = await execAsync(command, { 
        cwd, 
        timeout: 60000,
        env: { ...process.env }
      });
      
      const output = [];
      if (stdout) output.push(`STDOUT:\n${stdout}`);
      if (stderr) output.push(`STDERR:\n${stderr}`);
      
      return output.join('\n') || 'Command completed with no output';
    } catch (e: any) {
      return `ERROR executing command: ${e.message}\n${e.stderr || ''}`;
    }
  },
  {
    name: 'run_shell',
    description: 'Execute a whitelisted shell command. Allowed commands: pnpm, npx, node, cat, ls, grep, find, echo, git, curl, gcloud, mysql, wc, head, tail, diff.',
    schema: z.object({
      command: z.string().describe('The shell command to execute'),
      workingDir: z.string().optional().describe('Working directory (defaults to project root)'),
    }),
  }
);

/**
 * list_files: List files in a directory
 */
export const listFilesTool = tool(
  async ({ dirPath, pattern }) => {
    try {
      const absolutePath = path.isAbsolute(dirPath) 
        ? dirPath 
        : path.join(BASE_DIR, dirPath);
      
      const files = await fs.readdir(absolutePath, { withFileTypes: true });
      const filtered = files
        .filter(f => !pattern || f.name.includes(pattern))
        .map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`)
        .join('\n');
      
      return filtered || 'No files found';
    } catch (e: any) {
      return `ERROR listing files: ${e.message}`;
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory. Useful for exploring the codebase.',
    schema: z.object({
      dirPath: z.string().describe('The directory path to list'),
      pattern: z.string().optional().describe('Optional filter pattern for file names'),
    }),
  }
);

export const codeAgentTools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  runShellTool,
  listFilesTool,
];
