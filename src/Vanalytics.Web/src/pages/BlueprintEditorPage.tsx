import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './BlueprintEditor.css'
import { ArrowLeft, Download, Trash2, Copy, ClipboardPaste } from 'lucide-react'
import { api } from '../api/client'
import { useJobBlueprint } from '../hooks/useJobBlueprint'
import { wouldCreateCycle, isValidConnection, isSingleTargetSource, connectedEdgeIds } from '../components/character/blueprint/blueprintGraph'
import ActionPicker from '../components/character/blueprint/ActionPicker'
import { categoryOfHandle, hasAction, allowGenericForHandle, labelForAction, addMember, removeMember, moveMember, addOverlay, removeOverlay, moveOverlay, cloneSelection, pasteClone, clipboardAnchor, type ActionCategory, type Clipboard } from '../components/character/blueprint/blueprintGraph'
import TriggerNode from '../components/character/blueprint/TriggerNode'
import EquipGearSetNode from '../components/character/blueprint/EquipGearSetNode'
import NodePalette from '../components/character/blueprint/NodePalette'
import EquipInspector from '../components/character/blueprint/EquipInspector'
import ModeNode, { type ModeNodeData } from '../components/character/blueprint/ModeNode'
import ModeInspector from '../components/character/blueprint/ModeInspector'
import BranchNode from '../components/character/blueprint/BranchNode'
import CondBuffNode from '../components/character/blueprint/CondBuffNode'
import CondStatNode from '../components/character/blueprint/CondStatNode'
import CondBuffInspector from '../components/character/blueprint/CondBuffInspector'
import CondStatInspector from '../components/character/blueprint/CondStatInspector'
import GearSetExportModal from '../components/character/GearSetExportModal'
import type {
  CharacterDetail, GearSetSummary, BlueprintGraph, BlueprintNodeType,
} from '../types/api'

const nodeTypes = {
  'trigger:status_change': TriggerNode,
  'trigger:precast': TriggerNode,
  'trigger:aftercast': TriggerNode,
  'trigger:midcast': TriggerNode,
  'trigger:buff_change': TriggerNode,
  equip: EquipGearSetNode,
  mode: ModeNode,
  branch: BranchNode,
  'cond:buff': CondBuffNode,
  'cond:stat': CondStatNode,
}

let idSeq = 1
const newId = () => `n${Date.now()}_${idSeq++}`

