import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { GameItemDetail } from '../types/api'
import ItemStatsTable from '../components/economy/ItemStatsTable'
import { itemImageUrl } from '../utils/imageUrl'
import { useCompare } from '../components/compare/CompareContext'
import ItemPreviewBox from '../components/economy/ItemPreviewBox'
import ItemModelViewer from '../components/character/ItemModelViewer'
import ItemOwners from '../components/economy/ItemOwners'

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<GameItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const { addItem, removeItem, isSelected, isFull } = useCompare()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/items/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-400">Loading item...</p>
  if (!item) return <p className="text-red-400">Item not found.</p>

  return (
    <div>
      <Link to="/items" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Item Database
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0">
            {item.iconPath ? (
              <img src={itemImageUrl(item.iconPath)} alt="" className="h-12 w-12" />
            ) : (
              <div className="h-12 w-12 rounded bg-gray-800" />
            )}
          </div>
          <div className="min-w-0">
          <h1 className="text-2xl font-bold">{item.name}</h1>
          {item.nameJa && <p className="text-sm text-gray-500">{item.nameJa}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{item.category}</span>
            {item.level && <span className="text-xs text-gray-500">Lv.{item.level}</span>}
            {item.itemLevel != null && <span className="text-xs text-blue-400">iLv.{item.itemLevel}</span>}
            {item.isRare && <span className="text-xs text-amber-500">Rare</span>}
            {item.isExclusive && <span className="text-xs text-red-400">Ex</span>}
            {!item.isNoAuction && <span className="text-xs text-green-400">AH</span>}
            <span className="text-xs text-gray-600">Stack: {item.stackSize}</span>
          </div>
          {/* Compare button and info links */}
          <div className="flex items-center gap-3 mt-2">
            {item && (
              isSelected(item.itemId) ? (
                <button
                  onClick={() => removeItem(item.itemId)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                >
                  Remove from Compare
                </button>
              ) : (
                <button
                  onClick={() => addItem({
                    itemId: item.itemId, name: item.name, category: item.category,
                    level: item.level, itemLevel: item.itemLevel, skill: item.skill, stackSize: item.stackSize,
                    iconPath: item.iconPath, isRare: item.isRare, isExclusive: item.isExclusive,
                    isNoAuction: item.isNoAuction,
                    damage: item.damage, delay: item.delay, def: item.def,
                    hp: item.hp, mp: item.mp,
                    str: item.str, dex: item.dex, vit: item.vit, agi: item.agi,
                    int: item.int, mnd: item.mnd, chr: item.chr,
                    accuracy: item.accuracy, attack: item.attack,
                    rangedAccuracy: item.rangedAccuracy, rangedAttack: item.rangedAttack,
                    magicAccuracy: item.magicAccuracy, magicDamage: item.magicDamage,
                    magicEvasion: item.magicEvasion, evasion: item.evasion,
                    enmity: item.enmity, haste: item.haste,
                    storeTP: item.storeTP, tpBonus: item.tpBonus,
                    physicalDamageTaken: item.physicalDamageTaken, magicDamageTaken: item.magicDamageTaken,
                    baseSell: item.baseSell,
                  })}
                  disabled={isFull}
                  className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add to Compare
                </button>
              )
            )}
            <span className="text-gray-600">|</span>
            <span className="text-xs text-gray-500">Info:</span>
            <a
              href={`https://www.bg-wiki.com/ffxi/${encodeURIComponent(item.name.replace(/ /g, '_'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              [BG Wiki]
            </a>
            <a
              href={`https://www.ffxiah.com/item/${item.itemId}/${encodeURIComponent(item.name.toLowerCase().replace(/ /g, '-'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              [FFXIAH]
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              {copied ? '✓ Copied!' : '[Copy Link]'}
            </button>
          </div>
          </div>
        </div>

        {/* In-game style item preview */}
        <div className="shrink-0 hidden lg:block">
          <ItemPreviewBox item={item} />
        </div>
      </div>

      {/* 3D Model Viewer — only renders if item has a model mapping */}
      <ItemModelViewer
        itemId={item.itemId}
        category={item.category}
        slots={item.slots}
        skill={item.skill}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: Stats */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Item Stats</h2>
            <ItemStatsTable item={item} />
          </div>
        </div>

        {/* Right column: Economy + Who's using this? */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Economy</h2>
            {item.baseSell && item.baseSell > 0 ? (
              <p className="text-sm text-gray-200">
                NPC Sell Price: <span className="text-yellow-400 font-medium">{item.baseSell.toLocaleString()} gil</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">This item cannot be sold to NPCs.</p>
            )}
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <ItemOwners itemId={item.itemId} />
          </div>
        </div>
      </div>
    </div>
  )
}
