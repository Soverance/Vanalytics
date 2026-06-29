import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Camera, Workflow as BlueprintIcon, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useCharacterGearSets } from '../../hooks/useCharacterGearSets'
import GearSetEditor, { type WorkingSet } from './GearSetEditor'
import GearSetExportModal from './GearSetExportModal'
import GearSwapImportModal from './GearSwapImportModal'
import GearSetNav from './GearSetNav'
import GearSetList from './GearSetList'
import GearSetReadOnlyView from './GearSetReadOnlyView'
import { buildTree, distinctTags, filterSets, type SortKey } from './gearSetFilters'
import type { CharacterDetail, GearEntry, OwnedEquipmentItem, GearSetSlot, GameItemDetail, GearSetSummary, GearSetDetail } from '../../types/api'

// Mirrors MaxGearSetsPerCharacter in CharactersController.cs (keep in sync).
const MAX_GEAR_SETS_PER_CHARACTER = 500

interface Props {
  character: CharacterDetail
  gear: GearEntry[]                  // currently-equipped, for Snapshot + name resolution
  itemCache: Map<number, GameItemDetail>
  onSaveFavorite: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
  fetchBase?: string
  readOnly?: boolean
  /** When set (read-only mode), auto-open this set's read-only view once on mount. */
  initialSetId?: number
  /** Pre-select this job in the nav (e.g. when returning from that job's blueprint editor). */
  initialJob?: string | null
}

