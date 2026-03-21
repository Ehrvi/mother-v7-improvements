/**
 * SHMS 3D Model Converter — server/shms/model-converter.ts
 *
 * Automated conversion of 3D model formats to optimized GLB for Three.js.
 *
 * Scientific basis:
 * - Khronos Group (2015): glTF 2.0 Specification — "JPEG of 3D"
 * - Draco compression (Google, 2017): geometry compression for web delivery
 * - Grieves (2014): Digital Twin — virtual factory replication
 *
 * Phase 1 (JS-pure, Cloud Run safe):
 *   OBJ/MTL, glTF, STL, PLY → optimized GLB + Draco
 *
 * Phase 2 (future — requires Docker/WASM):
 *   IFC (web-ifc), STEP/IGES (OpenCASCADE), FBX (fbx2gltf binary)
 */

import fs from 'fs';
import path from 'path';

// ─── Supported formats (Phase 1: JS-pure only) ─────────────────────────────
const SUPPORTED_EXTENSIONS = new Set([
  '.obj', '.gltf', '.glb', '.stl', '.ply',
]);

// Magic bytes for format verification (security: don't trust extension alone)
const MAGIC_BYTES: Record<string, Buffer> = {
  '.glb': Buffer.from([0x67, 0x6C, 0x54, 0x46]),  // "glTF"
  '.stl': Buffer.from('solid', 'ascii'),             // ASCII STL starts with "solid"
  '.ply': Buffer.from('ply', 'ascii'),               // PLY starts with "ply"
};

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ConversionResult {
  success: boolean;
  outputPath: string;
  originalFormat: string;
  originalSize: number;
  convertedSize: number;
  compressionRatio: number;
  conversionTimeMs: number;
  error?: string;
}

export interface ConversionOptions {
  dracoCompression?: boolean;
  dracoCompressionLevel?: number;  // 0-10, default 7
  maxTextureSize?: number;         // px, default 2048
}

// ─── Format Detection ───────────────────────────────────────────────────────

/**
 * Detect 3D format from extension + magic bytes
 * Security: validates file header matches claimed extension
 */
export function detectFormat(filePath: string): { ext: string; valid: boolean; reason?: string } {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { ext, valid: false, reason: `Unsupported format: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}` };
  }

  // Validate magic bytes if we have them
  const magicCheck = MAGIC_BYTES[ext];
  if (magicCheck && fs.existsSync(filePath)) {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(magicCheck.length);
    fs.readSync(fd, header, 0, magicCheck.length, 0);
    fs.closeSync(fd);

    // STL can be binary (no "solid" header) — allow both
    if (ext === '.stl' && !header.toString('ascii').startsWith('solid')) {
      // Binary STL — still valid
    } else if (!header.subarray(0, magicCheck.length).equals(magicCheck)) {
      return { ext, valid: false, reason: `File header mismatch for ${ext}` };
    }
  }

  // Size check: max 100MB
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.size > 100 * 1024 * 1024) {
      return { ext, valid: false, reason: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 100MB)` };
    }
  }

  return { ext, valid: true };
}

// ─── Conversion Engine ──────────────────────────────────────────────────────

/**
 * Convert any supported 3D format → optimized GLB
 * Uses obj2gltf (Cesium team) and gltf-pipeline (Draco compression)
 */
export async function convertModel(
  inputPath: string,
  outputDir: string,
  options: ConversionOptions = {},
): Promise<ConversionResult> {
  const startTime = Date.now();
  const { ext, valid, reason } = detectFormat(inputPath);

  if (!valid) {
    return {
      success: false, outputPath: '', originalFormat: ext,
      originalSize: 0, convertedSize: 0, compressionRatio: 0,
      conversionTimeMs: Date.now() - startTime, error: reason,
    };
  }

  const originalSize = fs.statSync(inputPath).size;
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(outputDir, `${baseName}.glb`);

  try {
    if (ext === '.glb') {
      // Already GLB — just optimize with Draco
      await optimizeGLB(inputPath, outputPath, options);
    } else if (ext === '.gltf') {
      // glTF → GLB (pack into single binary + Draco)
      await gltfToGLB(inputPath, outputPath, options);
    } else if (ext === '.obj') {
      // OBJ → GLB (via obj2gltf)
      await objToGLB(inputPath, outputPath, options);
    } else if (ext === '.stl') {
      // STL → GLB (via obj2gltf which also handles STL)
      await stlToGLB(inputPath, outputPath, options);
    } else if (ext === '.ply') {
      // PLY → GLB (parse points → buffer geometry → glTF)
      await plyToGLB(inputPath, outputPath, options);
    }

    const convertedSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    const compressionRatio = originalSize > 0 ? (1 - convertedSize / originalSize) * 100 : 0;

    console.log(`[ModelConverter] ${ext} → GLB: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(convertedSize / 1024 / 1024).toFixed(1)}MB (${compressionRatio.toFixed(0)}% reduction) in ${Date.now() - startTime}ms`);

    return {
      success: true, outputPath, originalFormat: ext,
      originalSize, convertedSize, compressionRatio,
      conversionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ModelConverter] Failed to convert ${inputPath}: ${msg}`);
    return {
      success: false, outputPath: '', originalFormat: ext,
      originalSize, convertedSize: 0, compressionRatio: 0,
      conversionTimeMs: Date.now() - startTime, error: msg,
    };
  }
}

