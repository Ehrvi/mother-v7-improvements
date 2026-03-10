/**
 * Whisper STT Pipeline — server/mother/whisper-stt.ts
 * MOTHER v96.0 | Ciclo C214 | NC-SENS-007
 *
 * Speech-to-Text pipeline using OpenAI Whisper API.
 * Enables MOTHER to process audio inputs (voice queries, SHMS audio alerts, etc.)
 *
 * Scientific basis:
 * - Radford et al. (2022) "Robust Speech Recognition via Large-Scale Weak Supervision"
 *   arXiv:2212.04356 — Whisper model (99 languages, 0-shot)
 * - Baevski et al. (2020) "wav2vec 2.0: A Framework for Self-Supervised Learning of Speech"
 *   arXiv:2006.11477 — self-supervised speech representations
 * - Peng et al. (2023) "Reproducing Whisper-Style Training Using an Open-Source Toolkit"
 *   arXiv:2309.13876 — Whisper training methodology
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface STTRequest {
  audioFilePath?: string;       // Path to local audio file
  audioUrl?: string;            // URL of audio file to transcribe
  audioBuffer?: Buffer;         // Raw audio buffer
  language?: string;            // ISO 639-1 language code (e.g., 'pt', 'en')
  prompt?: string;              // Optional context prompt to improve accuracy
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;         // 0-1, higher = more creative
}

export interface STTResult {
  success: boolean;
  text?: string;
  language?: string;
  duration?: number;            // Audio duration in seconds
  segments?: STTSegment[];      // Word-level timestamps (verbose_json only)
  error?: string;
  model: string;
  durationMs: number;
}

export interface STTSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SUPPORTED_FORMATS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];
const MAX_FILE_SIZE_MB = 25;

/**
 * Detect if a query contains audio input that needs STT processing.
 */
export function detectAudioInput(query: string): {
  hasAudio: boolean;
  audioPath?: string;
  audioUrl?: string;
} {
  // Check for file paths
  const filePathMatch = query.match(/(?:arquivo|file|audio|áudio):\s*([^\s]+\.(?:mp3|mp4|wav|webm|m4a))/i);
  if (filePathMatch) {
    return { hasAudio: true, audioPath: filePathMatch[1] };
  }

  // Check for URLs
  const urlMatch = query.match(/https?:\/\/[^\s]+\.(?:mp3|mp4|wav|webm|m4a)/i);
  if (urlMatch) {
    return { hasAudio: true, audioUrl: urlMatch[0] };
  }

  return { hasAudio: false };
}

/**
 * Transcribe audio using OpenAI Whisper API.
 */
export async function transcribeAudio(request: STTRequest): Promise<STTResult> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'OPENAI_API_KEY not configured',
      model: 'whisper-1',
      durationMs: Date.now() - startTime,
    };
  }

  try {
    let audioBuffer: Buffer;
    let fileName: string;

    if (request.audioBuffer) {
      audioBuffer = request.audioBuffer;
      fileName = 'audio.wav';
    } else if (request.audioFilePath) {
      const ext = path.extname(request.audioFilePath).toLowerCase();
      if (!SUPPORTED_FORMATS.includes(ext)) {
        return {
          success: false,
          error: `Unsupported audio format: ${ext}. Supported: ${SUPPORTED_FORMATS.join(', ')}`,
          model: 'whisper-1',
          durationMs: Date.now() - startTime,
        };
      }

      const stats = fs.statSync(request.audioFilePath);
      if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return {
          success: false,
          error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_FILE_SIZE_MB}MB`,
          model: 'whisper-1',
          durationMs: Date.now() - startTime,
        };
      }

      audioBuffer = fs.readFileSync(request.audioFilePath);
      fileName = path.basename(request.audioFilePath);
    } else if (request.audioUrl) {
      audioBuffer = await downloadAudioBuffer(request.audioUrl);
      fileName = request.audioUrl.split('/').pop() ?? 'audio.mp3';
    } else {
      return {
        success: false,
        error: 'No audio source provided (audioFilePath, audioUrl, or audioBuffer required)',
        model: 'whisper-1',
        durationMs: Date.now() - startTime,
      };
    }

    // Build multipart form data
    const boundary = `----FormBoundary${Date.now()}`;
    const formData = buildMultipartForm(boundary, audioBuffer, fileName, {
      model: 'whisper-1',
      language: request.language ?? 'pt',
      response_format: request.responseFormat ?? 'verbose_json',
      temperature: String(request.temperature ?? 0),
      ...(request.prompt ? { prompt: request.prompt } : {}),
    });

    const result = await postToWhisperAPI(formData, boundary, apiKey);

    if (request.responseFormat === 'text') {
      return {
        success: true,
        text: result as string,
        model: 'whisper-1',
        durationMs: Date.now() - startTime,
      };
    }

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return {
      success: true,
      text: parsed.text,
      language: parsed.language,
      duration: parsed.duration,
      segments: parsed.segments,
      model: 'whisper-1',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      model: 'whisper-1',
      durationMs: Date.now() - startTime,
    };
  }
}

function buildMultipartForm(
  boundary: string,
  audioBuffer: Buffer,
  fileName: string,
  fields: Record<string, string>
): Buffer {
  const parts: Buffer[] = [];

  // Add text fields
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }

  // Add file
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === '.mp3' ? 'audio/mpeg'
    : ext === '.wav' ? 'audio/wav'
    : ext === '.webm' ? 'audio/webm'
    : ext === '.m4a' ? 'audio/mp4'
    : 'audio/mpeg';

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return Buffer.concat(parts);
}

async function postToWhisperAPI(
  formData: Buffer,
  boundary: string,
  apiKey: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formData.length,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Whisper API error ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        }
      });
    });

    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

async function downloadAudioBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate STT capability description for system prompt.
 */
export function generateSTTDescription(): string {
  return [
    '## NC-SENS-007: WHISPER STT DISPONÍVEL',
    'MOTHER pode transcrever áudio via OpenAI Whisper-1.',
    'Formatos suportados: MP3, MP4, WAV, WebM, M4A (max 25MB)',
    'Para transcrever: forneça caminho do arquivo ou URL do áudio.',
    'Idiomas: 99 idiomas (padrão: português)',
  ].join('\n');
}
