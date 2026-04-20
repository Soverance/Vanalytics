import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  isFileSystemSupported,
  getDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
  checkPermission,
  requestPermission,
  pickFfxiDirectory,
  readDatFile,
  type PickResult,
} from '../lib/ffxi-filesystem'

interface FfxiFileSystemContextValue {
  isSupported: boolean
  isConfigured: boolean
  isAuthorized: boolean
  path: string | null
  loading: boolean
  configure: () => Promise<PickResult>
  authorize: () => Promise<boolean>
  disconnect: () => Promise<void>
  readFile: (relativePath: string) => Promise<ArrayBuffer>
}

const FfxiFileSystemContext = createContext<FfxiFileSystemContextValue | null>(null)

export function useFfxiFileSystem() {
  const ctx = useContext(FfxiFileSystemContext)
  if (!ctx) throw new Error('useFfxiFileSystem must be used within FfxiFileSystemProvider')
  return ctx
}

export function FfxiFileSystemProvider({ children }: { children: ReactNode }) {
  const [isSupported] = useState(() => isFileSystemSupported())
  const [isConfigured, setIsConfigured] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [path, setPath] = useState<string | null>(null)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupported) {
      setLoading(false)
      return
    }
    ;(async () => {
      const stored = await getDirectoryHandle()
      if (stored) {
        setHandle(stored)
        setIsConfigured(true)
        setPath(stored.name)
        const granted = await checkPermission(stored)
        setIsAuthorized(granted)
      }
      setLoading(false)
    })()
  }, [isSupported])

  const configure = useCallback(async () => {
    const result = await pickFfxiDirectory()
    if (result.status === 'ok') {
      await saveDirectoryHandle(result.handle)
      setHandle(result.handle)
      setIsConfigured(true)
      setIsAuthorized(true)
      setPath(result.path)
    }
    return result
  }, [])

  const authorize = useCallback(async () => {
    if (!handle) return false
    const granted = await requestPermission(handle)
    setIsAuthorized(granted)
    return granted
  }, [handle])

  const disconnect = useCallback(async () => {
    await clearDirectoryHandle()
    setHandle(null)
    setIsConfigured(false)
    setIsAuthorized(false)
    setPath(null)
  }, [])

  const readFile = useCallback(async (relativePath: string) => {
    if (!handle) throw new Error('No FFXI directory configured')
    if (!isAuthorized) throw new Error('File system permission not granted')
    return readDatFile(handle, relativePath)
  }, [handle, isAuthorized])

  return (
    <FfxiFileSystemContext.Provider value={{
      isSupported, isConfigured, isAuthorized, path, loading,
      configure, authorize, disconnect, readFile,
    }}>
      {children}
    </FfxiFileSystemContext.Provider>
  )
}