// ─── Individual Converters ──────────────────────────────────────────────────

async function objToGLB(input: string, output: string, opts: ConversionOptions): Promise<void> {
  // Dynamic import — obj2gltf is ESM
  const obj2gltf = await import('obj2gltf');
  const convert = obj2gltf.default || obj2gltf;

  // Look for companion MTL file
  const mtlPath = input.replace(/\.obj$/i, '.mtl');
  const hasMtl = fs.existsSync(mtlPath);

  const glb = await convert(input, {
    binary: true,
    separate: false,
    // If MTL exists, obj2gltf auto-detects it from OBJ file references
  });

  // Apply Draco compression via gltf-pipeline
  if (opts.dracoCompression !== false) {
    const { processGlb } = await import('gltf-pipeline');
    const result = await processGlb(glb, {
      dracoOptions: { compressionLevel: opts.dracoCompressionLevel ?? 7 },
    });
    fs.writeFileSync(output, Buffer.from(result.glb));
  } else {
    fs.writeFileSync(output, Buffer.from(glb));
  }
}

async function gltfToGLB(input: string, output: string, opts: ConversionOptions): Promise<void> {
  const gltfPipeline = await import('gltf-pipeline');
  const gltfContent = JSON.parse(fs.readFileSync(input, 'utf-8'));
  const result = await gltfPipeline.gltfToGlb(gltfContent, {
    dracoOptions: opts.dracoCompression !== false
      ? { compressionLevel: opts.dracoCompressionLevel ?? 7 }
      : undefined,
    resourceDirectory: path.dirname(input),
  });
  fs.writeFileSync(output, Buffer.from(result.glb));
}

async function optimizeGLB(input: string, output: string, opts: ConversionOptions): Promise<void> {
  const { processGlb } = await import('gltf-pipeline');
  const glbBuffer = fs.readFileSync(input);
  const result = await processGlb(glbBuffer, {
    dracoOptions: opts.dracoCompression !== false
      ? { compressionLevel: opts.dracoCompressionLevel ?? 7 }
      : undefined,
  });
  fs.writeFileSync(output, Buffer.from(result.glb));
}

