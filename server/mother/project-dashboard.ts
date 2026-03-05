// server/mother/project-dashboard.ts
import { readdirSync, existsSync, statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';

const logger = createLogger('project-dashboard');

const MOTHER_DIR = existsSync('/app/server')
  ? '/app'
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SUBPROJECTS_DIR = path.join(MOTHER_DIR, 'server', 'subprojects');
const LOG_MAX_LINES = 100;

interface ProjectInfo {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  lastCommit: {
    hash: string;
    message: string;
    date: string;
    author: string;
  } | null;
  files: string[];
  activeEndpoints: string[];
}

function getProjectPath(name: string): string {
  return path.join(SUBPROJECTS_DIR, name);
}

function getGitLastCommit(projectPath: string) {
  try {
    // git log -1 --pretty=format:"%H|%s|%ci|%an"
    const out = execSync(
      'git log -1 --pretty=format:%H|%s|%ci|%an',
      { cwd: projectPath, encoding: 'utf8' }
    );
    const [hash, message, date, author] = out.trim().split('|');
    return { hash, message, date, author };
  } catch (e) {
    logger.warn(`Failed to get last commit for ${projectPath}: ${(e as Error).message}`);
    return null;
  }
}

function getProjectFiles(projectPath: string): string[] {
  try {
    // List all files recursively inside projectPath (excluding node_modules and .git)
    const files: string[] = [];
    function walk(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          files.push(path.relative(projectPath, fullPath));
        }
      }
    }
    walk(projectPath);
    return files;
  } catch (e) {
    logger.warn(`Failed to list files for ${projectPath}: ${(e as Error).message}`);
    return [];
  }
}

function getActiveEndpoints(projectPath: string): string[] {
  // Heuristic: check package.json scripts or a known endpoints.json file or scan source for .route or .use calls
  // For this spec, let's check if endpoints.json exists inside projectPath
  try {
    const endpointsFile = path.join(projectPath, 'endpoints.json');
    if (existsSync(endpointsFile)) {
      const content = readFileSync(endpointsFile, 'utf8');
      const endpoints = JSON.parse(content);
      if (Array.isArray(endpoints)) {
        return endpoints.map(String);
      }
    }
  } catch (e) {
    logger.warn(`Failed to read active endpoints for ${projectPath}: ${(e as Error).message}`);
  }
  // fallback empty
  return [];
}

function getProjectStatus(projectPath: string, projectName: string): 'running' | 'stopped' | 'unknown' {
  // Heuristic: check if a PID file exists or if a pm2 process is running for that project name
  // For this implementation, check if a .pid file exists inside projectPath/.service.pid and if process is alive
  try {
    const pidFile = path.join(projectPath, '.service.pid');
    if (!existsSync(pidFile)) return 'stopped';
    const pidStr = readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return 'unknown';
    try {
      process.kill(pid, 0); // check if process exists
      return 'running';
    } catch {
      return 'stopped';
    }
  } catch (e) {
    logger.warn(`Failed to get status for ${projectName}: ${(e as Error).message}`);
    return 'unknown';
  }
}

