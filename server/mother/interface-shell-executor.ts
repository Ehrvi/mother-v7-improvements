// server/mother/interface-shell-executor.ts
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';

const logger = createLogger('interface-shell-executor');

export const MOTHER_DIR = existsSync('/app/server')
  ? '/app'
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ALLOWED_COMMANDS = new Set([
  'ls',
  'cat',
  'git',
  'tsc',
  'npm',
  'npx',
  'grep',
  'find',
  'echo',
  'pwd',
  'node',
  'curl',
  'wc',
  'head',
  'tail',
  'diff',
]);

const FORBIDDEN_COMMANDS = new Set([
  'rm',
  'sudo',
  'dd',
  'mkfs',
  'fdisk',
  'chmod',
  'chown',
  'kill',
  'pkill',
]);

export function parseShellInput(input: string): { command: string; args: string[] } {
  // Basic shell-like parsing respecting quotes (single and double)
  // This parser will split input into tokens considering quotes
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (escaped) {
      current += c;
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (c.match(/\s/) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += c;
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  const command = tokens.length > 0 ? tokens[0] : '';
  const args = tokens.length > 1 ? tokens.slice(1) : [];

  return { command, args };
}

export function validateCommand(command: string, args: string[]): { safe: boolean; reason?: string } {
  if (!command) {
    return { safe: false, reason: 'No command provided' };
  }
  if (FORBIDDEN_COMMANDS.has(command)) {
    return { safe: false, reason: `Command "${command}" is forbidden` };
  }
  if (!ALLOWED_COMMANDS.has(command)) {
    return { safe: false, reason: `Command "${command}" is not in allowed list` };
  }
  // Additional validation could be added here if necessary
  return { safe: true };
}

function sendSSE(res: Response, data: any) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function handleShellExec(req: Request, res: Response): void {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    const { command, args = [], timeout, cwd } = req.body ?? {};

    if (typeof command !== 'string') {
      res.status(400).json({ error: 'Invalid command' });
      return;
    }
    if (!Array.isArray(args)) {
      res.status(400).json({ error: 'Args must be an array of strings' });
      return;
    }
    if (timeout !== undefined && (typeof timeout !== 'number' || timeout <= 0)) {
      res.status(400).json({ error: 'Timeout must be a positive number if provided' });
      return;
    }
    if (cwd !== undefined && typeof cwd !== 'string') {
      res.status(400).json({ error: 'Cwd must be a string if provided' });
      return;
    }

    const { safe, reason } = validateCommand(command, args);
    if (!safe) {
      res.status(403).json({ error: `Command validation failed: ${reason}` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    res.flushHeaders?.();

    let exited = false;
    const proc = spawn(command, args, {
      cwd: cwd ?? MOTHER_DIR,
      shell: false,
      windowsHide: true,
    });

    let killTimer: NodeJS.Timeout | undefined;
    if (timeout) {
      killTimer = setTimeout(() => {
        if (!exited) {
          proc.kill('SIGKILL');
          sendSSE(res, {
            type: 'exit',
            content: `Process killed after timeout (${timeout}ms)`,
            exitCode: null,
          });
          res.end();
        }
      }, timeout);
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      sendSSE(res, { type: 'stdout', content: chunk.toString('utf-8') });
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      sendSSE(res, { type: 'stderr', content: chunk.toString('utf-8') });
    });

    proc.on('error', (err) => {
      if (!exited) {
        exited = true;
        if (killTimer) clearTimeout(killTimer);
        sendSSE(res, { type: 'stderr', content: `Process error: ${err.message}` });
        sendSSE(res, { type: 'exit', content: 'Process error', exitCode: null });
        res.end();
      }
    });

    proc.on('close', (code, signal) => {
      if (!exited) {
        exited = true;
        if (killTimer) clearTimeout(killTimer);
        let exitMsg = `Process exited with code ${code}`;
        if (signal) {
          exitMsg += `, signal ${signal}`;
        }
        sendSSE(res, { type: 'exit', content: exitMsg, exitCode: code ?? null });
        res.end();
      }
    });

    // In case client disconnects, kill the child process
    req.on('close', () => {
      if (!exited) {
        exited = true;
        if (killTimer) clearTimeout(killTimer);
        try {
          proc.kill('SIGKILL');
        } catch {}
        res.end();
      }
    });
  } catch (err: any) {
    logger.error('handleShellExec error', { error: err });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}