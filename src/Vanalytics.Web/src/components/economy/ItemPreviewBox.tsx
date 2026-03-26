import type { GameItemDetail } from '../../types/api'
import { itemImageUrl } from '../../utils/imageUrl'

// FFXI job bitmask → abbreviation
const JOB_BITS: [number, string][] = [
  [1 << 1, 'WAR'], [1 << 2, 'MNK'], [1 << 3, 'WHM'], [1 << 4, 'BLM'],
  [1 << 5, 'RDM'], [1 << 6, 'THF'], [1 << 7, 'PLD'], [1 << 8, 'DRK'],
  [1 << 9, 'BST'], [1 << 10, 'BRD'], [1 << 11, 'RNG'], [1 << 12, 'SAM'],
  [1 << 13, 'NIN'], [1 << 14, 'DRG'], [1 << 15, 'SMN'], [1 << 16, 'BLU'],
  [1 << 17, 'COR'], [1 << 18, 'PUP'], [1 << 19, 'DNC'], [1 << 20, 'SCH'],
  [1 << 21, 'GEO'], [1 << 22, 'RUN'],
]

const RACE_BITS: [number, string][] = [
  [1 << 1, 'Hume ♂'], [1 << 2, 'Hume ♀'], [1 << 3, 'Elvaan ♂'], [1 << 4, 'Elvaan ♀'],
  [1 << 5, 'Tarutaru ♂'], [1 << 6, 'Tarutaru ♀'], [1 << 7, 'Mithra'], [1 << 8, 'Galka'],
]

const WEAPON_SKILLS: Record<number, string> = {
  1: 'Hand-to-Hand', 2: 'Dagger', 3: 'Sword', 4: 'Great Sword',
  5: 'Axe', 6: 'Great Axe', 7: 'Scythe', 8: 'Polearm',
  9: 'Katana', 10: 'Great Katana', 11: 'Club', 12: 'Staff',
  25: 'Archery', 26: 'Marksmanship',
}

const ALL_JOBS_MASK = JOB_BITS.reduce((acc, [bit]) => acc | bit, 0)
const ALL_RACES_MASK = RACE_BITS.reduce((acc, [bit]) => acc | bit, 0)

function decodeJobs(bitmask: number | null): string {
  if (!bitmask) return ''
  if ((bitmask & ALL_JOBS_MASK) === ALL_JOBS_MASK) return 'All Jobs'
  return JOB_BITS.filter(([bit]) => (bitmask & bit) !== 0).map(([, n]) => n).join('/')
}

function decodeRaces(bitmask: number | null): string {
  if (!bitmask) return ''
  if ((bitmask & ALL_RACES_MASK) === ALL_RACES_MASK) return 'All Races'
  return RACE_BITS.filter(([bit]) => (bitmask & bit) !== 0).map(([, n]) => n).join(' ')
}

export default function ItemPreviewBox({ item }: { item: GameItemDetail }) {
  const jobs = decodeJobs(item.jobs)
  const races = decodeRaces(item.races)
  const weaponType = item.skill ? WEAPON_SKILLS[item.skill] : null
  const typeLabel = weaponType ? `(${weaponType})` : item.category ? `(${item.category})` : ''

  // Use the actual item description from the database — this is the in-game text
  // and is the source of truth. Newlines in the description separate lines.
  const descLines = item.description
    ? item.description.split('\n').filter(line => line.trim() !== '')
    : []

  const lvJobs = [
    item.level != null && item.level > 0 ? `Lv.${item.level}` : null,
    jobs || null,
  ].filter(Boolean).join(' ')

  return (
    <div
      className="select-none"
      style={{
        width: 366,
        minHeight: 56,
        borderTop: '3px solid #9090A0',
        borderBottom: '3px solid #A0A0B0',
        // FFXI scanline gradient — alternating dark blue stripes at 4px intervals
        backgroundImage: 'linear-gradient(rgba(48,48,88,0.9) 50%, rgba(32,24,72,0.9) 50%)',
        backgroundSize: '366px 4px',
        color: '#F0F0F0',
        position: 'relative',
      }}
    >
      {/* Icon — floated left */}
      <div
        style={{
          width: 32,
          height: 32,
          float: 'left',
          marginTop: 9,
          marginLeft: 8,
        }}
      >
        {item.iconPath ? (
          <img
            src={itemImageUrl(item.iconPath)}
            alt=""
            width={32}
            height={32}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
        ) : (
          <div style={{ width: 32, height: 32, background: 'rgba(0,0,0,0.3)' }} />
        )}
      </div>

      {/* Rare/Ex tag icons — floated right, side by side */}
      <div style={{ float: 'right', marginTop: 0, marginRight: 5, display: 'flex', flexDirection: 'row' }}>
        {item.isRare && (
          <img src="/img/item_rare.png" alt="Rare" title="Rare" style={{ imageRendering: 'pixelated', display: 'block' }} />
        )}
        {item.isExclusive && (
          <img src="/img/item_exclusive.png" alt="Exclusive" title="Exclusive" style={{ imageRendering: 'pixelated', display: 'block' }} />
        )}
      </div>

      {/* Item info — centered block */}
      <div
        style={{
          width: 310,
          margin: '0 48px',
          fontFamily: 'Verdana, Helvetica, sans-serif',
          fontSize: 13,
          letterSpacing: '0.1em',
          lineHeight: '16px',
          fontWeight: 'normal',
          paddingTop: 4,
          paddingBottom: 6,
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {/* Title */}
        <div style={{ color: '#F0F0F0' }}>{item.name}</div>

        {/* Type + Race */}
        {(typeLabel || races) && (
          <div style={{ color: '#E0E0E0' }}>
            {typeLabel}{races}
          </div>
        )}

        {/* Stats / Description */}
        {descLines.length > 0 && (
          <div style={{ color: '#E0E0E0', marginTop: 2 }}>
            {descLines.map((line, i) => (
              <span key={i}>
                {line}
                {i < descLines.length - 1 && <br />}
              </span>
            ))}
          </div>
        )}

        {/* Level + Jobs */}
        {lvJobs && (
          <div style={{ color: '#E0E0E0', marginTop: 2 }}>{lvJobs}</div>
        )}
      </div>

      {/* Clear floats */}
      <div style={{ clear: 'both' }} />

      {/* Item Level — bottom right, matching in-game appearance */}
      {item.itemLevel != null && (
        <div style={{
          textAlign: 'right',
          padding: '2px 8px 4px',
          fontFamily: 'Verdana, Helvetica, sans-serif',
          fontSize: 11,
          letterSpacing: '0.1em',
          color: '#c0c0d0',
        }}>
          &lt;Item Level: {item.itemLevel}&gt;
        </div>
      )}
    </div>
  )
}
