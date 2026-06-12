import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function GeneratedPasswordReveal({ password }: { password: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">
        Generated Password
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={password}
          className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 font-mono text-sm"
        />
        <button
          onClick={handleCopy}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
          title="Copy password"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-400">
        Save this password — it won't be shown again.
      </p>
    </div>
  )
}
