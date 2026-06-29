import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow, ReactFlowProvider, SelectionMode,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './BlueprintEditor.css'
import { ArrowLeft, Download, Trash2, Copy, ClipboardPaste } from 'lucide-react'
import { api } from '../api/client'
import { useJobBlueprint } from '../hooks/useJobBlueprint'
import { wouldCreateCycle, isValidConnection, isSingleTargetSource, handleInfo, handlesOf, upstreamChainEdgeIds, TRIGGER_DEFS } from '../components/character/blueprint/blueprintGraph'
import ActionPicker from '../components/character/blueprint/ActionPicker'
import { categoryOfHandle, hasAction, allowGenericForHandle, labelForAction, addMember, removeMember, moveMember, addOverlay, removeOverlay, moveOverlay, cloneSelection, pasteClone, clipboardAnchor, dropDuplicateSingletons, DEFAULT_CHAT_COLOR, menuCandidateValid, type ActionCategory, type Clipboard } from '../components/character/blueprint/blueprintGraph'
import TriggerNode from '../components/character/blueprint/TriggerNode'
import EquipGearSetNode from '../components/character/blueprint/EquipGearSetNode'
import NodePalette from '../components/character/blueprint/NodePalette'
import EquipInspector from '../components/character/blueprint/EquipInspector'
import ModeNode, { type ModeNodeData } from '../components/character/blueprint/ModeNode'
import ModeInspector from '../components/character/blueprint/ModeInspector'
import BranchNode from '../components/character/blueprint/BranchNode'
import ValueNode from '../components/character/blueprint/ValueNode'
import BuffNode from '../components/character/blueprint/BuffNode'
import SpellNode from '../components/character/blueprint/SpellNode'
import SpellInspector from '../components/character/blueprint/SpellInspector'
import PetNode from '../components/character/blueprint/PetNode'
import PetInspector from '../components/character/blueprint/PetInspector'
import WorldNode from '../components/character/blueprint/WorldNode'
import WorldInspector from '../components/character/blueprint/WorldInspector'
import CompareNode from '../components/character/blueprint/CompareNode'
import OperatorNode from '../components/character/blueprint/OperatorNode'
import CommentNode from '../components/character/blueprint/CommentNode'
import SetupNode from '../components/character/blueprint/SetupNode'
import LuaNode from '../components/character/blueprint/LuaNode'
import PrintNode from '../components/character/blueprint/PrintNode'
import SetupInspector from '../components/character/blueprint/SetupInspector'
import LuaInspector from '../components/character/blueprint/LuaInspector'
import PrintInspector from '../components/character/blueprint/PrintInspector'
import CompareInspector from '../components/character/blueprint/CompareInspector'
import GearSetExportModal from '../components/character/GearSetExportModal'
import ValidationResultsPanel from '../components/character/blueprint/ValidationResultsPanel'
import type {
  CharacterDetail, GearSetSummary, BlueprintGraph, BlueprintNodeType, Diagnostic,
} from '../types/api'

const nodeTypes = {
  // Every trigger type renders with TriggerNode — derived from TRIGGER_DEFS so a newly added
  // trigger can never be forgotten here (React Flow falls back to a blank default node otherwise).
  ...Object.fromEntries(Object.keys(TRIGGER_DEFS).map((t) => [t, TriggerNode])),
  equip: EquipGearSetNode,
  mode: ModeNode,
  branch: BranchNode,
  value: ValueNode,
  buff: BuffNode,
  spell: SpellNode,
  pet: PetNode,
  world: WorldNode,
  'op:compare': CompareNode,
  'op:and': OperatorNode,
  'op:or': OperatorNode,
  'op:not': OperatorNode,
  comment: CommentNode,
  setup: SetupNode,
  lua: LuaNode,
  print: PrintNode,
}

let idSeq = 1
const newId = () => `n${Date.now()}_${idSeq++}`