export default function GearSetsTab({ character, gear, itemCache, onSaveFavorite, fetchBase, readOnly = false, initialSetId, initialJob }: Props) {
  const characterId = character.id
  const navigate = useNavigate()
  const base = fetchBase ?? `/api/characters/${characterId}`
  const { sets: hookSets, createSet, updateSet, deleteSet, getSet, reload } = useCharacterGearSets(characterId, !readOnly)

  // In read-only mode, fetch the sets list via base (public endpoint); otherwise use the hook.
  const [readOnlySets, setReadOnlySets] = useState<GearSetSummary[]>([])
  useEffect(() => {
    if (!readOnly) return
    api<GearSetSummary[]>(`${base}/gear-sets`)
      .then(d => setReadOnlySets(d ?? []))
      .catch(() => setReadOnlySets([]))
  }, [readOnly, base])

  const sets = readOnly ? readOnlySets : hookSets

  const [editing, setEditing] = useState<WorkingSet | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [readOnlyDetail, setReadOnlyDetail] = useState<GearSetDetail | null>(null)
  const [exporting, setExporting] = useState<{ name: string; slots: GearSetSlot[] } | null>(null)
  const [owned, setOwned] = useState<OwnedEquipmentItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  // Discovery state.
  const [selJob, setSelJob] = useState<string | null>(initialJob ?? null)
  const [selCategory, setSelCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('name')

  // Auto-dismiss the transient save confirmation.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(t)
  }, [notice])

  // Owned-item list for availability badges + the picker source (owner-only endpoint).
  useEffect(() => {
    if (readOnly) return
    api<OwnedEquipmentItem[]>(`/api/characters/${characterId}/gear-sets/owned-equipment`)
      .then(d => setOwned(d ?? []))
      .catch(() => setOwned([]))
  }, [readOnly, characterId])

  const tree = useMemo(() => buildTree(sets), [sets])
  const knownTags = useMemo(() => distinctTags(sets), [sets])
  const rows = useMemo(
    () => filterSets(sets, { job: selJob, category: selCategory, search, tags: activeTags, sort }),
    [sets, selJob, selCategory, search, activeTags, sort])

  const resolveName = (itemId: number, fallback: string) =>
    fallback || itemCache.get(itemId)?.name || owned.find(o => o.itemId === itemId)?.itemName || `#${itemId}`

  const snapshot = () => {
    const slots: GearSetSlot[] = gear
      .filter(g => g.itemId !== 0)
      .map(g => ({ slot: g.slot, itemId: g.itemId, itemName: g.itemName, augments: g.augments }))
    setEditing({ id: null, name: 'New Set', job: '', category: 'Other', tags: [], slots })
  }

  const blank = () => setEditing({ id: null, name: 'New Set', job: '', category: 'Other', tags: [], slots: [] })

  const fetchSetDetail = async (setId: number): Promise<GearSetDetail | null> => {
    if (readOnly) {
      return api<GearSetDetail>(`${base}/gear-sets/${setId}`).catch(() => null)
    }
    return getSet(setId).catch(() => null)
  }

  const openExisting = async (setId: number) => {
    const detail = await fetchSetDetail(setId)
    if (!detail) return
    if (readOnly) {
      setReadOnlyDetail(detail)
      return
    }
    const slots = detail.slots.map(s => ({ ...s, itemName: resolveName(s.itemId, s.itemName) }))
    setEditing({ id: detail.id, name: detail.name, job: detail.job ?? '',
      category: detail.category, tags: detail.tags, slots })
  }

  // Throws on failure so the editor can surface the error inline; on success we
  // confirm via a transient notice and return to the list.
  const save = async (body: { name: string; job: string | null; category: string; tags: string[]; slots: GearSetSlot[] }) => {
    if (editing?.id == null) await createSet(body)
    else await updateSet(editing.id, body)
    setNotice('Gear set saved.')
    setEditing(null)
  }

  const exportSet = async (setId: number) => {
    const d = await fetchSetDetail(setId)
    if (d) setExporting({ name: d.name,
      slots: d.slots.map(x => ({ ...x, itemName: resolveName(x.itemId, x.itemName) })) })
  }

  const toggleTag = (tag: string) =>
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const copyLink = (setId: number) => {
    const url = `${window.location.origin}/${character.server}/${character.name}?gearset=${setId}`
    navigator.clipboard.writeText(url)
    setNotice(character.isPublic
      ? 'Link copied.'
      : 'Link copied — your profile is private, so the link works once you make it public.')
  }

  // Deep-link: auto-open the targeted set once (read-only public profile). openExisting
  // fetches the detail directly, so it does not depend on the list having loaded. A null
  // result (private/missing/bad id) is a no-op and we fall back to the list view. The
  // ?gearset param is intentionally left in the URL for re-shareability; the ref guard
  // (once per id) prevents reopening after the user closes the view.
  const appliedInitialRef = useRef<number | null>(null)
  useEffect(() => {
    if (!readOnly || initialSetId == null) return
    if (appliedInitialRef.current === initialSetId) return
    appliedInitialRef.current = initialSetId
    void openExisting(initialSetId)
  }, [readOnly, initialSetId])

  // ---- Read-only detail view ----
  if (readOnly && readOnlyDetail) {
    return (
      <GearSetReadOnlyView
        detail={readOnlyDetail}
        character={character}
        pageItemCache={itemCache}
        onClose={() => setReadOnlyDetail(null)}
      />
    )
  }

  // ---- Editor view (owner only) ----
  if (!readOnly && editing) {
    return (
      <GearSetEditor
        key={editing.id ?? 'new'}
        initial={editing}
        character={character}
        owned={owned}
        itemCache={itemCache}
        knownTags={knownTags}
        onSaveFavorite={onSaveFavorite}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
    )
  }

  // ---- List view ----
  const atCap = sets.length >= MAX_GEAR_SETS_PER_CHARACTER
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button onClick={snapshot} disabled={atCap}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40 disabled:opacity-50 disabled:cursor-not-allowed">
            <Camera className="h-3.5 w-3.5" /> Snapshot current gear
          </button>
          <button onClick={blank} disabled={atCap}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-800/60 text-gray-300 border border-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="h-3.5 w-3.5" /> Blank set
          </button>
          <button onClick={() => setShowImport(true)} disabled={atCap}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-800/60 text-gray-300 border border-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed">
            <Download className="h-3.5 w-3.5" /> Import from GearSwap
          </button>
          <span className="ml-auto text-[10px] text-gray-500">{sets.length} / {MAX_GEAR_SETS_PER_CHARACTER}</span>
          <button
            onClick={() => selJob && navigate(`/characters/${characterId}/blueprint/${selJob}`)}
            disabled={!selJob}
            title={selJob ? `Open the ${selJob} blueprint editor` : 'Select a job in the left nav to open its blueprint editor'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-800/60 text-gray-300 border border-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed">
            <BlueprintIcon className="h-3.5 w-3.5" /> Open Blueprint Editor{selJob ? ` (${selJob})` : ''}
          </button>
        </div>
      )}

      {!readOnly && atCap && (
        <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded px-3 py-2">
          This character has reached the maximum of {MAX_GEAR_SETS_PER_CHARACTER} gear sets. Delete one to make room.
        </div>
      )}

      {notice && (
        <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/40 rounded px-3 py-2">
          {notice}
        </div>
      )}

      {sets.length === 0 ? (
        <div className="text-xs text-gray-500 py-6 text-center">No gear sets yet.</div>
      ) : (
        <div className="flex gap-4">
          <div className="w-44 flex-shrink-0">
            <GearSetNav
              tree={tree}
              selectedJob={selJob}
              selectedCategory={selCategory}
              onSelect={(job, category) => { setSelJob(job); setSelCategory(category) }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <GearSetList
              rows={rows}
              knownTags={knownTags}
              search={search}
              onSearchChange={setSearch}
              sort={sort}
              onSortChange={setSort}
              activeTags={activeTags}
              onToggleTag={toggleTag}
              readOnly={readOnly}
              showCategoryHeaders={selCategory == null}
              onOpen={openExisting}
              onExport={exportSet}
              onDelete={readOnly ? () => Promise.resolve() : deleteSet}
              onCopyLink={readOnly ? undefined : copyLink}
            />
          </div>
        </div>
      )}

      {exporting && (
        <GearSetExportModal name={exporting.name} slots={exporting.slots} onClose={() => setExporting(null)} />
      )}

      {showImport && (
        <GearSwapImportModal
          characterId={characterId}
          defaultJob={selJob || null}
          onClose={() => setShowImport(false)}
          onImported={reload}
        />
      )}
    </div>
  )
}
