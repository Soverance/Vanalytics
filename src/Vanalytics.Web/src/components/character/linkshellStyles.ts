// Shared recruitment-status badge palette for linkshell surfaces (public
// profile header + directory). One source of truth for the Open/Closed/Unknown
// colors.
export const RECRUIT_STYLE: Record<string, string> = {
  Open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  Closed: 'bg-gray-700/40 text-gray-400 border-gray-600/50',
  Unknown: 'bg-gray-800/40 text-gray-500 border-gray-600/50',
}