// Default data for a freshly created node of the given type.
const defaultData = (type: BlueprintNodeType): Record<string, unknown> => {
  switch (type) {
    case 'equip': return { gearSetId: null, overlaySetIds: [] }
    case 'mode': return { modeName: 'New Mode', modeCommand: null, members: [], memberNames: [] }
    case 'value': return { resource: 'hpp' }
    case 'buff': return { buffName: null }
    case 'spell': return { spellField: 'name', spellValue: null }
    case 'pet': return { petField: 'exists', petValue: null }
    case 'world': return { worldField: 'weather', worldValue: null, worldLabel: null }
    case 'op:compare': return { resource: 'hpp', op: '<', value: 25 }
    case 'comment': return { text: '', width: 320, height: 180 }
    case 'setup': return { code: '' }
    case 'lua': return { code: '' }
    case 'print': return { chatText: '', chatColor: DEFAULT_CHAT_COLOR }
    default: return {}   // branch, op:and/op:or/op:not, triggers
  }
}

// Node-level fields (beyond data) a freshly created/hydrated node needs. Comments carry an explicit
// size; layering (comment behind real nodes) is applied at render time via displayNodes, not here.
const nodeExtras = (type: BlueprintNodeType, data: Record<string, unknown>): Partial<Node> =>
  type === 'comment'
    ? { width: (data.width as number) ?? 320, height: (data.height as number) ?? 180 }
    : {}

