import { useState } from 'react'
import { X, Upload, Check, AlertTriangle } from 'lucide-react'
import { FFXI_JOBS } from '../../lib/jobs'
import { importPreview, importCommit } from '../../api/gearSwapImport'
import { toCommitSets, type SelectableSet } from './gearSwapImportSelection'
import type { GearSwapImportPreview, ImportSetPreview } from '../../types/api'
import { groupByCategory } from '../../lib/gearSetCategories'
import { summarizeImport } from './gearSwapImportSummary'

interface Props {
  characterId: string
  defaultJob?: string | null
  onClose: () => void
  onImported: () => void   // caller reloads the set list
}

type Step = 'upload' | 'review'

export default function GearSwapImportModal({ characterId, defaultJob, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<string>(defaultJob ?? '')
  const [preview, setPreview] = useState<GearSwapImportPreview | null>(null)
  const [selection, setSelection] = useState<SelectableSet[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const runPreview = async () => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const p = await importPreview(characterId, file, job || null)
      setPreview(p)
      setSelection(p.sets.map(s => ({ name: s.name, include: true })))
      if (!job && p.suggestedJob) setJob(p.suggestedJob)
      setStep('review')
    } catch {
      setError('Could not read that file. We support standard and Mote-style gear tables; dynamically-built sets are skipped.')
    } finally { setBusy(false) }
  }

  const runCommit = async () => {
    if (!preview) return
    setBusy(true); setError('')
    try {
      await importCommit(characterId, job || null, toCommitSets(preview.sets, selection, job || null))
      onImported()
      onClose()
    } catch {
      setError('Import failed. Please try again.')
    } finally { setBusy(false) }
  }

  const toggle = (name: string) =>
    setSelection(sel => sel.map(s => s.name === name ? { ...s, include: !s.include } : s))

  const selectedCount = selection.filter(s => s.include).length

  const renderSetRow = (s: ImportSetPreview) => {
    const sel = selection.find(x => x.name === s.name)?.include ?? false
    const unresolved = s.slots.filter(x => x.matchKind === 'unresolved').length
    const notOwned = s.slots.filter(x => x.itemId !== 0 && !x.owned).length
    return (
      <div key={s.luaKey} className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={sel} onChange={() => toggle(s.name)} />
          <span className="font-medium">{s.name}</span>
          {s.overwritesExisting
            ? <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-200">Overwrites</span>
            : <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-200">New</span>}
          <span className="ml-auto text-[10px] text-gray-500">{s.slots.length} slots</span>
        </label>
        {(unresolved > 0 || notOwned > 0) && (
          <div className="mt-1 flex gap-3 pl-6 text-[10px]">
            {unresolved > 0 && <span className="text-red-300">{unresolved} unresolved</span>}
            {notOwned > 0 && <span className="text-amber-300">{notOwned} not owned</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border-2 border-amber-800/50 bg-gray-900"
        onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-none items-center justify-between border-b border-gray-800 px-4 py-3">
          <span className="text-sm text-gray-200">Import from GearSwap{step === 'review' ? ' — Review' : ''}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
        </div>

        {/* body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 rounded border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <>
              <label className="text-xs text-gray-400">GearSwap .lua file for one job</label>
              <input type="file" accept=".lua"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="text-xs text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-indigo-900/60 file:px-3 file:py-1.5 file:text-amber-200" />
              <label className="mt-2 text-xs text-gray-400">Job (auto-detected from filename if blank)</label>
              <select value={job} onChange={e => setJob(e.target.value)}
                className="w-40 rounded bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                <option value="">— Auto —</option>
                {FFXI_JOBS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </>
          )}

          {step === 'review' && preview && (
            <>
              {preview.warnings.length > 0 && (
                <details className="rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  <summary>{preview.warnings.length} set(s) skipped</summary>
                  <ul className="mt-1 list-disc pl-4">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
              {(() => {
                const sum = summarizeImport(preview.sets)
                return (
                  <div className="text-[11px] text-gray-400">
                    {sum.total} sets · {sum.overwrite} overwrite · {sum.newSets} new
                    {sum.unresolvedSlots > 0 && <span className="text-red-300"> · {sum.unresolvedSlots} items unresolved</span>}
                    {sum.notOwnedSlots > 0 && <span className="text-amber-300"> · {sum.notOwnedSlots} not owned</span>}
                  </div>
                )
              })()}
              <div className="flex flex-col gap-3">
                {groupByCategory(preview.sets).map(g => (
                  <div key={g.category} className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">{g.label}</div>
                    {g.rows.map(renderSetRow)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-none items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
          {step === 'upload' && (
            <button disabled={!file || busy} onClick={runPreview}
              className="flex items-center gap-1.5 rounded bg-indigo-900/60 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" /> {busy ? 'Reading…' : 'Preview'}
            </button>
          )}
          {step === 'review' && (
            <>
              <button onClick={() => setStep('upload')} className="rounded bg-gray-800/60 px-3 py-1.5 text-xs text-gray-300">Back</button>
              <button disabled={selectedCount === 0 || busy} onClick={runCommit}
                className="flex items-center gap-1.5 rounded bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-50">
                <Check className="h-3.5 w-3.5" /> {busy ? 'Importing…' : `Import ${selectedCount} set(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
