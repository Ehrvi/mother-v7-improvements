// server/mother/code-editor-integration.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';

const logger = createLogger('code-editor');
const MOTHER_DIR = existsSync('/app/server') ? '/app' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EDITABLE_DIRS = [path.join(MOTHER_DIR, 'server', 'mother'), path.join(MOTHER_DIR, 'server', '_core')];
const editHistory: string[][] = [];

function isEditableFile(filePath: string): boolean {
    return EDITABLE_DIRS.some(dir => filePath.startsWith(dir));
}

function addToEditHistory(filePath: string, oldContent: string, newContent: string): void {
    if (editHistory.length >= 10) {
        editHistory.shift(); // Remove the oldest entry
    }
    editHistory.push([filePath, oldContent, newContent]);
}

function getDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    oldLines.forEach((line, index) => {
        if (newLines[index] !== line) {
            diff.push(`- ${line}`);
        }
    });

    newLines.forEach((line, index) => {
        if (oldLines[index] !== line) {
            diff.push(`+ ${line}`);
        }
    });

    return diff.join('\n');
}

export function handleCodeRead(req: Request, res: Response): void {
    const filePath = path.join(MOTHER_DIR, 'server', 'mother', req.params.file);
    if (!isEditableFile(filePath)) {
        res.status(403).send('Access denied to this file.'); return;
    }

    try {
        const content = readFileSync(filePath, 'utf-8');
        res.status(200).json({ content });
    } catch (error) {
        logger.error('Error reading file', { error: String(error) });
        res.status(500).send('Error reading file.');
    }
}

export function handleCodeWrite(req: Request, res: Response): void {
    const filePath = path.join(MOTHER_DIR, 'server', 'mother', req.params.file);
    if (!isEditableFile(filePath)) {
        res.status(403).send('Access denied to this file.'); return;
    }

    try {
        const newContent = req.body.content;
        const oldContent = readFileSync(filePath, 'utf-8');

        // Validate TypeScript
        execSync('npx tsc --noEmit', { stdio: 'ignore', cwd: MOTHER_DIR });

        writeFileSync(filePath, newContent, 'utf-8');
        addToEditHistory(filePath, oldContent, newContent);

        const diff = getDiff(oldContent, newContent);
        logger.info(`File ${filePath} updated. Changes:\n${diff}`);
        res.status(200).send('File written successfully.');
    } catch (error) {
        logger.error('Error writing file', { error: String(error) });
        res.status(500).send('Error writing file.');
    }
}

export function getEditHistory(): string[][] {
    return editHistory;
}