export class DatReader {
  private view: DataView
  private offset: number

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.offset = 0
  }

  get position(): number { return this.offset }
  get length(): number { return this.view.byteLength }
  get remaining(): number { return this.view.byteLength - this.offset }

  seek(offset: number): void {
    if (offset < 0 || offset > this.view.byteLength)
      throw new RangeError(`Seek offset ${offset} out of bounds (0-${this.view.byteLength})`)
    this.offset = offset
  }

  skip(bytes: number): void { this.seek(this.offset + bytes) }

  readUint8(): number { const v = this.view.getUint8(this.offset); this.offset += 1; return v }
  readInt8(): number { const v = this.view.getInt8(this.offset); this.offset += 1; return v }
  readUint16(): number { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v }
  readInt16(): number { const v = this.view.getInt16(this.offset, true); this.offset += 2; return v }
  readUint32(): number { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v }
  readInt32(): number { const v = this.view.getInt32(this.offset, true); this.offset += 4; return v }
  readFloat32(): number { const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v }

  readBytes(count: number): Uint8Array {
    const arr = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count)
    this.offset += count
    return new Uint8Array(arr)
  }

  readString(length: number): string {
    const bytes = this.readBytes(length)
    let end = bytes.indexOf(0)
    if (end === -1) end = length
    return new TextDecoder('utf-8').decode(bytes.subarray(0, end))
  }

  readVec3(): [number, number, number] {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32()]
  }

  readQuat(): [number, number, number, number] {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32()]
  }

  peekUint32(): number { return this.view.getUint32(this.offset, true) }

  slice(offset: number, length: number): DatReader {
    const sliced = this.view.buffer.slice(
      this.view.byteOffset + offset,
      this.view.byteOffset + offset + length
    )
    return new DatReader(sliced as ArrayBuffer)
  }
}
