import { get, set, del } from 'idb-keyval'

const HANDLE_KEY = 'ffxi-directory-handle'

const VALIDATION_PATHS = ['ROM', 'ROM2', 'VTABLE.DAT'] as const

export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await set(HANDLE_KEY, handle)
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await get<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null
}

export async function clearDirectoryHandle(): Promise<void> {
  await del(HANDLE_KEY)
}

export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window
}

export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.requestPermission({ mode: 'read' })
    return permission === 'granted'
  } catch {
    return false
  }
}

export async function checkPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.queryPermission({ mode: 'read' })
    return permission === 'granted'
  } catch {
    return false
  }
}

export type PickResult =
  | { status: 'ok'; handle: FileSystemDirectoryHandle; path: string }
  | { status: 'cancelled' }
  | { status: 'blocked' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }

export async function pickFfxiDirectory(): Promise<PickResult> {
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' })
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') return { status: 'cancelled' }
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        return { status: 'blocked' }
      }
    }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
  const valid = await validateFfxiDirectory(handle)
  if (!valid) return { status: 'invalid' }
  return { status: 'ok', handle, path: handle.name }
}

async function validateFfxiDirectory(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  for (const name of VALIDATION_PATHS) {
    try {
      try {
        await handle.getDirectoryHandle(name)
      } catch {
        await handle.getFileHandle(name)
      }
    } catch {
      return false
    }
  }
  return true
}

export async function readDatFile(
  handle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<ArrayBuffer> {
  const parts = relativePath.split('/')
  let current: FileSystemDirectoryHandle = handle

  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i])
  }

  const fileHandle = await current.getFileHandle(parts[parts.length - 1])
  const file = await fileHandle.getFile()
  return file.arrayBuffer()
}
