import { type ReactNode } from 'react'

// Shared Tabs primitive. The canonical visual matches what was inlined across
// the character detail page before unification: bottom-border highlight on
// the active tab, muted text on the rest, optional right-aligned toolbar slot
// for inline filter/sort controls (e.g. InventoryTab's category select).
//
// Items accept either a bare string (label == value) or a full TabItem object
// when a count badge or a distinct value is needed.

export interface TabItem<V extends string = string> {
    value: V
    label: string
    badge?: number | string
    disabled?: boolean
}

export interface TabsProps<V extends string = string> {
    items: readonly (V | TabItem<V>)[]
    value: V
    onChange: (value: V) => void
    toolbar?: ReactNode
    className?: string
}

function normalize<V extends string>(item: V | TabItem<V>): TabItem<V> {
    return typeof item === 'string' ? { value: item, label: item } : item
}

export default function Tabs<V extends string>({
    items,
    value,
    onChange,
    toolbar,
    className,
}: TabsProps<V>) {
    const normalized = items.map(normalize<V>)

    return (
        <div className={`flex gap-1 items-end border-b border-gray-700 mb-4 ${className ?? ''}`}>
            {normalized.map(item => {
                const active = item.value === value
                const baseClasses = 'px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2'
                const stateClasses = item.disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : active
                        ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                        : 'text-gray-500 hover:text-gray-300'
                return (
                    <button
                        key={item.value}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => onChange(item.value)}
                        className={`${baseClasses} ${stateClasses}`}
                    >
                        <span>{item.label}</span>
                        {item.badge != null && (
                            <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                                active ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-700 text-gray-300'
                            }`}>
                                {item.badge}
                            </span>
                        )}
                    </button>
                )
            })}
            {toolbar && <div className="ml-auto pb-1">{toolbar}</div>}
        </div>
    )
}
