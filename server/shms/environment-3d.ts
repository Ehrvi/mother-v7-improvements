/**
 * SHMS 3D Environment — server/shms/environment-3d.ts
 * MOTHER v7 | Module 5
 *
 * Scientific basis:
 * - Three.js scene graph concepts (no runtime dependency — generate geometry data only)
 * - Digital Elevation Model (DEM) interpolation via bilinear interpolation (Keys, 1981)
 * - IFC (ISO 16739) standard for structural element representation
 * - Point cloud data format: XYZ ASCII (ASPRS LAS standard compatible)
 *
 * References:
 * - Keys, R.G. (1981). "Cubic convolution interpolation for digital image processing."
 *   IEEE Transactions on Acoustics, Speech, and Signal Processing, 29(6), 1153–1160.
 * - ISO 16739-1:2018 — Industry Foundation Classes (IFC) for data sharing in the
 *   construction and facility management industries.
 * - ASPRS LAS Specification 1.4 — R15 (2019). Point Cloud Data Format.
 */

// ─── Core geometry types ──────────────────────────────────────────────────────

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Mesh3D {
  id: string;
  name: string;
  vertices: Point3D[];
  faces: [number, number, number][];
  color: string;
  opacity: number;
}

export interface StructuralElement3D {
  id: string;
  type: 'dam_body' | 'foundation' | 'drainage' | 'instrumentation_point';
  mesh: Mesh3D;
  properties: Record<string, unknown>;
}

export interface Scene3D {
  structureId: string;
  elements: StructuralElement3D[];
  dem: {
    width: number;
    height: number;
    resolution: number;
    elevations: number[][];
  };
  sensorMarkers: Array<{
    sensorId: string;
    position: Point3D;
    alarmLevel: string;
  }>;
}

// ─── Geometry builders ────────────────────────────────────────────────────────

/**
 * Build a trapezoidal prism mesh for the dam body.
 * Cross-section is a trapezoid with crest at top and base at bottom.
 * The prism is extruded along the Y-axis (crestLength).
 */
function buildDamBodyMesh(
  id: string,
  crestElevation: number,
  baseElevation: number,
  crestLength: number,
  upstreamSlope: number,
  downstreamSlope: number,
  baseWidth: number,
): Mesh3D {
  const height = crestElevation - baseElevation;
  const halfCrest = crestLength / 2;
  // Slope offsets: slope = H:V  →  horizontal offset = height / slope
  const upOffset = height / upstreamSlope;
  const downOffset = height / downstreamSlope;

  // 8 vertices of the prism (front face z=0, back face z=baseWidth)
  // Front (z = 0): [0]=crest-left, [1]=crest-right, [2]=base-left, [3]=base-right
  // Back  (z = baseWidth): [4]=crest-left, [5]=crest-right, [6]=base-left, [7]=base-right
  const vertices: Point3D[] = [
    { x: -halfCrest - upOffset, y: baseElevation, z: 0 },
    { x: halfCrest + downOffset, y: baseElevation, z: 0 },
    { x: -halfCrest, y: crestElevation, z: 0 },
    { x: halfCrest, y: crestElevation, z: 0 },
    { x: -halfCrest - upOffset, y: baseElevation, z: baseWidth },
    { x: halfCrest + downOffset, y: baseElevation, z: baseWidth },
    { x: -halfCrest, y: crestElevation, z: baseWidth },
    { x: halfCrest, y: crestElevation, z: baseWidth },
  ];

  // CCW winding (normal out) for each face
  const faces: [number, number, number][] = [
    // Front face
    [0, 1, 2], [1, 3, 2],
    // Back face
    [4, 6, 5], [5, 6, 7],
    // Bottom
    [0, 4, 1], [1, 4, 5],
    // Top (crest)
    [2, 3, 6], [3, 7, 6],
    // Upstream slope
    [0, 2, 4], [2, 6, 4],
    // Downstream slope
    [1, 5, 3], [3, 5, 7],
  ];

  return {
    id,
    name: 'Dam Body',
    vertices,
    faces,
    color: '#8B7355',
    opacity: 1.0,
  };
}

