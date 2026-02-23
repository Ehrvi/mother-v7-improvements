/**
 * Python Process Helper for Isolated Text Processing
 * 
 * This module provides a function to spawn a Python process for chunking and embedding generation.
 * The Python process is isolated from the Node.js event loop, preventing memory leaks.
 */

import { spawn } from 'child_process';
import path from 'path';

export interface PythonProcessResult {
  success: boolean;
  chunks?: Array<{
    text: string;
    tokens: number;
    position: number;
    total_tokens: number;
    embedding: number[];
  }>;
  total_chunks?: number;
  total_tokens?: number;
  error?: string;
  error_type?: string;
}

/**
 * Process text using isolated Python process
 * @param text - Input text to process
 * @returns Promise resolving to processing result
 */
export async function processTextWithPython(text: string): Promise<PythonProcessResult> {
  return new Promise((resolve, reject) => {
    // Get OpenAI API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      reject(new Error('OPENAI_API_KEY environment variable not set'));
      return;
    }

    // Prepare input JSON
    const input = JSON.stringify({ text, apiKey });

    // Spawn Python process
    const pythonScript = path.join(__dirname, 'pdf_processor.py');
    const pythonProcess = spawn('python3', [pythonScript]);

    let stdout = '';
    let stderr = '';

    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}. stderr: ${stderr}`));
        return;
      }

      try {
        const result: PythonProcessResult = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${stdout}. stderr: ${stderr}`));
      }
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });

    // Send input to stdin
    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();

    // Set timeout (30 seconds)
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Python process timeout (30s)'));
    }, 30000);
  });
}
