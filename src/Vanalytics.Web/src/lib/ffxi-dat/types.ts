export interface ParsedMesh {
  vertices: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint16Array
  boneIndices: Uint8Array
  boneWeights: Float32Array
  materialIndex: number
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
