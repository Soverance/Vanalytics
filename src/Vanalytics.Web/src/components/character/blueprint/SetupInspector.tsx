// Raw-Lua textarea — the documented no-typing exception (reference_blueprint_no_typing): an escape
// hatch whose entire purpose is typing Lua. Emitted at file top, before get_sets().
export default function SetupInspector({ code, onChange }: {
  code: string | null | undefined
  onChange: (patch: { code: string }) => void
}) {
  return (
    <div className="w-80 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Setup (file load)</h4>
      <p className="mb-2 text-[11px] leading-snug text-gray-500">
        Raw Lua emitted once at the top of the file (runs on load). Use for <code>include(...)</code>,
        helper functions, or a macro-book command.
      </p>
      <textarea value={code ?? ''} onChange={e => onChange({ code: e.target.value })}
        rows={10} spellCheck={false}
        placeholder={"include('organizer-lib')\nsend_command('input /macro book 1;wait .1;input /macro set 1')"}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-200 placeholder-gray-600 outline-none" />
    </div>
  )
}
