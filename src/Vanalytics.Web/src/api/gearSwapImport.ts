import { api, uploadFile } from './client'
import type {
  GearSwapImportPreview,
  ImportCommitResponse,
} from '../types/api'

// A single set to upsert; shape mirrors the backend SaveGearSetRequest.
export interface ImportCommitSet {
  name: string
  job: string | null
  category: string
  tags: string[]
  slots: { slot: string; itemId: number; itemName: string; augments: string[] }[]
}

/**
 * Preview a GearSwap .lua file upload.
 *
 * We use `uploadFile` (not the generic `api`) here because `api` unconditionally
 * sets Content-Type: application/json, which would stomp the multipart boundary
 * the browser needs to set on a FormData body. `uploadFile` omits Content-Type
 * so the browser sets it correctly.
 *
 * The optional `job` hint is passed as a query-string parameter instead of a
 * second form field — the backend reads it the same way and falls back to
 * filename-based detection when omitted.
 */
export async function importPreview(
  characterId: string,
  file: File,
  job: string | null,
): Promise<GearSwapImportPreview> {
  const path =
    `/api/characters/${characterId}/gear-sets/import/preview` +
    (job ? `?job=${encodeURIComponent(job)}` : '')
  return uploadFile<GearSwapImportPreview>(path, file)
}

/**
 * Commit a previously-previewed import: upsert the listed gear sets.
 *
 * Uses `api` with JSON body — no file involved, so the forced
 * Content-Type: application/json is correct here.
 */
export async function importCommit(
  characterId: string,
  job: string | null,
  sets: ImportCommitSet[],
): Promise<ImportCommitResponse> {
  return api<ImportCommitResponse>(
    `/api/characters/${characterId}/gear-sets/import/commit`,
    { method: 'POST', body: JSON.stringify({ job, sets }) },
  )
}