async function stlToGLB(input: string, output: string, opts: ConversionOptions): Promise<void> {
  // STL has no color/texture — create a simple mesh with default material
  // Parse STL manually and convert to glTF JSON, then pack to GLB
  const stlBuffer = fs.readFileSync(input);
  const isAscii = stlBuffer.toString('ascii', 0, 5) === 'solid';

  let positions: number[] = [];
  let normals: number[] = [];

  if (isAscii) {
    // Parse ASCII STL
    const text = stlBuffer.toString('ascii');
    const facetRegex = /facet\s+normal\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+outer\s+loop\s+vertex\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+vertex\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+vertex\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+endloop\s+endfacet/gi;
    let match;
    while ((match = facetRegex.exec(text)) !== null) {
      const nx = parseFloat(match[1]), ny = parseFloat(match[2]), nz = parseFloat(match[3]);
      for (let v = 0; v < 3; v++) {
        positions.push(parseFloat(match[4 + v * 3]), parseFloat(match[5 + v * 3]), parseFloat(match[6 + v * 3]));
        normals.push(nx, ny, nz);
      }
    }
  } else {
    // Parse binary STL
    const numTriangles = stlBuffer.readUInt32LE(80);
    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      const nx = stlBuffer.readFloatLE(offset); offset += 4;
      const ny = stlBuffer.readFloatLE(offset); offset += 4;
      const nz = stlBuffer.readFloatLE(offset); offset += 4;
      for (let v = 0; v < 3; v++) {
        positions.push(stlBuffer.readFloatLE(offset)); offset += 4;
        positions.push(stlBuffer.readFloatLE(offset)); offset += 4;
        positions.push(stlBuffer.readFloatLE(offset)); offset += 4;
        normals.push(nx, ny, nz);
      }
      offset += 2; // attribute byte count
    }
  }

  // Build minimal glTF
  const posBuffer = Buffer.from(new Float32Array(positions).buffer);
  const normBuffer = Buffer.from(new Float32Array(normals).buffer);
  const combinedBuffer = Buffer.concat([posBuffer, normBuffer]);

  const gltf = {
    asset: { version: '2.0', generator: 'MOTHER-ModelConverter' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.7, 0.7, 0.7, 1], metallicFactor: 0.1, roughnessFactor: 0.8 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', max: getMax(positions, 3), min: getMin(positions, 3) },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuffer.length },
      { buffer: 0, byteOffset: posBuffer.length, byteLength: normBuffer.length },
    ],
    buffers: [{ byteLength: combinedBuffer.length }],
  };

  // Pack to GLB
  const gltfJSON = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = padBuffer(gltfJSON, 0x20); // space padding
  const binPadded = padBuffer(combinedBuffer, 0x00);

  const glbHeader = Buffer.alloc(12);
  glbHeader.writeUInt32LE(0x46546C67, 0); // magic: "glTF"
  glbHeader.writeUInt32LE(2, 4);           // version
  glbHeader.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // "JSON"

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // "BIN\0"

  const glbBuffer2 = Buffer.concat([glbHeader, jsonChunkHeader, jsonPadded, binChunkHeader, binPadded]);

  if (opts.dracoCompression !== false) {
    const { processGlb } = await import('gltf-pipeline');
    const result = await processGlb(glbBuffer2, {
      dracoOptions: { compressionLevel: opts.dracoCompressionLevel ?? 7 },
    });
    fs.writeFileSync(output, Buffer.from(result.glb));
  } else {
    fs.writeFileSync(output, glbBuffer2);
  }
}

async function plyToGLB(input: string, output: string, opts: ConversionOptions): Promise<void> {
  // Simple PLY parser for vertex positions + colors
  const text = fs.readFileSync(input, 'ascii');
  const headerEnd = text.indexOf('end_header');
  if (headerEnd === -1) throw new Error('Invalid PLY: no end_header');

  const header = text.substring(0, headerEnd);
  const vertexCountMatch = header.match(/element vertex (\d+)/);
  if (!vertexCountMatch) throw new Error('Invalid PLY: no vertex count');
  const vertexCount = parseInt(vertexCountMatch[1]);

  const dataStr = text.substring(headerEnd + 'end_header\n'.length);
  const lines = dataStr.trim().split('\n');
  const positions: number[] = [];

  for (let i = 0; i < Math.min(vertexCount, lines.length); i++) {
    const parts = lines[i].trim().split(/\s+/).map(Number);
    if (parts.length >= 3) {
      positions.push(parts[0], parts[1], parts[2]);
    }
  }

  // Create a point cloud glTF (mode: POINTS = 0)
  const posBuffer = Buffer.from(new Float32Array(positions).buffer);
  const gltf = {
    asset: { version: '2.0', generator: 'MOTHER-ModelConverter' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', max: getMax(positions, 3), min: getMin(positions, 3) },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBuffer.length }],
    buffers: [{ byteLength: posBuffer.length }],
  };

  const gltfJSON = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = padBuffer(gltfJSON, 0x20);
  const binPadded = padBuffer(posBuffer, 0x00);

  const glbHeader = Buffer.alloc(12);
  glbHeader.writeUInt32LE(0x46546C67, 0);
  glbHeader.writeUInt32LE(2, 4);
  glbHeader.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4);

  fs.writeFileSync(output, Buffer.concat([glbHeader, jsonChunkHeader, jsonPadded, binChunkHeader, binPadded]));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMax(arr: number[], stride: number): number[] {
  const result = new Array(stride).fill(-Infinity);
  for (let i = 0; i < arr.length; i++) {
    result[i % stride] = Math.max(result[i % stride], arr[i]);
  }
  return result;
}

function getMin(arr: number[], stride: number): number[] {
  const result = new Array(stride).fill(Infinity);
  for (let i = 0; i < arr.length; i++) {
    result[i % stride] = Math.min(result[i % stride], arr[i]);
  }
  return result;
}

function padBuffer(buf: Buffer, padByte: number): Buffer {
  const remainder = buf.length % 4;
  if (remainder === 0) return buf;
  const pad = Buffer.alloc(4 - remainder, padByte);
  return Buffer.concat([buf, pad]);
}

// ─── Convenience: get supported formats ─────────────────────────────────────
export function getSupportedFormats(): string[] {
  return [...SUPPORTED_EXTENSIONS];
}