function listSubprojects(): string[] {
  try {
    if (!existsSync(SUBPROJECTS_DIR)) return [];
    return readdirSync(SUBPROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    logger.error(`Failed to list subprojects: ${(e as Error).message}`);
    return [];
  }
}

export async function handleProjectsList(req: Request, res: Response) {
  try {
    const projects = listSubprojects();
    const projectInfos: ProjectInfo[] = projects.map((name) => {
      const projectPath = getProjectPath(name);
      return {
        name,
        status: getProjectStatus(projectPath, name),
        lastCommit: getGitLastCommit(projectPath),
        files: getProjectFiles(projectPath),
        activeEndpoints: getActiveEndpoints(projectPath),
      };
    });
    res.json({ projects: projectInfos });
  } catch (e) {
    logger.error(`handleProjectsList error: ${(e as Error).message}`);
    res.status(500).json({ error: 'Failed to list projects' });
  }
}

export async function handleProjectLogs(req: Request, res: Response) {
  try {
    const name = req.params.name;
    if (!name) {
      res.status(400).json({ error: 'Project name required' });
      return;
    }
    const projectPath = getProjectPath(name);
    if (!existsSync(projectPath)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    // Assume logs are in projectPath/logs/service.log or projectPath/logs/app.log
    // Try service.log first, fallback app.log
    let logFile = path.join(projectPath, 'logs', 'service.log');
    if (!existsSync(logFile)) {
      logFile = path.join(projectPath, 'logs', 'app.log');
      if (!existsSync(logFile)) {
        res.status(404).json({ error: 'Log file not found' });
        return;
      }
    }
    const content = readFileSync(logFile, 'utf8');
    const lines = content.split(/\r?\n/);
    const lastLines = lines.slice(-LOG_MAX_LINES);
    res.json({ logs: lastLines });
  } catch (e) {
    logger.error(`handleProjectLogs error: ${(e as Error).message}`);
    res.status(500).json({ error: 'Failed to get project logs' });
  }
}

export async function handleProjectRestart(req: Request, res: Response) {
  try {
    const name = req.params.name;
    if (!name) {
      res.status(400).json({ error: 'Project name required' });
      return;
    }
    const projectPath = getProjectPath(name);
    if (!existsSync(projectPath)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    // Perform git pull
    try {
      execSync('git pull', { cwd: projectPath, stdio: 'ignore' });
    } catch (e) {
      logger.warn(`git pull failed for project ${name}: ${(e as Error).message}`);
      res.status(500).json({ error: 'Git pull failed' });
      return;
    }
    // Restart service: heuristic - if a restart.sh script exists run it, else kill pid and restart with node index.js
    const restartScript = path.join(projectPath, 'restart.sh');
    if (existsSync(restartScript)) {
      try {
        execSync(`bash ${restartScript}`, { cwd: projectPath, stdio: 'ignore' });
        res.json({ message: 'Project restarted via restart.sh' });
        return;
      } catch (e) {
        logger.warn(`restart.sh failed for project ${name}: ${(e as Error).message}`);
        res.status(500).json({ error: 'Restart script failed' });
        return;
      }
    }
    // fallback restart by killing pid and starting node index.js
    const pidFile = path.join(projectPath, '.service.pid');
    try {
      if (existsSync(pidFile)) {
        const pidStr = readFileSync(pidFile, 'utf8').trim();
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          process.kill(pid, 'SIGTERM');
          // Wait a short moment for process to close
          const waitUntil = Date.now() + 3000;
          while (Date.now() < waitUntil) {
            try {
              process.kill(pid, 0);
              // still alive
              continue;
            } catch {
              break; // process exited
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`Failed to kill process for project ${name}: ${(e as Error).message}`);
    }
    try {
      // Start node index.js detached
      const spawn = await import('child_process').then(m => m.spawn);
      const child = spawn('node', ['index.js'], {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      // Write pid file
      const fs = await import('fs/promises');
      await fs.writeFile(pidFile, (child.pid ?? 0).toString(), "utf8");
      res.json({ message: 'Project restarted via node index.js' });
    } catch (e) {
      logger.error(`Failed to start project ${name}: ${(e as Error).message}`);
      res.status(500).json({ error: 'Failed to restart project' });
    }
  } catch (e) {
    logger.error(`handleProjectRestart error: ${(e as Error).message}`);
    res.status(500).json({ error: 'Failed to restart project' });
  }
}

export async function handleProjectStats(req: Request, res: Response) {
  try {
    const projects = listSubprojects();
    let totalCommits = 0;
    let totalFiles = 0;
    let runningCount = 0;
    let stoppedCount = 0;
    let unknownCount = 0;

    for (const name of projects) {
      const projectPath = getProjectPath(name);
      const status = getProjectStatus(projectPath, name);
      if (status === 'running') runningCount++;
      else if (status === 'stopped') stoppedCount++;
      else unknownCount++;
      const commit = getGitLastCommit(projectPath);
      if (commit && commit.hash) totalCommits++;
      const files = getProjectFiles(projectPath);
      totalFiles += files.length;
    }

    res.json({
      totalProjects: projects.length,
      totalCommits,
      totalFiles,
      statusCount: {
        running: runningCount,
        stopped: stoppedCount,
        unknown: unknownCount,
      },
    });
  } catch (e) {
    logger.error(`handleProjectStats error: ${(e as Error).message}`);
    res.status(500).json({ error: 'Failed to get project stats' });
  }
}