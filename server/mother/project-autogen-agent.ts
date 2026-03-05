// server/mother/project-autogen-agent.ts
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';
import { createModule } from './autonomous-project-manager';

const logger = createLogger('project-autogen');
const MOTHER_DIR = existsSync('/app/server') ? '/app' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function handleProjectCreate(req: Request, res: Response) {
    const { name, description, type } = req.body;

    if (!name || !description || !type) {
        return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    const spec = { name, description, type };
    const report = await generateProjectCode(spec);
    res.json(report);
}

async function generateProjectCode(spec: { name: string; description: string; type: 'api' | 'worker' | 'shms-module' }) {
    const startTime = Date.now();
    const filesCreated: string[] = [];
    let commitHash = '';
    let tsErrors = 0;
    let testsPassed = false;

    try {
        // Step 1: Generate code using MOTHER LLM
        const generatedCode = await queryMotherLLM(spec);
        const projectDir = path.join(MOTHER_DIR, 'projects', spec.name);

        // Step 2: Validate and write files
        validateAndCommit(generatedCode.files);
        for (const file of generatedCode.files) {
            const filePath = path.join(projectDir, file.name);
            if (!existsSync(projectDir)) {
                mkdirSync(projectDir, { recursive: true });
            }
            writeFileSync(filePath, file.content);
            filesCreated.push(filePath);
        }

        // Step 3: Test the project
        testsPassed = runTests(projectDir);
        
        // Step 4: Commit the changes
        commitHash = commitChanges(projectDir);

    } catch (error) {
        logger.error('Error generating project code:', error);
        tsErrors++;
    }

    const duration = Date.now() - startTime;
    return {
        success: tsErrors === 0 && testsPassed,
        filesCreated,
        commitHash,
        tsErrors,
        testsPassed,
        duration,
    };
}

async function queryMotherLLM(spec: { name: string; description: string; type: 'api' | 'worker' | 'shms-module' }) {
    // Integrate with /api/a2a/query to generate code
    const response = await fetch('/api/a2a/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
    });

    if (!response.ok) {
        throw new Error('Failed to generate code from MOTHER LLM');
    }

    return await response.json();
}

function validateAndCommit(files: any[]) {
    // Validate files and commit if valid
    files.forEach(file => {
        if (!file.name || !file.content) {
            throw new Error(`Invalid file structure: ${file.name}`);
        }
    });
}

function runTests(projectDir: string): boolean {
    try {
        execSync('npm test', { cwd: projectDir });
        return true;
    } catch (error) {
        logger.error('Tests failed:', error);
        return false;
    }
}

function commitChanges(projectDir: string): string {
    try {
        execSync('git add .', { cwd: projectDir });
        const commitMessage = 'Auto-generated project: ' + path.basename(projectDir);
        execSync(`git commit -m "${commitMessage}"`, { cwd: projectDir });
        const commitHash = execSync('git rev-parse HEAD', { cwd: projectDir }).toString().trim();
        return commitHash;
    } catch (error) {
        logger.error('Failed to commit changes:', error);
        throw new Error('Commit failed');
    }
}