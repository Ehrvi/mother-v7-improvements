// server/mother/dependency-graph-engine.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';

const logger = createLogger('DependencyGraphEngine');
const CACHE_INVALIDATION_TIME = 5 * 60 * 1000; // 5 minutes
let cache: { nodes: any[]; edges: any[] } | null = null;
let lastCacheTime: number = 0;

const MOTHER_DIR = existsSync('/app/server') ? '/app' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function handleDependencyGraph(req: Request, res: Response) {
    if (cache && (Date.now() - lastCacheTime < CACHE_INVALIDATION_TIME)) {
        return res.json(cache);
    }
    
    const dependencyGraph = buildDependencyGraph();
    cache = dependencyGraph;
    lastCacheTime = Date.now();
    
    res.json(dependencyGraph);
}

export function buildDependencyGraph() {
    const nodes: any[] = [];
    const edges: any[] = [];
    const moduleCategories = {
        core: 'core',
        mother: 'mother',
        shms: 'shms',
        a2a: 'a2a',
        other: 'other'
    };

    const directories = [path.join(MOTHER_DIR, 'server/mother'), path.join(MOTHER_DIR, 'server/_core')];
    
    directories.forEach(dir => {
        const files = readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (statSync(filePath).isFile() && file.endsWith('.ts')) {
                const { exports, lines } = analyzeFile(filePath);
                const category = determineCategory(filePath);
                
                nodes.push({
                    id: filePath,
                    file: file,
                    exports: exports,
                    lines: lines,
                    category: category
                });

                exports.forEach((exp: string) => {
                    edges.push({
                        from: filePath,
                        to: exp,
                        type: 'export'
                    });
                });
            }
        });
    });

    return { nodes, edges };
}

function analyzeFile(filePath: string) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const exports = extractExports(content);
    
    return { exports, lines };
}

function extractExports(content: string) {
    const exportRegex = /export\s+(?:default\s+)?(\w+)/g;
    const exports: string[] = [];
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
    }

    return exports;
}

function determineCategory(filePath: string): string {
    if (filePath.includes('/mother/')) {
        return 'mother';
    }
    if (filePath.includes('/_core/')) {
        return 'core';
    }
    if (filePath.includes('shms')) {
        return 'shms';
    }
    if (filePath.includes('a2a')) {
        return 'a2a';
    }
    return 'other';
}

export function invalidateCache() {
    cache = null;
    lastCacheTime = 0;
}