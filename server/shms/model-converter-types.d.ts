// Type declarations for 3D conversion packages (no @types available)
declare module 'obj2gltf' {
  function obj2gltf(input: string, options?: {
    binary?: boolean;
    separate?: boolean;
    inputUpAxis?: string;
  }): Promise<Buffer>;
  export default obj2gltf;
}

declare module 'gltf-pipeline' {
  interface GltfPipelineResult {
    glb: ArrayBuffer;
    gltf?: Record<string, unknown>;
  }
  interface GltfPipelineOptions {
    dracoOptions?: {
      compressionLevel?: number;
      quantizeBits?: number;
    };
    resourceDirectory?: string;
    separateTextures?: boolean;
  }
  export function processGlb(glb: Buffer | ArrayBuffer, options?: GltfPipelineOptions): Promise<GltfPipelineResult>;
  export function gltfToGlb(gltf: Record<string, unknown>, options?: GltfPipelineOptions): Promise<GltfPipelineResult>;
  export function processGltf(gltf: Record<string, unknown>, options?: GltfPipelineOptions): Promise<GltfPipelineResult>;
}