/**
 * Build a flat rectangular mesh for the foundation plane.
 */
function buildFoundationMesh(
  id: string,
  baseElevation: number,
  halfWidth: number,
  depth: number,
): Mesh3D {
  const y = baseElevation - 2; // slightly below base
  const vertices: Point3D[] = [
    { x: -halfWidth, y, z: 0 },
    { x: halfWidth, y, z: 0 },
    { x: halfWidth, y, z: depth },
    { x: -halfWidth, y, z: depth },
  ];
  const faces: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 3],
  ];
  return {
    id,
    name: 'Foundation',
    vertices,
    faces,
    color: '#5A5A5A',
    opacity: 0.9,
  };
}

/**
 * Build a thin vertical slab mesh for the drainage blanket (internal drain).
 * Positioned at the dam centerline, x=0.
 */
function buildDrainageMesh(
  id: string,
  baseElevation: number,
  drainHeight: number,
  depth: number,
): Mesh3D {
  const thickness = 1.5;
  const vertices: Point3D[] = [
    { x: -thickness / 2, y: baseElevation, z: depth * 0.2 },
    { x: thickness / 2, y: baseElevation, z: depth * 0.2 },
    { x: thickness / 2, y: baseElevation + drainHeight, z: depth * 0.2 },
    { x: -thickness / 2, y: baseElevation + drainHeight, z: depth * 0.2 },
    { x: -thickness / 2, y: baseElevation, z: depth * 0.8 },
    { x: thickness / 2, y: baseElevation, z: depth * 0.8 },
    { x: thickness / 2, y: baseElevation + drainHeight, z: depth * 0.8 },
    { x: -thickness / 2, y: baseElevation + drainHeight, z: depth * 0.8 },
  ];
  const faces: [number, number, number][] = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 1], [1, 4, 5],
    [2, 6, 3], [3, 6, 7],
    [0, 3, 4], [3, 7, 4],
    [1, 5, 2], [2, 5, 6],
  ];
  return {
    id,
    name: 'Drainage Blanket',
    vertices,
    faces,
    color: '#4A90D9',
    opacity: 0.75,
  };
}

/**
 * Build a small sphere-approximated octahedron for an instrumentation point marker.
 */
function buildInstrumentationMesh(
  id: string,
  position: Point3D,
  name: string,
): Mesh3D {
  const r = 1.2;
  const { x, y, z } = position;
  const vertices: Point3D[] = [
    { x, y: y + r, z },           // top
    { x: x + r, y, z },           // right
    { x: x - r, y, z },           // left
    { x, y: y - r, z },           // bottom
    { x, y, z: z + r },           // front
    { x, y, z: z - r },           // back
  ];
  const faces: [number, number, number][] = [
    [0, 1, 4], [0, 4, 2], [0, 2, 5], [0, 5, 1],
    [3, 4, 1], [3, 2, 4], [3, 5, 2], [3, 1, 5],
  ];
  return {
    id,
    name,
    vertices,
    faces,
    color: '#FFD700',
    opacity: 1.0,
  };
}

/**
 * Generate a synthetic DEM (Digital Elevation Model) around the dam base.
 * Uses a Gaussian bowl to simulate the valley terrain.
 */
