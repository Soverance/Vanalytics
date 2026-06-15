import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Download } from 'lucide-react'
import { api } from '../api/client'
import { useJobWorkflow } from '../hooks/useJobWorkflow'
import { wouldCreateCycle } from '../components/character/workflow/workflowGraph'
import TriggerNode from '../components/character/workflow/TriggerNode'
import EquipGearSetNode from '../components/character/workflow/EquipGearSetNode'
import NodePalette from '../components/character/workflow/NodePalette'
import EquipInspector from '../components/character/workflow/EquipInspector'
import GearSetExportModal from '../components/character/GearSetExportModal'
import type {
  CharacterDetail, GearSetSummary, WorkflowGraph, WorkflowNodeType,
} from '../types/api'

const nodeTypes = {
  'trigger:status_change': TriggerNode,
  'trigger:precast': TriggerNode,
  'trigger:aftercast': TriggerNode,
  equip: EquipGearSetNode,
}

let idSeq = 1
const newId = () => `n${Date.now()}_${idSeq++}`

export default function WorkflowEditorPage() {
  const { id = '', job = '' } = useParams()
  const navigate = useNavigate()
  const { graph, loading, save, generate } = useJobWorkflow(id, job)

  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [sets, setSets] = useState<GearSetSummary[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [palette, setPalette] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportLua, setExportLua] = useState<{ lua: string; warnings: string[] } | null>(null)
  const hydrated = useRef(false)

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
        ? { gearSetId: n.data.gearSetId, setName: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.name : undefined,
            category: n.data.gearSetId != null ? setById.get(n.data.gearSetId)?.category : undefined }
        : {},
    })))
    setEdges(graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })))
  }, [graph, sets])

  const toGraph = useCallback((): WorkflowGraph => ({
    version: 1,
    nodes: nodes.map(n => ({
      id: n.id, type: n.type as WorkflowNodeType, position: n.position,
      data: { gearSetId: (n.data as { gearSetId?: number | null }).gearSetId ?? null },
    })),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  }), [nodes, edges])

  useEffect(() => {
    if (!hydrated.current) return
    const t = setTimeout(() => { save(toGraph()).catch(() => {}) }, 800)
    return () => clearTimeout(t)
  }, [nodes, edges, save, toGraph])

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes(n => applyNodeChanges(c, n)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), [])

  const onConnect = useCallback((conn: Connection) => {
    if (wouldCreateCycle(edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        conn.source!, conn.target!)) return
    setEdges(prev => {
      const withoutTargetDup = prev.filter(e => e.target !== conn.target)
      const withoutSameSourceHandle = withoutTargetDup.filter(
        e => !(e.source === conn.source && e.sourceHandle === conn.sourceHandle))
      return addEdge(conn, withoutSameSourceHandle)
    })
  }, [edges])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    const me = e as React.MouseEvent
    // Position the palette relative to the canvas container (not the viewport) so it lands at
    // the cursor now that the editor renders inside the app's sidebar + padded content area.
    const rect = (me.currentTarget as HTMLElement).getBoundingClientRect()
    const x = me.clientX - rect.left
    const y = me.clientY - rect.top
    setPalette({ x, y, flowX: x, flowY: y })
  }, [])

  const addNode = useCallback((type: WorkflowNodeType) => {
    if (!palette) return
    const node: Node = {
      id: newId(), type,
      position: { x: palette.flowX - 260, y: palette.flowY - 120 },
      data: type === 'equip' ? { gearSetId: null } : {},
    }
    setNodes(n => [...n, node])
    setPalette(null)
  }, [palette])

  const selected = nodes.find(n => n.id === selectedId)
  const assignSet = useCallback((setId: number) => {
    const s = sets.find(x => x.id === setId)
    setNodes(prev => prev.map(n => n.id === selectedId
      ? { ...n, data: { gearSetId: setId, setName: s?.name, category: s?.category } } : n))
  }, [selectedId, sets])

  const onGenerate = useCallback(async () => {
    await save(toGraph())
    const result = await generate()
    setExportLua(result)
  }, [save, toGraph, generate])

  const fileName = useMemo(() => `${job}.lua`, [job])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(`/characters/${id}`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Back to character
        </button>
        <span className="font-bold">{character?.name ?? '…'} · <span className="text-amber-300">{job}</span> Workflow</span>
        <span className="ml-auto text-[10px] text-gray-500">right-click the canvas to add nodes · autosaves</span>
        <button onClick={onGenerate}
          className="flex items-center gap-1.5 rounded border border-amber-700/40 bg-indigo-900/50 px-3 py-1.5 text-xs text-amber-200">
          <Download className="h-3.5 w-3.5" /> Generate GearSwap file
        </button>
      </div>

      <div className="flex h-[calc(100vh-13rem)] min-h-[460px] overflow-hidden rounded-lg border border-gray-800 bg-[#0d1117]">
        <div className="relative min-w-0 flex-1" onContextMenu={onPaneContextMenu}>
          <ReactFlow
            nodes={nodes} edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => { setSelectedId(null); setPalette(null) }}
            fitView>
            <Background />
            <Controls />
          </ReactFlow>
          {palette && (
            <NodePalette x={palette.x} y={palette.y} onPick={addNode} onClose={() => setPalette(null)} />
          )}
        </div>
        {selected?.type === 'equip' && (
          <EquipInspector
            sets={sets}
            selectedSetId={(selected.data as { gearSetId?: number | null }).gearSetId}
            onChange={assignSet}
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
