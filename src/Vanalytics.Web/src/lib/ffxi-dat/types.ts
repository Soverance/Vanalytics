export interface ParsedMesh {
  vertices: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint16Array
  boneIndices: Uint8Array
  boneWeights: Float32Array
  materialIndex: number
  /** Per-vertex bone-local positions for bone 1 (3 floats/vert). Present when mesh has MV2 vertices. */
  dualBoneLocalPos1?: Float32Array
  /** Per-vertex bone-local positions for bone 2 (3 floats/vert). Zero for MV1 vertices. */
  dualBoneLocalPos2?: Float32Array
  /** Per-vertex weights (2 floats/vert): [w1, w2]. MV1 vertices have [1, 0]. */
  dualBoneWeights?: Float32Array
}

export interface ParsedTexture {
  width: number
  height: number
  rgba: Uint8Array
}

export interface ParsedBone {
  parentIndex: number
  position: [number, number, number]
  rotation: [number, number, number, number]
}

export interface ParsedSkeleton {
  bones: ParsedBone[]
  /** Pre-computed world-space 4x4 matrices (row-major, 16 floats each) */
  matrices: number[][]
}

export interface ParsedDatFile {
  meshes: ParsedMesh[]
  textures: ParsedTexture[]
  skeleton: ParsedSkeleton | null
  animations: ParsedAnimation[]
}

export interface ParsedZoneMesh {
  vertices: number[]      // flat xyz (3 floats per vertex)
  normals: number[]       // flat xyz (3 floats per vertex)
  colors: number[]        // flat rgba 0.0-1.0 (4 floats per vertex)
  uvs: number[]           // flat uv (2 floats per vertex)
  indices: number[]       // triangle indices
  materialIndex: number   // texture index (sequential IMG block order)
  blending: number        // MMB blending flag (0=opaque, >0=alpha blend)
}

export interface ZoneMeshInstance {
  meshIndex: number       // which MMB prefab (sequential MMB block order)
  transform: number[]     // 4x4 matrix (16 floats, row-major)
}

export interface ParsedZone {
  prefabs: ParsedZoneMesh[]       // unique MMB mesh prefabs
  instances: ZoneMeshInstance[]    // MZB placement transforms
  textures: ParsedTexture[]       // reused from entity pipeline
}

export interface AnimationBone {
  boneIndex: number
  rotationKeyframes: Float32Array | null   // 4 floats per frame (qx,qy,qz,qw), null = use default
  rotationDefault: [number, number, number, number]
  translationKeyframes: Float32Array | null // 3 floats per frame (tx,ty,tz), null = use default
  translationDefault: [number, number, number]
  scaleKeyframes: Float32Array | null       // 3 floats per frame (sx,sy,sz), null = use default
  scaleDefault: [number, number, number]
}

export interface ParsedAnimation {
  frameCount: number
  speed: number
  bones: AnimationBone[]
}