function generateSyntheticDEM(
  baseElevation: number,
  halfWidth: number,
  depth: number,
): Scene3D['dem'] {
  const resolution = 5; // metres per cell
  const width = Math.ceil((halfWidth * 2.4) / resolution);
  const height = Math.ceil((depth * 1.2) / resolution);

  const elevations: number[][] = [];
  for (let row = 0; row < height; row++) {
    const rowArr: number[] = [];
    for (let col = 0; col < width; col++) {
      // Normalised coords [-1, 1]
      const nx = (col / (width - 1)) * 2 - 1;
      const ny = (row / (height - 1)) * 2 - 1;
      // Bowl: valley floor + edges rise
      const bowl = baseElevation - 8 * Math.exp(-(nx * nx + ny * ny) * 2);
      // Add subtle ridge noise
      const noise = Math.sin(col * 0.7) * Math.cos(row * 0.5) * 0.8;
      rowArr.push(bowl + noise);
    }
    elevations.push(rowArr);
  }

  return { width, height, resolution, elevations };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a complete 3D scene for a dam structure.
 * Geometry follows IFC spatial decomposition concepts (ISO 16739).
 */
export function generateDamScene(
  structureId: string,
  params: {
    crestElevation: number;
    baseElevation: number;
    crestLength: number;
    upstreamSlope: number;
    downstreamSlope: number;
    baseWidth?: number;
  },
): Scene3D {
  const {
    crestElevation,
    baseElevation,
    crestLength,
    upstreamSlope,
    downstreamSlope,
  } = params;

  const height = crestElevation - baseElevation;
  const upOffset = height / upstreamSlope;
  const downOffset = height / downstreamSlope;
  const baseWidth = params.baseWidth ?? upOffset + crestLength + downOffset;
  const halfWidth = baseWidth / 2 + 20;

  const damBodyMesh = buildDamBodyMesh(
    `${structureId}-dam-body-mesh`,
    crestElevation,
    baseElevation,
    crestLength,
    upstreamSlope,
    downstreamSlope,
    baseWidth,
  );

  const foundationMesh = buildFoundationMesh(
    `${structureId}-foundation-mesh`,
    baseElevation,
    halfWidth,
    baseWidth,
  );

  const drainageMesh = buildDrainageMesh(
    `${structureId}-drainage-mesh`,
    baseElevation,
    height * 0.6,
    baseWidth,
  );

  // Default instrumentation points (piezometers at upstream/downstream thirds)
  const ipPositions: Array<{ id: string; name: string; pos: Point3D }> = [
    {
      id: `${structureId}-ip-p1`,
      name: 'Piezômetro P-01',
      pos: { x: -(upOffset * 0.5), y: baseElevation + height * 0.4, z: baseWidth * 0.3 },
    },
    {
      id: `${structureId}-ip-p2`,
      name: 'Piezômetro P-02',
      pos: { x: downOffset * 0.5, y: baseElevation + height * 0.3, z: baseWidth * 0.7 },
    },
    {
      id: `${structureId}-ip-in1`,
      name: 'Inclinômetro IN-01',
      pos: { x: 0, y: crestElevation, z: baseWidth * 0.5 },
    },
  ];

  const elements: StructuralElement3D[] = [
    {
      id: `${structureId}-dam-body`,
      type: 'dam_body',
      mesh: damBodyMesh,
      properties: {
        ifcType: 'IfcCivilElement',
        material: 'earthfill',
        crestElevation,
        baseElevation,
        crestLength,
        upstreamSlope: `1:${upstreamSlope}`,
        downstreamSlope: `1:${downstreamSlope}`,
        baseWidth,
        heightM: height,
        volumeM3: ((crestLength + (crestLength + upOffset + downOffset)) / 2) * height * baseWidth,
      },
    },
    {
      id: `${structureId}-foundation`,
      type: 'foundation',
      mesh: foundationMesh,
      properties: {
        ifcType: 'IfcFoundation',
        material: 'rock',
        elevationM: baseElevation - 2,
      },
    },
    {
      id: `${structureId}-drainage`,
      type: 'drainage',
      mesh: drainageMesh,
      properties: {
        ifcType: 'IfcDistributionFlowElement',
        subtype: 'internalDrainageBlanket',
        material: 'filteredGravel',
      },
    },
    ...ipPositions.map((ip) => ({
      id: ip.id,
      type: 'instrumentation_point' as const,
      mesh: buildInstrumentationMesh(ip.id + '-mesh', ip.pos, ip.name),
      properties: {
        ifcType: 'IfcSensor',
        name: ip.name,
        positionX: ip.pos.x,
        positionY: ip.pos.y,
        positionZ: ip.pos.z,
      },
    })),
  ];

  const dem = generateSyntheticDEM(baseElevation, halfWidth, baseWidth);

  const sensorMarkers = ipPositions.map((ip) => ({
    sensorId: ip.id,
    position: ip.pos,
    alarmLevel: 'normal',
  }));

  return { structureId, elements, dem, sensorMarkers };
}

/**
 * Bilinear interpolation of DEM elevation at fractional grid coordinates.
 * Implements the standard bilinear formula described in Keys (1981).
 *
 * @param dem   2D elevation grid (row-major: dem[row][col])
 * @param x     Fractional column index [0, width-1]
 * @param y     Fractional row index [0, height-1]
 * @returns     Interpolated elevation in metres
 */
export function interpolateDEM(dem: number[][], x: number, y: number): number {
  const rows = dem.length;
  if (rows === 0) return 0;
  const cols = dem[0].length;
  if (cols === 0) return 0;

  // Clamp to valid range
  const cx = Math.max(0, Math.min(cols - 1, x));
  const cy = Math.max(0, Math.min(rows - 1, y));

  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, cols - 1);
  const y1 = Math.min(y0 + 1, rows - 1);

  // Fractional offsets
  const fx = cx - x0;
  const fy = cy - y0;

  // Four surrounding cell values
  const q00 = dem[y0][x0];
  const q10 = dem[y0][x1];
  const q01 = dem[y1][x0];
  const q11 = dem[y1][x1];

  // Bilinear combination: (1-fy)*((1-fx)*q00 + fx*q10) + fy*((1-fx)*q01 + fx*q11)
  return (1 - fy) * ((1 - fx) * q00 + fx * q10) + fy * ((1 - fx) * q01 + fx * q11);
}