function BlueprintEditorInner() {
  const { id = '', job = '' } = useParams()
  const navigate = useNavigate()
  const { graph, loading, save, generate } = useJobBlueprint(id, job)

  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [sets, setSets] = useState<GearSetSummary[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [palette, setPalette] = useState<{ x: number; y: number; flowX: number; flowY: number; connect?: { nodeId: string; handle: string } } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportLua, setExportLua] = useState<{ lua: string; warnings: string[] } | null>(null)
  const [validation, setValidation] = useState<Diagnostic[] | null>(null)
  const hydrated = useRef(false)
  const { screenToFlowPosition, getNode, setCenter, getZoom } = useReactFlow()
  const connectingFrom = useRef<{ nodeId: string; handleId: string } | null>(null)
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number; nodeId: string; handle: string; category: ActionCategory; allowGeneric: boolean } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [hasClip, setHasClip] = useState(false)
  const clipboard = useRef<Clipboard | null>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const rightDownPos = useRef<{ x: number; y: number } | null>(null)
  // Set while dragging a lone comment frame: the comment's start position + the nodes captured inside
  // it (with their start positions) so onNodeDrag can shift them by the same delta (UE-style).
  const commentDrag = useRef<{ startX: number; startY: number; captured: { id: string; x: number; y: number }[] } | null>(null)
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

  // Pan/zoom to center a node and give it the sole selection (gold ring). Used when a user tries to
  // place a second trigger of a type that already exists — we navigate to the existing one instead.
  const focusNode = useCallback((nodeId: string) => {
    const n = getNode(nodeId)
    if (n) {
      const w = n.measured?.width ?? 220
      const h = n.measured?.height ?? 90
      setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: getZoom(), duration: 400 })
    }
    setNodes(prev => prev.map(x => ({ ...x, selected: x.id === nodeId })))
    setSelectedId(nodeId)
  }, [getNode, setCenter, getZoom])

  // Paste the clipboard so its top-left anchor lands at the given screen pointer. Returns false if
  // nothing to paste / no pointer. Pasted nodes replace the current selection. Trigger and setup nodes
  // whose type already exists are dropped (singletons — see dropDuplicateSingletons).
  const pasteAt = useCallback((pointer: { x: number; y: number } | null): boolean => {
    const clip = clipboard.current
    if (!clip || clip.nodes.length === 0 || !pointer) return false
    const flow = screenToFlowPosition({ x: pointer.x, y: pointer.y })
    const anchor = clipboardAnchor(clip)
    const offset = { x: flow.x - anchor.x, y: flow.y - anchor.y }
    const pasted = pasteClone(clip, newId, offset)
    const existingSingletons = new Set(
      nodesRef.current.filter(n => n.type?.startsWith('trigger:') || n.type === 'setup').map(n => n.type!))
    const { nodes: nn, edges: ee } = dropDuplicateSingletons(pasted.nodes, pasted.edges, existingSingletons)
    if (nn.length === 0) return false   // everything pasted was a duplicate trigger
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
    setNodes(graph.nodes.map(n => {
      const data = n.type === 'equip'
        ? { gearSetId: n.data.gearSetId, actionName: n.data.actionName ?? null,
            overlaySetIds: n.data.overlaySetIds ?? [],
            setName: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.name : undefined,
            category: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.category : undefined }
        : n.type === 'mode'
        ? { modeName: n.data.modeName ?? 'Mode', modeCommand: n.data.modeCommand ?? null,
            members: n.data.members ?? [],
            memberNames: (n.data.members ?? []).map(m => setById.get(m.gearSetId)?.name) }
        : n.type === 'buff'
        ? { buffName: n.data.buffName ?? null }
        : n.type === 'spell'
        ? { spellField: (n.data.spellField ?? 'name') as 'name' | 'skill' | 'element' | 'contains', spellValue: n.data.spellValue ?? null }
        : n.type === 'pet'
        ? { petField: (n.data.petField ?? 'exists') as 'exists' | 'status', petValue: n.data.petValue ?? null }
        : n.type === 'world'
        ? { worldField: (n.data.worldField ?? 'weather') as 'weather' | 'day' | 'moghouse' | 'zone', worldValue: n.data.worldValue ?? null, worldLabel: n.data.worldLabel ?? null }
        : n.type === 'value'
        ? { resource: n.data.resource ?? 'hpp' }
        : n.type === 'op:compare'
        ? { resource: n.data.resource ?? 'hpp', op: n.data.op ?? '<', value: n.data.value ?? 25 }
        : n.type === 'comment'
        ? { text: n.data.text ?? '', width: n.data.width ?? 320, height: n.data.height ?? 180 }
        : n.type === 'setup' || n.type === 'lua'
        ? { code: n.data.code ?? '' }
        : n.type === 'print'
        ? { chatText: n.data.chatText ?? '', chatColor: n.data.chatColor ?? DEFAULT_CHAT_COLOR }
        : {}   // branch, op:and/op:or/op:not: no data
      return { id: n.id, type: n.type, position: n.position, data, ...nodeExtras(n.type, data) }
    }))
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
      } else if (t === 'buff') {
        data = { buffName: (n.data as { buffName?: string | null }).buffName ?? null }
      } else if (t === 'spell') {
        const d = n.data as { spellField?: 'name' | 'skill' | 'element' | 'contains' | null; spellValue?: string | null }
        data = { spellField: d.spellField ?? 'name', spellValue: d.spellValue ?? null }
      } else if (t === 'pet') {
        const d = n.data as { petField?: 'exists' | 'status' | null; petValue?: string | null }
        data = { petField: d.petField ?? 'exists', petValue: d.petValue ?? null }
      } else if (t === 'world') {
        const d = n.data as { worldField?: 'weather' | 'day' | 'moghouse' | 'zone' | null; worldValue?: string | null; worldLabel?: string | null }
        data = { worldField: d.worldField ?? 'weather', worldValue: d.worldValue ?? null, worldLabel: d.worldLabel ?? null }
      } else if (t === 'value') {
        data = { resource: (n.data as { resource?: string | null }).resource ?? 'hpp' }
      } else if (t === 'op:compare') {
        const d = n.data as { resource?: string | null; op?: string | null; value?: number | null }
        data = { resource: d.resource ?? 'hpp', op: d.op ?? '<', value: d.value ?? 25 }
      } else if (t === 'comment') {
        const d = n.data as { text?: string | null; width?: number | null; height?: number | null }
        // node.width/height are the live RF dims (NodeResizer writes them); data mirrors them via
        // onResize. Prefer the live node dims, fall back to data, then the default.
        data = { text: d.text ?? '', width: n.width ?? d.width ?? 320, height: n.height ?? d.height ?? 180 }
      } else if (t === 'setup' || t === 'lua') {
        data = { code: (n.data as { code?: string | null }).code ?? '' }
      } else if (t === 'print') {
        const d = n.data as { chatText?: string | null; chatColor?: number | null }
        data = { chatText: d.chatText ?? '', chatColor: d.chatColor ?? DEFAULT_CHAT_COLOR }
      } else if (t === 'branch' || t === 'op:and' || t === 'op:or' || t === 'op:not') {
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

  // UE-style comment containment: when a LONE comment frame starts dragging, capture every node fully
  // inside its bounds (+ their start positions) so they move with it. Guarding on a single dragged
  // node avoids fighting a multi-select drag (where React Flow already moves the whole selection).
  const onNodeDragStart = useCallback((_: unknown, node: Node, dragged: Node[]) => {
    if (node.type !== 'comment' || dragged.length !== 1) { commentDrag.current = null; return }
    const cx = node.position.x, cy = node.position.y
    const cw = node.width ?? node.measured?.width ?? 0
    const ch = node.height ?? node.measured?.height ?? 0
    const captured = nodesRef.current
      .filter(n => n.id !== node.id)
      .filter(n => {
        const nw = n.measured?.width ?? n.width ?? 0
        const nh = n.measured?.height ?? n.height ?? 0
        return n.position.x >= cx && n.position.y >= cy
          && n.position.x + nw <= cx + cw && n.position.y + nh <= cy + ch
      })
      .map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
    commentDrag.current = { startX: cx, startY: cy, captured }
  }, [])

  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    const cap = commentDrag.current
    if (!cap || node.type !== 'comment' || cap.captured.length === 0) return
    const dx = node.position.x - cap.startX, dy = node.position.y - cap.startY
    const byId = new Map(cap.captured.map(c => [c.id, c]))
    setNodes(ns => ns.map(n => {
      const c = byId.get(n.id)
      return c ? { ...n, position: { x: c.x + dx, y: c.y + dy } } : n
    }))
  }, [])

  const onNodeDragStop = useCallback(() => { commentDrag.current = null }, [])

  const onPaneMouseMove = useCallback((e: React.MouseEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  // Record where a right-button press started so onPaneContextMenu can tell a right-CLICK (open the
  // add menu) from a right-DRAG (pan the canvas — panOnDrag={[2]}), which also fires contextmenu.
  // Must be a document CAPTURE listener: React Flow handles the right-button mousedown for panning and
  // stops it propagating, so a synthetic onMouseDown on the wrapper never fires.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (e.button === 2) rightDownPos.current = { x: e.clientX, y: e.clientY } }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
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

  // Create a node of `type` (seeded with `data` or its defaults) and wire it to the tether dragged
  // from (fromId, fromHandle): the new node's same-type, opposite-direction handle connects to the
  // dragged pin. Single-target source outputs replace their prior edge; one edge per target handle.
  const spawnAndWire = useCallback((fromId: string, fromHandle: string, type: BlueprintNodeType, data: Record<string, unknown> | undefined, x: number, y: number): boolean => {
    const fromType = nodesRef.current.find(n => n.id === fromId)?.type ?? ''
    const from = handleInfo(fromType, fromHandle)
    if (!from) return false
    const wantDir = from.dir === 'out' ? 'in' : 'out'
    const match = handlesOf(type).find(h => h.type === from.type && h.dir === wantDir)
    if (!match) return false
    const nid = newId()
    setNodes(n => [...n, { id: nid, type, position: { x, y }, data: data ?? defaultData(type) }])
    setEdges(prev => {
      const [src, srcH, tgt, tgtH] = from.dir === 'out'
        ? [fromId, fromHandle, nid, match.id]
        : [nid, match.id, fromId, fromHandle]
      const srcType = src === fromId ? fromType : type
      const base = isSingleTargetSource(srcType, srcH)
        ? prev.filter(e => !(e.source === src && e.sourceHandle === srcH)) : prev
      const noInputDup = base.filter(e => !(e.target === tgt && e.targetHandle === tgtH))
      return [...noInputDup, { id: `${src}-${srcH}-${tgt}`, source: src, sourceHandle: srcH, target: tgt, targetHandle: tgtH }]
    })
    setTimeout(() => setSelectedId(nid), 0)
    return true
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
    // Open the node menu at the cursor, pre-wired to the dragged pin. menuFilter (menuCandidateValid)
    // filters it to type-compatible nodes. Defer one tick: React Flow fires onPaneClick on the SAME
    // connection drop, whose setPalette(null) would otherwise clobber this open in the same React
    // batch — setTimeout lands the open AFTER it.
    const open = { x: menuX, y: menuY, flowX: flow.x, flowY: flow.y, connect: { nodeId: from.nodeId, handle: from.handleId } }
    setTimeout(() => setPalette(open), 0)
  }, [screenToFlowPosition])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    const me = e as React.MouseEvent
    // A right-DRAG pans the canvas (panOnDrag={[2]}) but the browser still fires contextmenu on the
    // drag-end mouseup. If the pointer moved since the right-press it was a pan, not a click — skip
    // the menu (but still preventDefault, so no native browser menu either).
    const down = rightDownPos.current
    rightDownPos.current = null
    if (down && Math.hypot(me.clientX - down.x, me.clientY - down.y) > 5) return
    lastPointer.current = { x: me.clientX, y: me.clientY }
    // Position the palette relative to the canvas container (not the viewport) so it lands at
    // the cursor now that the editor renders inside the app's sidebar + padded content area.
    const rect = (me.currentTarget as HTMLElement).getBoundingClientRect()
    const x = me.clientX - rect.left
    const y = me.clientY - rect.top
    const flow = screenToFlowPosition({ x: me.clientX, y: me.clientY })
    setPalette({ x, y, flowX: flow.x, flowY: flow.y })
  }, [screenToFlowPosition])

  const addNode = useCallback((type: BlueprintNodeType, data?: Record<string, unknown>) => {
    if (!palette) return
    // Triggers are singletons per type: each maps 1:1 to a Lua event function (precast/aftercast/…),
    // so a second one would emit a duplicate `function precast(spell)` that silently overwrites the
    // first. If one already exists, navigate to it instead of creating a duplicate.
    if (type.startsWith('trigger:') || type === 'setup') {
      const existing = nodes.find(n => n.type === type)
      if (existing) { focusNode(existing.id); setPalette(null); return }
    }
    const nodeData = data ?? defaultData(type)
    const node: Node = { id: newId(), type, position: { x: palette.flowX, y: palette.flowY }, data: nodeData, ...nodeExtras(type, nodeData) }
    setNodes(n => [...n, node])
    setPalette(null)
    // Open the inspector for configurable nodes (mode, compare, spell); value/buff/comment are static.
    if (type === 'equip' || type === 'mode' || type === 'op:compare' || type === 'spell' || type === 'pet' || type === 'world' || type === 'setup' || type === 'lua' || type === 'print') setSelectedId(node.id)
  }, [palette, nodes, focusNode])

  // Unified menu pick: if the menu was opened by dragging a tether (palette.connect set), spawn the
  // chosen node AND auto-wire it to the dragged pin; otherwise create an unwired node (addNode).
  const onMenuPick = useCallback((type: BlueprintNodeType, data?: Record<string, unknown>) => {
    if (!palette) return
    const c = palette.connect
    if (!c) { addNode(type, data); return }
    const { nodeId, handle } = c
    const { flowX, flowY } = palette
    // Equip dragged from a category trigger pin → open the action picker (pick the spell/buff first).
    if (type === 'equip') {
      const sType = nodes.find(n => n.id === nodeId)?.type ?? ''
      const category = sType.startsWith('trigger:') ? categoryOfHandle(sType, handle) : null
      if (category !== null) {
        setPalette(null)
        setPicker({ x: palette.x, y: palette.y, flowX, flowY, nodeId, handle, category, allowGeneric: allowGenericForHandle(sType, handle) })
        return
      }
    }
    // Context Sensitive OFF can offer a node that doesn't fit the dragged pin; if it can't wire,
    // drop it unwired at the cursor (addNode handles singletons + opens the inspector).
    if (!spawnAndWire(nodeId, handle, type, data, flowX, flowY)) addNode(type, data)
    setPalette(null)
  }, [palette, nodes, addNode, spawnAndWire])

  const selected = nodes.find(n => n.id === selectedId)
  const chainEdgeIds = useMemo(
    () => (selectedId ? upstreamChainEdgeIds(edges.map(e => ({ id: e.id, source: e.source, target: e.target, targetHandle: e.targetHandle })), selectedId) : new Set<string>()),
    [selectedId, edges])
  const displayEdges = useMemo(
    () => edges.map(e => chainEdgeIds.has(e.id) ? { ...e, className: 'is-chain' } : (e.className ? { ...e, className: undefined } : e)),
    [edges, chainEdgeIds])
  // Layering: comments sit behind real nodes. Injected at render (non-negative z) rather than stored,
  // and paired with elevateNodesOnSelect={false} so selecting a comment doesn't pop it in front.
  const displayNodes = useMemo(
    () => nodes.map(n => { const z = n.type === 'comment' ? 0 : 1; return n.zIndex === z ? n : { ...n, zIndex: z } }),
    [nodes])
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
    if (result.diagnostics.some(d => d.severity === 'error')) {
      setValidation(result.diagnostics)   // open results panel; do NOT open export
      setExportLua(null)
    } else {
      setValidation(null)
      setExportLua({ lua: result.lua, warnings: result.diagnostics.map(d => d.message) })
    }
  }, [save, toGraph, generate])

  const fileName = useMemo(() => `${job}.lua`, [job])

  // Which palette items are offered: right-click (no connect) shows everything except Equip (equips
  // are created by dragging from a pin); a drag-connect shows only nodes the dragged pin can wire to.
  // Right-click (no drag) offers everything except Equip (equips are created by dragging from a pin).
  // A drag offers only nodes whose handles are type-compatible with the dragged pin (context-sensitive).
  const menuFilter = (type: BlueprintNodeType): boolean => {
    const c = palette?.connect
    if (!c) return type !== 'equip'
    const fromType = nodes.find(n => n.id === c.nodeId)?.type ?? ''
    return menuCandidateValid(fromType, c.handle, type)
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <div className="fixed inset-0 lg:left-64 z-10 flex flex-col bg-[#0d1117] text-gray-100">
      <div className="flex items-center gap-3 flex-wrap border-b border-gray-800 px-4 py-2">
        <button onClick={() => navigate(`/characters/${id}?tab=Gear%20Sets&job=${encodeURIComponent(job)}`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Back to character
        </button>
        <span className="font-bold">{character?.name ?? '…'} · <span className="text-amber-300">{job}</span> Blueprint</span>
        <span className="ml-auto text-[10px] text-gray-500">right-click to add · drag to box-select · right-drag to pan · Del to remove · autosaves</span>
        <button onClick={onGenerate}
          className="flex items-center gap-1.5 rounded border border-amber-700/40 bg-indigo-900/50 px-3 py-1.5 text-xs text-amber-200">
          <Download className="h-3.5 w-3.5" /> Generate GearSwap file
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-w-0 flex-1" onContextMenu={onPaneContextMenu} onMouseMove={onPaneMouseMove}>
          <ReactFlow
            nodes={displayNodes} edges={displayEdges}
            nodeTypes={nodeTypes}
            elevateNodesOnSelect={false}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Delete', 'Backspace']}
            panOnDrag={[2]}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            isValidConnection={(conn) => {
              const st = nodes.find(n => n.id === conn.source)?.type ?? ''
              const tt = nodes.find(n => n.id === conn.target)?.type ?? ''
              return isValidConnection(st, conn.sourceHandle, tt, conn.targetHandle)
            }}
            onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
            onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
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
          {validation && (
            <ValidationResultsPanel
              diagnostics={validation}
              onJump={focusNode}
              onClose={() => setValidation(null)}
            />
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
        {selected?.type === 'op:compare' && (
          <CompareInspector
            resource={(selected.data as { resource?: string | null }).resource}
            op={(selected.data as { op?: string | null }).op}
            value={(selected.data as { value?: number | null }).value}
            valueWired={edges.some(e => e.target === selected!.id && e.targetHandle === 'in')}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'spell' && (
          <SpellInspector
            field={((selected.data as { spellField?: 'name' | 'skill' | 'element' | 'contains' | null }).spellField) ?? 'name'}
            value={(selected.data as { spellValue?: string | null }).spellValue}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'pet' && (
          <PetInspector
            field={((selected.data as { petField?: 'exists' | 'status' | null }).petField) ?? 'exists'}
            value={(selected.data as { petValue?: string | null }).petValue}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'world' && (
          <WorldInspector
            field={((selected.data as { worldField?: 'weather' | 'day' | 'moghouse' | 'zone' | null }).worldField) ?? 'weather'}
            value={(selected.data as { worldValue?: string | null }).worldValue}
            label={(selected.data as { worldLabel?: string | null }).worldLabel}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'setup' && (
          <SetupInspector
            code={(selected.data as { code?: string | null }).code}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'lua' && (
          <LuaInspector
            code={(selected.data as { code?: string | null }).code}
            onChange={(patch) => updateCondData(patch)}
          />
        )}
        {selected?.type === 'print' && (
          <PrintInspector
            text={(selected.data as { chatText?: string | null }).chatText}
            color={(selected.data as { chatColor?: number | null }).chatColor}
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
