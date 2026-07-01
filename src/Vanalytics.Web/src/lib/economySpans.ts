// Span filter options for the AH sales UI. `value` is the `days` query param;
// 0 means all-time. Kept UI-free so the option set + labels are unit-tested.
export interface SpanOption {
  value: number
  label: string
}

export const SPAN_OPTIONS: SpanOption[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
  { value: 0, label: 'All' },
]

// Heading-friendly label: all-time reads "All Time"; known spans use their short
// label; anything else falls back to `${days}d`.
export function spanLabel(days: number): string {
  if (days <= 0) return 'All Time'
  const o = SPAN_OPTIONS.find(x => x.value === days)
  return o ? o.label : `${days}d`
}