// ─── GLTF-compatible JSON export ─────────────────────────────────────────────

/**
 * Export the scene to a JSON structure compatible with the Three.js GLTFLoader
 * (subset of glTF 2.0 spec, geometry only — no materials embedded).
 */
export function exportGLTFCompatibleJSON(scene: Scene3D): string {
  interface GLTFBuffer {
    uri: string;
    byteLength: number;
  }
  interface GLTFBufferView {
    buffer: number;
    byteOffset: number;
    byteLength: number;
    target: number;
  }
  interface GLTFAccessor {
    bufferView: number;
    byteOffset: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }
  interface GLTFMesh {
    name: string;
    primitives: Array<{
      attributes: { POSITION: number };
      indices: number;
      mode: number;
    }>;
  }
  interface GLTFNode {
    name: string;
    mesh: number;
    extras: Record<string, unknown>;
  }

  const buffers: GLTFBuffer[] = [];
  const bufferViews: GLTFBufferView[] = [];
  const accessors: GLTFAccessor[] = [];
  const meshes: GLTFMesh[] = [];
  const nodes: GLTFNode[] = [];

  // Encode all elements
  scene.elements.forEach((el) => {
    const verts = el.mesh.vertices;
    const faces = el.mesh.faces;

    // --- position buffer (Float32) ---
    const posData = new Float32Array(verts.length * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    verts.forEach((v, i) => {
      posData[i * 3 + 0] = v.x;
      posData[i * 3 + 1] = v.y;
      posData[i * 3 + 2] = v.z;
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
    });
    const posB64 = Buffer.from(posData.buffer).toString('base64');
    const posUri = `data:application/octet-stream;base64,${posB64}`;

    const posBufferIdx = buffers.length;
    buffers.push({ uri: posUri, byteLength: posData.byteLength });

    const posBvIdx = bufferViews.length;
    bufferViews.push({ buffer: posBufferIdx, byteOffset: 0, byteLength: posData.byteLength, target: 34962 }); // ARRAY_BUFFER

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posBvIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: verts.length,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    // --- index buffer (Uint16) ---
    const idxData = new Uint16Array(faces.length * 3);
    faces.forEach((f, i) => {
      idxData[i * 3 + 0] = f[0];
      idxData[i * 3 + 1] = f[1];
      idxData[i * 3 + 2] = f[2];
    });
    const idxB64 = Buffer.from(idxData.buffer).toString('base64');
    const idxUri = `data:application/octet-stream;base64,${idxB64}`;

    const idxBufferIdx = buffers.length;
    buffers.push({ uri: idxUri, byteLength: idxData.byteLength });

    const idxBvIdx = bufferViews.length;
    bufferViews.push({ buffer: idxBufferIdx, byteOffset: 0, byteLength: idxData.byteLength, target: 34963 }); // ELEMENT_ARRAY_BUFFER

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxBvIdx,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: faces.length * 3,
      type: 'SCALAR',
    });

    const meshIdx = meshes.length;
    meshes.push({
      name: el.mesh.name,
      primitives: [{
        attributes: { POSITION: posAccIdx },
        indices: idxAccIdx,
        mode: 4, // TRIANGLES
      }],
    });

    nodes.push({
      name: el.id,
      mesh: meshIdx,
      extras: {
        elementType: el.type,
        color: el.mesh.color,
        opacity: el.mesh.opacity,
        ...el.properties,
      },
    });
  });

  const gltf = {
    asset: { version: '2.0', generator: 'MOTHER v7 SHMS Module 5' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i), name: scene.structureId }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers,
    extras: {
      structureId: scene.structureId,
      dem: {
        width: scene.dem.width,
        height: scene.dem.height,
        resolution: scene.dem.resolution,
        // Inline first 10 rows of DEM for preview (full data via exportPointCloud)
        elevationsPreview: scene.dem.elevations.slice(0, 10),
      },
      sensorMarkers: scene.sensorMarkers,
    },
  };

  return JSON.stringify(gltf, null, 2);
}

