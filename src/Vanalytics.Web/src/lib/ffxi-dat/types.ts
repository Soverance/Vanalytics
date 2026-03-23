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