function BlueprintEditorInner() {
  const { id = '', job = '' } = useParams()
  const navigate = useNavigate()
  const { graph, loading, save, generate } = useJobBlueprint(id, job)

  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [sets, setSets] = useState<GearSetSummary[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [palette, setPalette] = useState<{ x: number; y: number; flowX: number; flowY: number; connect?: { nodeId: string; handle: string; kind: 'exec' | 'cond' } } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportLua, setExportLua] = useState<{ lua: string; warnings: string[] } | null>(null)
  const hydrated = useRef(false)
  const { screenToFlowPosition } = useReactFlow()
  const connectingFrom = useRef<{ nodeId: string; handleId: string } | null>(null)
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number; nodeId: string; handle: string; category: ActionCategory; allowGeneric: boolean } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [hasClip, setHasClip] = useState(false)
  const clipboard = useRef<Clipboard | null>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const nodesRef = useRef(nodes); nodesRef.current = nodes
  const edgesRef = useRef(edges); edgesRef.current = edges

  // Copy the given node ids (+ edges internal to them) into the clipboard. Returns false if nothing
  // copyable. Reuses the pure cloneSelection by tagging the chosen ids as selected.
  const copyNodeIds = useCallback((ids: string[]): boolean => {
    const idSet = new Set(ids)
    const tagged = nodesRef.current.map(n => ({ ...n, selected: idSet.has(n.id) }))
    const clip = cloneSelection(tagged, edgesRef.current)
    if (clip.nodes.length === 0) return false
    clipboard.current = clip
    setHasClip(true)
    return true
  }, [])

  // Paste the clipboard so its top-left anchor lands at the given screen pointer. Returns false if
  // nothing to paste / no pointer. Pasted nodes replace the current selection.
  const pasteAt = useCallback((pointer: { x: number; y: number } | null): boolean => {
    const clip = clipboard.current
    if (!clip || clip.nodes.length === 0 || !pointer) return false
    const flow = screenToFlowPosition({ x: pointer.x, y: pointer.y })
    const anchor = clipboardAnchor(clip)
    const offset = { x: flow.x - anchor.x, y: flow.y - anchor.y }
    const { nodes: nn, edges: ee } = pasteClone(clip, newId, offset)
    setNodes(prev => [...prev.map(n => ({ ...n, selected: false })), ...nn])
    setEdges(prev => [...prev, ...ee])
    setSelectedId(nn[0].id)
    return true
  }, [screenToFlowPosition])

  useEffect(() => {
    api<CharacterDetail>(`/api/characters/${id}`).then(setCharacter).catch(() => {})
    api<GearSetSummary[]>(`/api/characters/${id}/gear-sets`)
      .then(all => setSets(all.filter(s => !s.job || s.job === job)))
      .catch(() => setSets([]))
  }, [id, job])

  useEffect(() => {
    if (!graph || hydrated.current) return
    hydrated.current = true
    const setById = new Map(sets.map(s => [s.id, s]))
    setNodes(graph.nodes.map(n => ({
      id: n.id, type: n.type, position: n.position,
      data: n.type === 'equip'
        ? { gearSetId: n.data.gearSetId, actionName: n.data.actionName ?? null,
            overlaySetIds: n.data.overlaySetIds ?? [],
            setName: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.name : undefined,
            category: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.category : undefined }
        : n.type === 'mode'
        ? { modeName: n.data.modeName ?? 'Mode', modeCommand: n.data.modeCommand ?? null,
            members: n.data.members ?? [],
            memberNames: (n.data.members ?? []).map(m => setById.get(m.gearSetId)?.name) }
        : n.type === 'cond:buff'
        ? { buffName: n.data.buffName ?? null }
        : n.type === 'cond:stat'
        ? { resource: n.data.resource ?? 'hpp', op: n.data.op ?? '<', value: n.data.value ?? 25 }
        : {},   // branch: no data
    })))
    setEdges(graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })))
  }, [graph, sets])

  const toGraph = useCallback((): BlueprintGraph => ({
    version: 1,
    nodes: nodes.map(n => {
      const t = n.type as BlueprintNodeType
      let data
      if (t === 'mode') {
        const m = n.data as ModeNodeData
        data = { modeName: m.modeName ?? 'Mode', modeCommand: m.modeCommand ?? null,
          members: (m.members ?? []).map(mm => ({ gearSetId: mm.gearSetId, label: mm.label ?? null, overlaySetIds: mm.overlaySetIds ?? null })) }
      } else if (t === 'cond:buff') {
        data = { buffName: (n.data as { buffName?: string | null }).buffName ?? null }
      } else if (t === 'cond:stat') {
        const d = n.data as { resource?: string | null; op?: string | null; value?: number | null }
        data = { resource: d.resource ?? 'hpp', op: d.op ?? '<', value: d.value ?? 25 }
      } else if (t === 'branch') {
        data = {}
      } else {
        data = { gearSetId: (n.data as { gearSetId?: number | null }).gearSetId ?? null,
          actionName: (n.data as { actionName?: string | null }).actionName ?? null,
          overlaySetIds: (n.data as { overlaySetIds?: number[] }).overlaySetIds ?? null }
      }
      return { id: n.id, type: t, position: n.position, data }
    }),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  }), [nodes, edges])

  useEffect(() => {
    if (!hydrated.current) return
    const t = setTimeout(() => { save(toGraph()).catch(() => {}) }, 800)
    return () => clearTimeout(t)
  }, [nodes, edges, save, toGraph])

  // Ctrl/Cmd-C copies the selected nodes (+ internal edges); Ctrl/Cmd-V pastes them at the cursor.
  // Ignored while editing a text field so inspector copy/paste works normally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        if (copyNodeIds(nodesRef.current.filter(n => n.selected).map(n => n.id))) e.preventDefault()
      } else if (k === 'v') {
        if (pasteAt(lastPointer.current)) e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [copyNodeIds, pasteAt])

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes(n => applyNodeChanges(c, n)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), [])

  const onPaneMouseMove = useCallback((e: React.MouseEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onConnect = useCallback((conn: Connection) => {
    if (wouldCreateCycle(edges.map(e => ({ id: e.id, source: e.source, target: e.target })), conn.source!, conn.target!)) return
    const sourceType = nodes.find(n => n.id === conn.source)?.type ?? ''
    const targetType = nodes.find(n => n.id === conn.target)?.type ?? ''
    if (!isValidConnection(sourceType, conn.sourceHandle, targetType, conn.targetHandle)) return
    setEdges(prev => {
      // One incoming edge per (target, targetHandle) — branch has two inputs ('in' and 'cond'), so
      // dedup must be handle-aware, not whole-node.
      const noInputDup = prev.filter(e => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
      // Single-target exec outputs (trigger terminal, branch true/false) replace their prior edge;
      // category pins and cond 'out' fan out.
      const base = isSingleTargetSource(sourceType, conn.sourceHandle)
        ? noInputDup.filter(e => !(e.source === conn.source && e.sourceHandle === conn.sourceHandle))
        : noInputDup
      return addEdge(conn, base)
    })
  }, [edges, nodes])

  const onConnectStart = useCallback((_: unknown, p: { nodeId: string | null; handleId: string | null }) => {
    connectingFrom.current = p.nodeId && p.handleId ? { nodeId: p.nodeId, handleId: p.handleId } : null
  }, [])

  const spawnLeaf = useCallback((nodeId: string, handle: string, flowX: number, flowY: number, actionName: string | null) => {
    const leafId = newId()
    setNodes(n => [...n, { id: leafId, type: 'equip', position: { x: flowX, y: flowY }, data: { gearSetId: null, actionName, overlaySetIds: [] } }])
    setEdges(prev => {
      const isCategory = categoryOfHandle(nodes.find(n => n.id === nodeId)?.type ?? '', handle) !== null
      const base = isCategory ? prev : prev.filter(e => !(e.source === nodeId && e.sourceHandle === handle))
      return [...base, { id: `${nodeId}-${handle}-${leafId}`, source: nodeId, sourceHandle: handle, target: leafId, targetHandle: 'in' }]
    })
    // Auto-select the new leaf so its config panel (inspector) flies out immediately — no second click.
    // React Flow fires onPaneClick on the same drop that ends the connection (which clears the
    // selection), so defer one tick to ensure our selection lands LAST and the panel stays open.
    setTimeout(() => setSelectedId(leafId), 0)
  }, [nodes])

  // Create a Branch wired from (sourceNodeId, sourceHandle) → branch 'in'. Single-target sources
  // replace their prior edge.
  const spawnBranch = useCallback((sourceNodeId: string, sourceHandle: string, flowX: number, flowY: number) => {
    const bId = newId()
    const sType = nodesRef.current.find(n => n.id === sourceNodeId)?.type ?? ''
    setNodes(n => [...n, { id: bId, type: 'branch', position: { x: flowX, y: flowY }, data: {} }])
    setEdges(prev => {
      const base = isSingleTargetSource(sType, sourceHandle)
        ? prev.filter(e => !(e.source === sourceNodeId && e.sourceHandle === sourceHandle)) : prev
      return [...base, { id: `${sourceNodeId}-${sourceHandle}-${bId}`, source: sourceNodeId, sourceHandle, target: bId, targetHandle: 'in' }]
    })
  }, [])

  // Create a condition node wired into branch 'cond'. Replaces any existing condition on that branch.
  const spawnCondition = useCallback((branchId: string, condType: 'cond:buff' | 'cond:stat', flowX: number, flowY: number) => {
    const cId = newId()
    const data = condType === 'cond:buff' ? { buffName: null } : { resource: 'hpp', op: '<', value: 25 }
    setNodes(n => [...n, { id: cId, type: condType, position: { x: flowX, y: flowY }, data }])
    setEdges(prev => [
      ...prev.filter(e => !(e.target === branchId && e.targetHandle === 'cond')),
      { id: `${cId}-cond-${branchId}`, source: cId, sourceHandle: 'out', target: branchId, targetHandle: 'cond' },
    ])
    setTimeout(() => setSelectedId(cId), 0)
  }, [])

  // Create a Mode node wired from (sourceNodeId, sourceHandle) → mode 'in'. Single-target sources
  // replace their prior edge. Opens its inspector.
  const spawnModeWired = useCallback((sourceNodeId: string, sourceHandle: string, flowX: number, flowY: number) => {
    const mId = newId()
    const sType = nodesRef.current.find(n => n.id === sourceNodeId)?.type ?? ''
    setNodes(n => [...n, { id: mId, type: 'mode', position: { x: flowX, y: flowY }, data: { modeName: 'New Mode', modeCommand: null, members: [], memberNames: [] } }])
    setEdges(prev => {
      const base = isSingleTargetSource(sType, sourceHandle)
        ? prev.filter(e => !(e.source === sourceNodeId && e.sourceHandle === sourceHandle)) : prev
      return [...base, { id: `${sourceNodeId}-${sourceHandle}-${mId}`, source: sourceNodeId, sourceHandle, target: mId, targetHandle: 'in' }]
    })
    setTimeout(() => setSelectedId(mId), 0)
  }, [])

  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent) => {
    const from = connectingFrom.current
    connectingFrom.current = null
    if (!from) return
    const target = e.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const me = e as MouseEvent
    const flow = screenToFlowPosition({ x: me.clientX, y: me.clientY })
    const rect = (document.querySelector('.react-flow__pane') as HTMLElement)?.getBoundingClientRect()
    const menuX = me.clientX - (rect?.left ?? 0)
    const menuY = me.clientY - (rect?.top ?? 0)
    // Dragged from a Branch's condition input → offer condition nodes.
    if (from.handleId === 'cond') {
      setPalette({ x: menuX, y: menuY, flowX: flow.x, flowY: flow.y, connect: { nodeId: from.nodeId, handle: from.handleId, kind: 'cond' } })
      return
    }
    // Dragged from an exec output → offer Branch or Equip.
    setPalette({ x: menuX, y: menuY, flowX: flow.x, flowY: flow.y, connect: { nodeId: from.nodeId, handle: from.handleId, kind: 'exec' } })
  }, [screenToFlowPosition])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    lastPointer.current = { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    const me = e as React.MouseEvent
    // Position the palette relative to the canvas container (not the viewport) so it lands at
    // the cursor now that the editor renders inside the app's sidebar + padded content area.
    const rect = (me.currentTarget as HTMLElement).getBoundingClientRect()
    const x = me.clientX - rect.left
    const y = me.clientY - rect.top
    const flow = screenToFlowPosition({ x: me.clientX, y: me.clientY })
    setPalette({ x, y, flowX: flow.x, flowY: flow.y })
  }, [screenToFlowPosition])

  const addNode = useCallback((type: BlueprintNodeType) => {
    if (!palette) return
    const node: Node = {
      id: newId(), type,
      position: { x: palette.flowX, y: palette.flowY },
      data: type === 'equip'
        ? { gearSetId: null, overlaySetIds: [] }
        : type === 'mode'
        ? { modeName: 'New Mode', modeCommand: null, members: [], memberNames: [] }
        : type === 'cond:buff'
        ? { buffName: null }
        : type === 'cond:stat'
        ? { resource: 'hpp', op: '<', value: 25 }
        : {},   // branch
    }
    setNodes(n => [...n, node])
    setPalette(null)
    if (type === 'mode' || type === 'cond:buff' || type === 'cond:stat') setSelectedId(node.id)
  }, [palette])

  // Unified menu pick: if the menu was opened by dragging a tether (palette.connect set), spawn the
  // chosen node AND auto-wire it to the dragged pin; otherwise create an unwired node (addNode).
  const onMenuPick = useCallback((type: BlueprintNodeType) => {
    if (!palette) return
    const c = palette.connect
    if (!c) { addNode(type); return }
    const { nodeId, handle, kind } = c
    const { flowX, flowY } = palette
    if (kind === 'cond') {
      if (type === 'cond:buff' || type === 'cond:stat') spawnCondition(nodeId, type, flowX, flowY)
    } else if (type === 'branch') {
      spawnBranch(nodeId, handle, flowX, flowY)
    } else if (type === 'mode') {
      spawnModeWired(nodeId, handle, flowX, flowY)
    } else if (type === 'equip') {
      const sType = nodes.find(n => n.id === nodeId)?.type ?? ''
      const category = sType.startsWith('trigger:') ? categoryOfHandle(sType, handle) : null
      if (category !== null) {
        setPalette(null)
        setPicker({ x: palette.x, y: palette.y, flowX, flowY, nodeId, handle, category, allowGeneric: allowGenericForHandle(sType, handle) })
        return
      }
      spawnLeaf(nodeId, handle, flowX, flowY, null)
    }
    setPalette(null)
  }, [palette, nodes, addNode, spawnBranch, spawnCondition, spawnModeWired, spawnLeaf])

  const selected = nodes.find(n => n.id === selectedId)
  const chainEdgeIds = useMemo(
    () => (selectedId ? connectedEdgeIds(edges.map(e => ({ id: e.id, source: e.source, target: e.target })), selectedId) : new Set<string>()),
    [selectedId, edges])
  const displayEdges = useMemo(
    () => edges.map(e => chainEdgeIds.has(e.id) ? { ...e, className: 'is-chain' } : (e.className ? { ...e, className: undefined } : e)),
    [edges, chainEdgeIds])
  const assignSet = useCallback((setId: number) => {
    const s = sets.find(x => x.id === setId)
    setNodes(prev => prev.map(n => n.id === selectedId
      ? { ...n, data: { ...n.data, gearSetId: setId, setName: s?.name, category: s?.category } } : n))
  }, [selectedId, sets])

  const updateModeData = useCallback((fn: (d: ModeNodeData) => ModeNodeData) => {
    setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, data: fn(n.data as ModeNodeData) } : n))
  }, [selectedId])

  const setModeName = useCallback((v: string) => updateModeData(d => ({ ...d, modeName: v })), [updateModeData])
  const setModeCommand = useCallback((v: string) => updateModeData(d => ({ ...d, modeCommand: v })), [updateModeData])
  const addModeMember = useCallback((setId: number) => updateModeData(d => {
    const members = addMember(d.members ?? [], setId)
    return { ...d, members, memberNames: members.map(m => sets.find(s => s.id === m.gearSetId)?.name) }
  }), [updateModeData, sets])
  const removeModeMember = useCallback((i: number) => updateModeData(d => {
    const members = removeMember(d.members ?? [], i)
    return { ...d, members, memberNames: members.map(m => sets.find(s => s.id === m.gearSetId)?.name) }
  }), [updateModeData, sets])
  const moveModeMember = useCallback((i: number, dir: -1 | 1) => updateModeData(d => {
    const members = moveMember(d.members ?? [], i, dir)
    return { ...d, members, memberNames: members.map(m => sets.find(s => s.id === m.gearSetId)?.name) }
  }), [updateModeData, sets])

  const mutateMemberOverlay = useCallback((mi: number, fn: (ids: number[]) => number[]) => updateModeData(d => {
    const members = (d.members ?? []).map((m, i) => i === mi ? { ...m, overlaySetIds: fn(m.overlaySetIds ?? []) } : m)
    return { ...d, members, memberNames: members.map(m => sets.find(s => s.id === m.gearSetId)?.name) }
  }), [updateModeData, sets])
  const addMemberOverlay = useCallback((mi: number, setId: number) => mutateMemberOverlay(mi, ids => addOverlay(ids, setId)), [mutateMemberOverlay])
  const removeMemberOverlay = useCallback((mi: number, oi: number) => mutateMemberOverlay(mi, ids => removeOverlay(ids, oi)), [mutateMemberOverlay])
  const moveMemberOverlay = useCallback((mi: number, oi: number, dir: -1 | 1) => mutateMemberOverlay(mi, ids => moveOverlay(ids, oi, dir)), [mutateMemberOverlay])

  const updateEquipData = useCallback((fn: (d: Record<string, unknown>) => Record<string, unknown>) => {
    setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, data: fn(n.data) } : n))
  }, [selectedId])

  const updateCondData = useCallback((patch: Record<string, unknown>) => {
    setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [selectedId])
  const addEquipOverlay = useCallback((setId: number) =>
    updateEquipData(d => ({ ...d, overlaySetIds: addOverlay((d.overlaySetIds as number[]) ?? [], setId) })), [updateEquipData])
  const removeEquipOverlay = useCallback((i: number) =>
    updateEquipData(d => ({ ...d, overlaySetIds: removeOverlay((d.overlaySetIds as number[]) ?? [], i) })), [updateEquipData])
  const moveEquipOverlay = useCallback((i: number, dir: -1 | 1) =>
    updateEquipData(d => ({ ...d, overlaySetIds: moveOverlay((d.overlaySetIds as number[]) ?? [], i, dir) })), [updateEquipData])

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedId(cur => (cur === nodeId ? null : cur))
    setNodeMenu(null)
  }, [])

  // Menu Copy: copy the right-clicked node, or the whole selection if that node is part of it.
  const copyFromMenu = useCallback((nodeId: string) => {
    const sel = nodesRef.current.filter(n => n.selected).map(n => n.id)
    copyNodeIds(sel.includes(nodeId) ? sel : [nodeId])
    setNodeMenu(null)
  }, [copyNodeIds])

  // Right-click a node → small delete menu. stopPropagation so the pane's add-node palette
  // (onPaneContextMenu on the wrapper) does NOT also open.
  const onNodeContextMenu = useCallback((e: React.MouseEvent, n: Node) => {
    e.preventDefault()
    e.stopPropagation()
    lastPointer.current = { x: e.clientX, y: e.clientY }
    const pane = (e.currentTarget as HTMLElement).closest('.react-flow') as HTMLElement | null
    const rect = pane?.getBoundingClientRect()
    setNodeMenu({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), nodeId: n.id })
    setPalette(null); setPicker(null)
  }, [])

  const onGenerate = useCallback(async () => {
    await save(toGraph())
    const result = await generate()
    setExportLua(result)
  }, [save, toGraph, generate])

  const fileName = useMemo(() => `${job}.lua`, [job])

  // Which palette items are offered: right-click (no connect) shows everything except Equip (equips
  // are created by dragging from a pin); a drag-connect shows only nodes the dragged pin can wire to.
  const menuFilter = (type: BlueprintNodeType): boolean => {
    const c = palette?.connect
    if (!c) return type !== 'equip'
    if (c.kind === 'cond') return isValidConnection(type, 'out', 'branch', 'cond')
    const sType = nodes.find(n => n.id === c.nodeId)?.type ?? ''
    return isValidConnection(sType, c.handle, type, 'in')
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <div className="fixed inset-0 lg:left-64 z-10 flex flex-col bg-[#0d1117] text-gray-100">
      <div className="flex items-center gap-3 flex-wrap border-b border-gray-800 px-4 py-2">
        <button onClick={() => navigate(`/characters/${id}?tab=Gear%20Sets&job=${encodeURIComponent(job)}`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Back to character
        </button>
        <span className="font-bold">{character?.name ?? '…'} · <span className="text-amber-300">{job}</span> Blueprint</span>
        <span className="ml-auto text-[10px] text-gray-500">right-click canvas to add · Del (or right-click a node) to remove · autosaves</span>
        <button onClick={onGenerate}
          className="flex items-center gap-1.5 rounded border border-amber-700/40 bg-indigo-900/50 px-3 py-1.5 text-xs text-amber-200">
          <Download className="h-3.5 w-3.5" /> Generate GearSwap file
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1" onContextMenu={onPaneContextMenu} onMouseMove={onPaneMouseMove}>
          <ReactFlow
            nodes={nodes} edges={displayEdges}
            nodeTypes={nodeTypes}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Delete', 'Backspace']}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            isValidConnection={(conn) => {
              const st = nodes.find(n => n.id === conn.source)?.type ?? ''
              const tt = nodes.find(n => n.id === conn.target)?.type ?? ''
              return isValidConnection(st, conn.sourceHandle, tt, conn.targetHandle)
            }}
            onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={() => { setSelectedId(null); setPalette(null); setNodeMenu(null) }}
            fitView>
            <Background />
            <Controls />
          </ReactFlow>
          {palette && (
            <NodePalette x={palette.x} y={palette.y} onPick={onMenuPick} onClose={() => setPalette(null)}
              filter={menuFilter}
              onPaste={!palette.connect && hasClip ? () => { pasteAt(lastPointer.current); setPalette(null) } : undefined} />
          )}
          {picker && (
            <ActionPicker
              x={picker.x} y={picker.y} category={picker.category} allowGeneric={picker.allowGeneric}
              disabledNames={new Set(
                edges.filter(e => e.source === picker.nodeId && e.sourceHandle === picker.handle)
                  .map(e => nodes.find(n => n.id === e.target))
                  .map(n => (n?.data as { actionName?: string } | undefined)?.actionName)
                  .filter((a): a is string => !!a))}
              onPick={(actionName) => {
                if (actionName && hasAction(nodes as never, edges as never, picker.nodeId, picker.handle, actionName)) { setPicker(null); return }
                spawnLeaf(picker.nodeId, picker.handle, picker.flowX, picker.flowY, actionName)
                setPicker(null)
              }}
              onClose={() => setPicker(null)}
            />
          )}

          {nodeMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNodeMenu(null)} />
              <div className="absolute z-20 w-40 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
                style={{ left: nodeMenu.x, top: nodeMenu.y }}>
                <button onClick={() => copyFromMenu(nodeMenu.nodeId)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {hasClip ? (
                  <button onClick={() => { pasteAt(lastPointer.current); setNodeMenu(null) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste
                  </button>
                ) : null}
                <div className="border-t border-gray-700" />
                <button onClick={() => deleteNode(nodeMenu.nodeId)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-gray-700">
                  <Trash2 className="h-3.5 w-3.5" /> Delete node
                </button>
              </div>
            </>
          )}
        </div>
        {selected?.type === 'equip' && (
          <EquipInspector
            sets={sets}
            selectedSetId={(selected.data as { gearSetId?: number | null }).gearSetId}
            onChange={assignSet}
            actionContext={(() => {
              const inEdge = edges.find(e => e.target === selected!.id)
              const trig = nodes.find(n => n.id === inEdge?.source)
              const a = (selected!.data as { actionName?: string }).actionName
              if (!trig || !inEdge) return undefined
              return `${(trig.type ?? '').replace('trigger:', '')} → ${inEdge.sourceHandle}${a ? ` → ${labelForAction(a)}` : ''}`
            })()}
            overlayIds={(selected.data as { overlaySetIds?: number[] }).overlaySetIds ?? []}
            onAddOverlay={addEquipOverlay}
            onRemoveOverlay={removeEquipOverlay}
            onMoveOverlay={moveEquipOverlay}
          />
        )}
        {selected?.type === 'mode' && (
          <ModeInspector
            sets={sets}
            name={(selected.data as ModeNodeData).modeName ?? 'Mode'}
            command={(selected.data as ModeNodeData).modeCommand?.trim() || `cycle ${(selected.data as ModeNodeData).modeName ?? 'Mode'} set`}
            members={(selected.data as ModeNodeData).members ?? []}
            onNameChange={setModeName}
            onCommandChange={setModeCommand}
            onAddMember={addModeMember}
            onRemoveMember={removeModeMember}
            onMoveMember={moveModeMember}
            onAddMemberOverlay={addMemberOverlay}
            onRemoveMemberOverlay={removeMemberOverlay}
            onMoveMemberOverlay={moveMemberOverlay}
          />
        )}
        {selected?.type === 'cond:buff' && (
          <CondBuffInspector
            buffName={(selected.data as { buffName?: string | null }).buffName}
            onChange={(raw) => updateCondData({ buffName: raw })}
          />
        )}
        {selected?.type === 'cond:stat' && (
          <CondStatInspector
            resource={(selected.data as { resource?: string | null }).resource}
            op={(selected.data as { op?: string | null }).op}
            value={(selected.data as { value?: number | null }).value}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
      </div>

      {exportLua && (
        <GearSetExportModal
          name={fileName}
          luaOverride={exportLua.lua}
          warnings={exportLua.warnings}
          onClose={() => setExportLua(null)}
        />
      )}
    </div>
  )
}

export default function BlueprintEditorPage() {
  return (
    <ReactFlowProvider>
      <BlueprintEditorInner />
    </ReactFlowProvider>
  )
}
