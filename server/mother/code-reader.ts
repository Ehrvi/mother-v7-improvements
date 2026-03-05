/**
 * Code Reader — MOTHER reads her own source code from GitHub
 * 
 * Scientific Basis: SWE-agent ACI (arXiv:2405.15793)
 * "The Agent-Computer Interface (ACI) enables LM agents to read files,
 * search code, edit files, and run tests — the missing piece for autonomous
 * software engineering."
 * 
 * This implements the file_viewer and code_search tools from SWE-agent
 * adapted for MOTHER's GitHub repository.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'Ehrvi';
const REPO_NAME = 'mother-v7-improvements';
const DEFAULT_BRANCH = 'main';

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
  encoding: string;
}

export interface SearchResult {
  path: string;
  matches: Array<{ line: number; text: string }>;
}

/**
 * Read a file from MOTHER's own GitHub repository
 * This is the "file_viewer" tool from SWE-agent
 */
export async function readOwnFile(filePath: string, branch = DEFAULT_BRANCH): Promise<FileContent | null> {
  try {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branch}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MOTHER-Agent/79.2'
      }
    });
    
    if (!response.ok) {
      console.warn(`[CodeReader] File not found: ${filePath} (${response.status})`);
      return null;
    }
    
    const data = await response.json() as any;
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return {
      path: filePath,
      content,
      sha: data.sha,
      size: data.size,
      encoding: 'utf-8'
    };
  } catch (err) {
    console.error(`[CodeReader] Error reading ${filePath}:`, err);
    return null;
  }
}

/**
 * Search for a pattern in MOTHER's codebase
 * This is the "code_search" tool from SWE-agent
 */
export async function searchOwnCode(query: string, path = 'server'): Promise<SearchResult[]> {
  try {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${REPO_OWNER}/${REPO_NAME}+path:${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MOTHER-Agent/79.2'
      }
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json() as any;
    return (data.items || []).slice(0, 10).map((item: any) => ({
      path: item.path,
      matches: []
    }));
  } catch (err) {
    console.error(`[CodeReader] Search error:`, err);
    return [];
  }
}

/**
 * List all files in a directory of MOTHER's repository
 */
export async function listOwnDirectory(dirPath: string): Promise<string[]> {
  try {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${dirPath}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MOTHER-Agent/79.2'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json() as any[];
    return data.filter(f => f.type === 'file').map(f => f.path);
  } catch (err) {
    return [];
  }
}

/**
 * Read multiple files at once (for context building)
 */
export async function readMultipleFiles(filePaths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  await Promise.all(filePaths.map(async (path) => {
    const file = await readOwnFile(path);
    if (file) {
      results.set(path, file.content);
    }
  }));
  
  return results;
}