// ─── Environment3DManager ─────────────────────────────────────────────────────

export class Environment3DManager {
  private scenes: Map<string, Scene3D> = new Map();

  registerScene(scene: Scene3D): void {
    this.scenes.set(scene.structureId, scene);
  }

  getScene(structureId: string): Scene3D | undefined {
    return this.scenes.get(structureId);
  }

  updateSensorMarkers(
    structureId: string,
    markers: Array<{ sensorId: string; position: Point3D; alarmLevel: string }>,
  ): void {
    const scene = this.scenes.get(structureId);
    if (!scene) return;
    this.scenes.set(structureId, { ...scene, sensorMarkers: markers });
  }

  addElement(structureId: string, element: StructuralElement3D): void {
    const scene = this.scenes.get(structureId);
    if (!scene) return;
    const elements = [...scene.elements.filter((e) => e.id !== element.id), element];
    this.scenes.set(structureId, { ...scene, elements });
  }

  /**
   * Export point cloud in XYZ ASCII format (ASPRS LAS-compatible plain text variant).
   * Each line: X Y Z [element_type]
   */
  exportPointCloud(structureId: string): string {
    const scene = this.scenes.get(structureId);
    if (!scene) return '';

    const lines: string[] = ['# XYZ ASCII Point Cloud — MOTHER v7 SHMS', `# StructureId: ${structureId}`, '# X Y Z ElementType'];

    // Export all mesh vertices
    for (const el of scene.elements) {
      for (const v of el.mesh.vertices) {
        lines.push(`${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)} ${el.type}`);
      }
    }

    // Export DEM grid points
    const { dem } = scene;
    for (let row = 0; row < dem.height; row++) {
      for (let col = 0; col < dem.width; col++) {
        const x = col * dem.resolution;
        const z = row * dem.resolution;
        const y = dem.elevations[row][col];
        lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)} terrain`);
      }
    }

    // Export sensor marker positions
    for (const marker of scene.sensorMarkers) {
      const { x, y, z } = marker.position;
      lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)} sensor_${marker.alarmLevel}`);
    }

    return lines.join('\n');
  }
}

export const environment3DManager: Environment3DManager = new Environment3DManager();
