// In-event raw Lua textarea (the no-typing exception). Emitted as statement(s) where this node sits in
// the exec flow; chain it before/after an Equip to sequence actions.
export default function LuaInspector({ code, onChange }: {
  code: string | null | undefined
  onChange: (patch: { code: string }) => void
}) {
  return (
    <div className="w-80 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Custom Lua</h4>
      <p className="mb-2 text-[11px] leading-snug text-gray-500">
        Raw Lua run when this step is reached. Wire it from a trigger pin or a Branch outcome; chain an
        Equip after it to do both.
      </p>
      <textarea value={code ?? ''} onChange={e => onChange({ code: e.target.value })}
        rows={8} spellCheck={false}
        placeholder={"send_command('input /echo something happened')"}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-200 placeholder-gray-600 outline-none" />
    </div>
  )
}
