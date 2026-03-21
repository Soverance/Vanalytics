// src/Vanalytics.Web/src/components/economy/ItemSearchBar.tsx
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function ItemSearchBar({ value, onChange }: Props) {
  const [input, setInput] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input !== value) onChange(input)
    }, 300)
    return () => clearTimeout(timer)
  }, [input, value, onChange])

  useEffect(() => { setInput(value) }, [value])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search items..."
        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
