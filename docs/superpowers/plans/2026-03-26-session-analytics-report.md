# Session Analytics Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the session detail modal with a dedicated full-page analytics report featuring three tabs: narrative overview, combat optimization, and farming progress with cross-session trends.

**Architecture:** Backend extends the existing SessionsController with new computed fields (accuracy, crit rate, parry rate, limit points) and a new trends endpoint. Frontend adds a routed page with three tab components that fetch data and compute derived metrics via useMemo. The Lua parser emits CriticalHit as a distinct event type.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, recharts, ASP.NET Core / EF Core, Lua (Windower addon)

---

### Task 1: Add CriticalHit Event Type to Parser and API

**Files:**
- Modify: `addon/vanalytics/session.lua:142-147`
- Modify: `src/Vanalytics.Core/Enums/SessionEventType.cs`
- Modify: `src/Vanalytics.Api/Controllers/SessionsController.cs:18-26`

- [ ] **Step 1: Change critical hit pattern to emit CriticalHit**

In `addon/vanalytics/session.lua`, change line 146 from `t='MeleeDamage'` to `t='CriticalHit'`:

```lua
    -- Critical hit damage: "Player scores a critical hit! Target takes N points of damage."
    -- BEL after "!" becomes space, so there may be leading space on target — trim it.
    source, target, dmg = line:match("(.+) scores a critical hit!%s*(.+) takes (%d+) points of damage%.")
    if source then
        return {t='CriticalHit', s=source, tg=target, v=tonumber(dmg)}
    end
```

- [ ] **Step 2: Add CriticalHit to SessionEventType enum**

In `src/Vanalytics.Core/Enums/SessionEventType.cs`, add `CriticalHit` after `Parry`:

```csharp
    Miss,
    Parry,
    CriticalHit
}
```

- [ ] **Step 3: Add CriticalHit to DamageTypes array**

In `src/Vanalytics.Api/Controllers/SessionsController.cs`, update the `DamageTypes` array (line 18):

```csharp
    private static readonly SessionEventType[] DamageTypes =
    [
        SessionEventType.MeleeDamage,
        SessionEventType.RangedDamage,
        SessionEventType.SpellDamage,
        SessionEventType.AbilityDamage,
        SessionEventType.Skillchain,
        SessionEventType.MagicBurst,
        SessionEventType.CriticalHit
    ];
```

- [ ] **Step 4: Commit**

```bash
git add addon/vanalytics/session.lua src/Vanalytics.Core/Enums/SessionEventType.cs src/Vanalytics.Api/Controllers/SessionsController.cs
git commit -m "feat: add CriticalHit event type to parser and API"
```

---

### Task 2: Extend Session Detail API Response

**Files:**
- Modify: `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs:21-28`
- Modify: `src/Vanalytics.Api/Controllers/SessionsController.cs:89-168`

- [ ] **Step 1: Add new fields to SessionDetailResponse**

In `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs`, extend `SessionDetailResponse`:

```csharp
public class SessionDetailResponse : SessionSummaryResponse
{
    public double DpsAverage { get; set; }
    public double GilPerHour { get; set; }
    public long ExpGained { get; set; }
    public long HealingDone { get; set; }
    public int EventCount { get; set; }
    public long LimitPointsGained { get; set; }
    public double Accuracy { get; set; }
    public double CritRate { get; set; }
    public double ParryRate { get; set; }
}
```

- [ ] **Step 2: Compute new fields in the Get endpoint**

In `src/Vanalytics.Api/Controllers/SessionsController.cs`, add the new computations after the existing aggregations (after line 137) and include them in the response:

```csharp
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();

        var session = await _db.Sessions
            .Where(s => s.Id == id && s.Character.UserId == userId)
            .Select(s => new
            {
                s.Id,
                s.CharacterId,
                CharacterName = s.Character.Name,
                Server = s.Character.Server,
                s.Zone,
                s.StartedAt,
                s.EndedAt,
                s.Status
            })
            .FirstOrDefaultAsync();

        if (session is null) return NotFound();

        var eventsQuery = _db.SessionEvents.Where(e => e.SessionId == id);

        var totalDamage = await eventsQuery
            .Where(e => DamageTypes.Contains(e.EventType))
            .SumAsync(e => e.Value);

        var gilEarned = await eventsQuery
            .Where(e => e.EventType == SessionEventType.GilGain)
            .SumAsync(e => e.Value);

        var mobsKilled = await eventsQuery
            .Where(e => e.EventType == SessionEventType.MobKill)
            .CountAsync();

        var itemsDropped = await eventsQuery
            .Where(e => e.EventType == SessionEventType.ItemDrop)
            .CountAsync();

        var expGained = await eventsQuery
            .Where(e => e.EventType == SessionEventType.ExpGain)
            .SumAsync(e => e.Value);

        var healingDone = await eventsQuery
            .Where(e => e.EventType == SessionEventType.Healing)
            .SumAsync(e => e.Value);

        var eventCount = await eventsQuery.CountAsync();

        var limitPointsGained = await eventsQuery
            .Where(e => e.EventType == SessionEventType.LimitGain)
            .SumAsync(e => e.Value);

        var meleeHits = await eventsQuery
            .Where(e => e.EventType == SessionEventType.MeleeDamage)
            .CountAsync();

        var criticalHits = await eventsQuery
            .Where(e => e.EventType == SessionEventType.CriticalHit)
            .CountAsync();

        var misses = await eventsQuery
            .Where(e => e.EventType == SessionEventType.Miss)
            .CountAsync();

        var parries = await eventsQuery
            .Where(e => e.EventType == SessionEventType.Parry)
            .CountAsync();

        var damageReceivedCount = await eventsQuery
            .Where(e => e.EventType == SessionEventType.DamageReceived ||
                        (new[] { SessionEventType.MeleeDamage, SessionEventType.CriticalHit, SessionEventType.RangedDamage, SessionEventType.SpellDamage, SessionEventType.AbilityDamage }
                            .Contains(e.EventType) && e.Target != string.Empty))
            .CountAsync();

        var totalSwings = meleeHits + criticalHits + misses;
        var accuracy = totalSwings > 0 ? (double)(meleeHits + criticalHits) / totalSwings : 0;
        var critRate = (meleeHits + criticalHits) > 0 ? (double)criticalHits / (meleeHits + criticalHits) : 0;
        var parryRate = (parries + damageReceivedCount) > 0 ? (double)parries / (parries + damageReceivedCount) : 0;

        var durationSeconds = session.EndedAt.HasValue
            ? (session.EndedAt.Value - session.StartedAt).TotalSeconds
            : 0;

        var dpsAverage = durationSeconds > 0 ? totalDamage / durationSeconds : 0;

        var durationHours = durationSeconds / 3600.0;
        var gilPerHour = durationHours > 0 ? gilEarned / durationHours : 0;

        return Ok(new SessionDetailResponse
        {
            Id = session.Id,
            CharacterId = session.CharacterId,
            CharacterName = session.CharacterName,
            Server = session.Server,
            Zone = session.Zone,
            StartedAt = session.StartedAt,
            EndedAt = session.EndedAt,
            Status = session.Status,
            TotalDamage = totalDamage,
            GilEarned = gilEarned,
            MobsKilled = mobsKilled,
            ItemsDropped = itemsDropped,
            DpsAverage = dpsAverage,
            GilPerHour = gilPerHour,
            ExpGained = expGained,
            HealingDone = healingDone,
            EventCount = eventCount,
            LimitPointsGained = limitPointsGained,
            Accuracy = accuracy,
            CritRate = critRate,
            ParryRate = parryRate
        });
    }
```

Note: the `parryRate` computation here is simplified — it uses `Parry` events vs incoming damage events where Source is a mob. A more precise version would filter incoming damage by checking `Source != playerName`, but since we don't store player name on the session, this approximation using DamageReceived events is acceptable for now.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Core/DTOs/Session/SessionResponse.cs src/Vanalytics.Api/Controllers/SessionsController.cs
git commit -m "feat: extend session detail response with accuracy, crit rate, parry rate, LP"
```

---

### Task 3: Add Trends API Endpoint

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/SessionsController.cs`
- Modify: `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs`

- [ ] **Step 1: Add SessionTrendEntry DTO**

In `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs`, add after `SessionTimelineEntry`:

```csharp
public class SessionTrendEntry
{
    public Guid SessionId { get; set; }
    public DateTimeOffset Date { get; set; }
    public double DurationMinutes { get; set; }
    public double GilPerHour { get; set; }
    public double KillsPerHour { get; set; }
    public double DropsPerHour { get; set; }
    public long TotalDamage { get; set; }
    public int MobsKilled { get; set; }
    public int ItemsDropped { get; set; }
    public long LimitPoints { get; set; }
}
```

- [ ] **Step 2: Add the Trends endpoint to SessionsController**

In `src/Vanalytics.Api/Controllers/SessionsController.cs`, add before the `Delete` method (before line 258):

```csharp
    [HttpGet("trends")]
    public async Task<IActionResult> Trends(
        [FromQuery] Guid characterId,
        [FromQuery] string zone)
    {
        var userId = GetUserId();

        // Verify character ownership
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var sessions = await _db.Sessions
            .Where(s => s.CharacterId == characterId
                        && s.Zone == zone
                        && s.Status == SessionStatus.Completed
                        && s.EndedAt.HasValue)
            .OrderBy(s => s.StartedAt)
            .Select(s => new
            {
                s.Id,
                s.StartedAt,
                s.EndedAt,
                GilEarned = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.GilGain)
                    .Sum(e => e.Value),
                MobsKilled = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.MobKill)
                    .Count(),
                ItemsDropped = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.ItemDrop)
                    .Count(),
                TotalDamage = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && DamageTypes.Contains(e.EventType))
                    .Sum(e => e.Value),
                LimitPoints = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.LimitGain)
                    .Sum(e => e.Value)
            })
            .ToListAsync();

        var trends = sessions.Select(s =>
        {
            var durationMinutes = (s.EndedAt!.Value - s.StartedAt).TotalMinutes;
            var durationHours = durationMinutes / 60.0;

            return new SessionTrendEntry
            {
                SessionId = s.Id,
                Date = s.StartedAt,
                DurationMinutes = durationMinutes,
                GilPerHour = durationHours > 0 ? s.GilEarned / durationHours : 0,
                KillsPerHour = durationHours > 0 ? s.MobsKilled / durationHours : 0,
                DropsPerHour = durationHours > 0 ? s.ItemsDropped / durationHours : 0,
                TotalDamage = s.TotalDamage,
                MobsKilled = s.MobsKilled,
                ItemsDropped = s.ItemsDropped,
                LimitPoints = s.LimitPoints
            };
        }).ToList();

        return Ok(trends);
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Api/Controllers/SessionsController.cs src/Vanalytics.Core/DTOs/Session/SessionResponse.cs
git commit -m "feat: add cross-session trends endpoint"
```

---

### Task 4: Update Frontend Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Extend SessionDetail and add new types**

In `src/Vanalytics.Web/src/types/api.ts`, update the session types (around line 515):

Replace the existing `SessionDetail` interface:

```typescript
export interface SessionDetail extends SessionSummary {
  dpsAverage: number
  gilPerHour: number
  expGained: number
  healingDone: number
  eventCount: number
  limitPointsGained: number
  accuracy: number
  critRate: number
  parryRate: number
}
```

Add the new trend type after `SessionEventsResponse`:

```typescript
export interface SessionTrendEntry {
  sessionId: string
  date: string
  durationMinutes: number
  gilPerHour: number
  killsPerHour: number
  dropsPerHour: number
  totalDamage: number
  mobsKilled: number
  itemsDropped: number
  limitPoints: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/types/api.ts
git commit -m "feat: add session detail extended fields and trend types"
```

---

### Task 5: Add Route and SessionReportPage Shell

**Files:**
- Create: `src/Vanalytics.Web/src/pages/SessionReportPage.tsx`
- Modify: `src/Vanalytics.Web/src/App.tsx`

- [ ] **Step 1: Create SessionReportPage with data fetching and tab shell**

Create `src/Vanalytics.Web/src/pages/SessionReportPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { SessionDetail, SessionEvent, SessionTimelineEntry, SessionEventsResponse } from '../types/api'
import OverviewTab from '../components/session/OverviewTab'
import CombatTab from '../components/session/CombatTab'
import FarmingTab from '../components/session/FarmingTab'

const TABS = ['Overview', 'Combat', 'Farming'] as const
type Tab = typeof TABS[number]

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Active'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    Completed: 'bg-green-900 text-green-300',
    Active: 'bg-blue-900 text-blue-300',
    Abandoned: 'bg-amber-900 text-amber-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  )
}

export default function SessionReportPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [timeline, setTimeline] = useState<SessionTimelineEntry[]>([])
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    Promise.all([
      api<SessionDetail>(`/api/sessions/${id}`),
      api<SessionTimelineEntry[]>(`/api/sessions/${id}/timeline`),
      // Fetch all events (paginate through them)
      fetchAllEvents(id),
    ])
      .then(([detail, tl, evts]) => {
        setSession(detail)
        setTimeline(tl)
        setEvents(evts)
      })
      .catch(() => navigate('/characters'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading || !session) {
    return <p className="text-gray-400 p-8">Loading session report...</p>
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 flex items-center gap-1">
        <button
          onClick={() => navigate(`/characters/${session.characterId}?tab=Sessions`)}
          className="text-blue-400 hover:underline"
        >
          {session.characterName}
        </button>
        <span>/</span>
        <span className="text-gray-500">Sessions</span>
        <span>/</span>
        <span className="text-gray-300">{session.zone} — {new Date(session.startedAt).toLocaleDateString()}</span>
      </nav>

      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
        <span>{new Date(session.startedAt).toLocaleString()} – {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'ongoing'}</span>
        <span>{formatDuration(session.startedAt, session.endedAt)}</span>
        {statusBadge(session.status)}
      </div>

      {/* Compact stat row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total Damage', value: session.totalDamage.toLocaleString() },
          { label: 'DPS Avg', value: Math.round(session.dpsAverage).toLocaleString() },
          { label: 'Mobs Killed', value: session.mobsKilled.toLocaleString() },
          { label: 'Gil Earned', value: session.gilEarned.toLocaleString() },
          { label: 'Items Dropped', value: session.itemsDropped.toLocaleString() },
          { label: 'Healing Done', value: session.healingDone.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <div className="text-xs text-gray-500 uppercase">{s.label}</div>
            <div className="text-lg text-gray-100 font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <OverviewTab session={session} timeline={timeline} events={events} />
      )}
      {tab === 'Combat' && (
        <CombatTab session={session} events={events} />
      )}
      {tab === 'Farming' && (
        <FarmingTab session={session} events={events} />
      )}
    </div>
  )
}

async function fetchAllEvents(sessionId: string): Promise<SessionEvent[]> {
  const all: SessionEvent[] = []
  let page = 1
  const pageSize = 500
  while (true) {
    const resp = await api<SessionEventsResponse>(
      `/api/sessions/${sessionId}/events?page=${page}&pageSize=${pageSize}`
    )
    all.push(...resp.events)
    if (all.length >= resp.totalCount) break
    page++
  }
  return all
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/Vanalytics.Web/src/App.tsx`, add the import at line 22 (after ModelDebugPage):

```tsx
import SessionReportPage from './pages/SessionReportPage'
```

Add the route after the zones route (after line 120):

```tsx
            <Route path="/sessions/:id" element={<ProtectedRoute><SessionReportPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/SessionReportPage.tsx src/Vanalytics.Web/src/App.tsx
git commit -m "feat: add SessionReportPage with route and data fetching"
```

---

### Task 6: Wire Up SessionsTab Navigation and Remove Modal

**Files:**
- Modify: `src/Vanalytics.Web/src/components/session/SessionsTab.tsx`
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`
- Delete: `src/Vanalytics.Web/src/components/session/SessionDetailModal.tsx`

- [ ] **Step 1: Update SessionsTab to navigate instead of callback**

Replace the full contents of `src/Vanalytics.Web/src/components/session/SessionsTab.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionSummary, SessionListResponse } from '../../types/api'
import { api } from '../../api/client'

interface SessionsTabProps {
  characterId: string
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Active'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

export default function SessionsTab({ characterId }: SessionsTabProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setLoading(true)
    api<SessionListResponse>(`/api/sessions?page=${page}&pageSize=${pageSize}&characterId=${characterId}`)
      .then((data) => {
        setSessions(data.sessions)
        setTotalCount(data.totalCount)
      })
      .catch(() => {
        setSessions([])
        setTotalCount(0)
      })
      .finally(() => setLoading(false))
  }, [page, characterId])

  if (loading) return <p className="text-gray-400">Loading...</p>

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400 mb-2">No sessions yet.</p>
        <p className="text-sm text-gray-500">
          Start tracking with <code className="bg-gray-800 px-1 rounded text-gray-300">//va session start</code> in-game.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Total Damage</th>
              <th className="px-4 py-3 text-right">Gil Earned</th>
              <th className="px-4 py-3 text-right">Drops</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.map((s) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="bg-gray-900 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {new Date(s.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{s.zone}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.endedAt === null ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    formatDuration(s.startedAt, s.endedAt)
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.totalDamage.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.gilEarned.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.itemsDropped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Previous
        </button>
        <span className="text-sm text-gray-400">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Next
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Remove modal from CharacterDetailPage**

In `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`:

Remove the import on line 20:
```tsx
import SessionDetailModal from '../components/session/SessionDetailModal'
```

Remove the `selectedSessionId` and `sessionsRefreshKey` state declarations (search for them in the file).

Update the SessionsTab usage (line 381-387) to remove the callback props:
```tsx
        {gearTab === 'Sessions' && (
          <SessionsTab characterId={character.id} />
        )}
```

Remove the SessionDetailModal render block (lines 412-418):
```tsx
      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          onDeleted={() => setSessionsRefreshKey(k => k + 1)}
        />
      )}
```

Also add `?tab=Sessions` query param reading at the top of the component so returning from the report page restores the correct tab. After the existing `useParams`, add:

```tsx
  const [searchParams] = useSearchParams()
  const initialGearTab = (searchParams.get('tab') as GearTab) || 'Equipment'
```

And update the `gearTab` state initialization to use it:
```tsx
  const [gearTab, setGearTab] = useState<GearTab>(initialGearTab)
```

Add the import for `useSearchParams`:
```tsx
import { useParams, Link, useSearchParams } from 'react-router-dom'
```

- [ ] **Step 3: Delete SessionDetailModal**

Delete the file `src/Vanalytics.Web/src/components/session/SessionDetailModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/SessionsTab.tsx src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
git rm src/Vanalytics.Web/src/components/session/SessionDetailModal.tsx
git commit -m "feat: wire SessionsTab to navigate, remove modal"
```

---

### Task 7: Overview Tab — Narrative Timeline and Event Feed

**Files:**
- Create: `src/Vanalytics.Web/src/components/session/OverviewTab.tsx`

- [ ] **Step 1: Create OverviewTab component**

Create `src/Vanalytics.Web/src/components/session/OverviewTab.tsx`:

```tsx
import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip
} from 'recharts'
import type { SessionDetail, SessionEvent, SessionTimelineEntry } from '../../types/api'

interface OverviewTabProps {
  session: SessionDetail
  timeline: SessionTimelineEntry[]
  events: SessionEvent[]
}

const NOTABLE_TYPES = new Set([
  'MobKill', 'AbilityDamage', 'CriticalHit', 'SpellDamage',
  'ItemDrop', 'ItemLost', 'GilGain', 'GilLoss', 'Healing',
  'ExpGain', 'LimitGain', 'CapacityGain', 'TreasureHunter',
])

const EVENT_COLORS: Record<string, string> = {
  MobKill: 'text-red-400',
  AbilityDamage: 'text-orange-400',
  CriticalHit: 'text-yellow-400',
  SpellDamage: 'text-purple-400',
  ItemDrop: 'text-emerald-400',
  ItemLost: 'text-amber-500',
  GilGain: 'text-yellow-300',
  GilLoss: 'text-red-300',
  Healing: 'text-green-400',
  ExpGain: 'text-blue-300',
  LimitGain: 'text-blue-300',
  CapacityGain: 'text-blue-300',
  TreasureHunter: 'text-amber-400',
}

function formatTime(timestamp: string, sessionStart: string): string {
  const ms = new Date(timestamp).getTime() - new Date(sessionStart).getTime()
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatEventLine(e: SessionEvent): string {
  switch (e.eventType) {
    case 'MobKill': return `Defeated ${e.target}`
    case 'AbilityDamage': return `${e.ability} → ${e.value.toLocaleString()} on ${e.target}`
    case 'CriticalHit': return `Critical hit → ${e.value.toLocaleString()} on ${e.target}`
    case 'SpellDamage': return `${e.ability} → ${e.value.toLocaleString()} on ${e.target}`
    case 'ItemDrop': return `Obtained ${e.target}${e.value > 1 ? ` x${e.value}` : ''}`
    case 'ItemLost': return `Lost ${e.target} (inventory full)`
    case 'GilGain': return `+${e.value.toLocaleString()} gil`
    case 'GilLoss': return `-${e.value.toLocaleString()} gil`
    case 'Healing': return `${e.ability || 'Heal'} → ${e.value.toLocaleString()} HP on ${e.target}`
    case 'LimitGain': return `+${e.value.toLocaleString()} limit points`
    case 'ExpGain': return `+${e.value.toLocaleString()} experience`
    case 'CapacityGain': return `+${e.value.toLocaleString()} capacity points`
    case 'TreasureHunter': return `TH${e.value} on ${e.target}`
    default: return `${e.eventType}: ${e.value}`
  }
}

export default function OverviewTab({ session, timeline, events }: OverviewTabProps) {
  const chartData = useMemo(() => {
    return timeline.map((t) => {
      const minuteOffset = Math.round(
        (new Date(t.timestamp).getTime() - new Date(session.startedAt).getTime()) / 60000
      )
      return {
        minute: minuteOffset,
        damage: t.damage,
        healing: t.healing,
        kills: t.kills,
      }
    })
  }, [timeline, session.startedAt])

  // Event markers for scatter overlay: WS hits and kills
  const wsMarkers = useMemo(() => {
    return events
      .filter((e) => e.eventType === 'AbilityDamage')
      .map((e) => {
        const minute = Math.round(
          (new Date(e.timestamp).getTime() - new Date(session.startedAt).getTime()) / 60000
        )
        return { minute, damage: e.value, ability: e.ability }
      })
  }, [events, session.startedAt])

  const notableEvents = useMemo(() => {
    return events.filter((e) => NOTABLE_TYPES.has(e.eventType))
  }, [events])

  return (
    <div className="space-y-6">
      {/* Narrative Timeline Chart */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Session Timeline</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="minute"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={(v) => `${v}m`}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={(v) => `${v} min`}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Area
              type="monotone"
              dataKey="damage"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.15}
              name="Damage"
            />
            <Area
              type="monotone"
              dataKey="healing"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.1}
              name="Healing"
            />
            <Scatter
              data={wsMarkers}
              dataKey="damage"
              fill="#f59e0b"
              name="Weapon Skills"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Event Feed */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">
          Session Highlights ({notableEvents.length})
        </h3>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {notableEvents.map((e) => (
            <div key={e.id} className="flex items-baseline gap-3 text-sm py-1 border-b border-gray-800/50">
              <span className="text-gray-600 text-xs font-mono w-12 shrink-0">
                {formatTime(e.timestamp, session.startedAt)}
              </span>
              <span className={`${EVENT_COLORS[e.eventType] || 'text-gray-400'}`}>
                {formatEventLine(e)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/OverviewTab.tsx
git commit -m "feat: add Overview tab with narrative timeline and event feed"
```

---

### Task 8: Combat Tab — Optimization Analysis

**Files:**
- Create: `src/Vanalytics.Web/src/components/session/CombatTab.tsx`

- [ ] **Step 1: Create CombatTab component**

Create `src/Vanalytics.Web/src/components/session/CombatTab.tsx`:

```tsx
import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { SessionDetail, SessionEvent } from '../../types/api'

interface CombatTabProps {
  session: SessionDetail
  events: SessionEvent[]
}

const DAMAGE_TYPES = ['MeleeDamage', 'CriticalHit', 'AbilityDamage', 'SpellDamage', 'RangedDamage', 'MagicBurst', 'Skillchain']
const DAMAGE_COLORS: Record<string, string> = {
  MeleeDamage: '#6b7280',
  CriticalHit: '#eab308',
  AbilityDamage: '#f97316',
  SpellDamage: '#a855f7',
  RangedDamage: '#06b6d4',
  MagicBurst: '#ec4899',
  Skillchain: '#14b8a6',
}

interface AbilityRow {
  ability: string
  count: number
  totalDamage: number
  avgDamage: number
  pctOfTotal: number
}

interface MobRow {
  mob: string
  kills: number
  accuracy: number
  critRate: number
  parryRate: number
  damageDealt: number
  damageTaken: number
  drops: number
}

export default function CombatTab({ session, events }: CombatTabProps) {
  // Session-level summary cards use the pre-computed values from the API
  const summaryCards = [
    { label: 'Accuracy', value: `${(session.accuracy * 100).toFixed(1)}%` },
    { label: 'Crit Rate', value: `${(session.critRate * 100).toFixed(1)}%` },
    { label: 'Parry Rate', value: `${(session.parryRate * 100).toFixed(1)}%` },
    { label: 'Avg TTK', value: session.mobsKilled > 0
        ? `${Math.round((session.endedAt
            ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
            : 0) / session.mobsKilled)}s`
        : 'N/A'
    },
    { label: 'WS Damage', value: events
        .filter(e => e.eventType === 'AbilityDamage')
        .reduce((sum, e) => sum + e.value, 0)
        .toLocaleString()
    },
    { label: 'WS % of Total', value: session.totalDamage > 0
        ? `${((events
            .filter(e => e.eventType === 'AbilityDamage')
            .reduce((sum, e) => sum + e.value, 0) / session.totalDamage) * 100).toFixed(1)}%`
        : '0%'
    },
  ]

  // Damage by type for bar chart
  const damageByType = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of events) {
      if (DAMAGE_TYPES.includes(e.eventType)) {
        totals[e.eventType] = (totals[e.eventType] || 0) + e.value
      }
    }
    return DAMAGE_TYPES
      .filter(t => totals[t] > 0)
      .map(t => ({ type: t, damage: totals[t] }))
      .sort((a, b) => b.damage - a.damage)
  }, [events])

  // Top abilities table
  const topAbilities = useMemo((): AbilityRow[] => {
    const byAbility: Record<string, { count: number; total: number }> = {}
    const totalDmg = events
      .filter(e => DAMAGE_TYPES.includes(e.eventType))
      .reduce((s, e) => s + e.value, 0)

    for (const e of events) {
      if (e.eventType === 'AbilityDamage' && e.ability) {
        const entry = byAbility[e.ability] || { count: 0, total: 0 }
        entry.count++
        entry.total += e.value
        byAbility[e.ability] = entry
      }
    }

    return Object.entries(byAbility)
      .map(([ability, { count, total }]) => ({
        ability,
        count,
        totalDamage: total,
        avgDamage: Math.round(total / count),
        pctOfTotal: totalDmg > 0 ? (total / totalDmg) * 100 : 0,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage)
  }, [events])

  // Per-mob breakdown
  const mobBreakdown = useMemo((): MobRow[] => {
    const mobs: Record<string, {
      kills: number; hits: number; crits: number; misses: number;
      parries: number; incomingHits: number; dmgDealt: number; dmgTaken: number; drops: number
    }> = {}

    const playerName = session.characterName

    for (const e of events) {
      // Outgoing events: target is the mob
      if (e.source === playerName || e.source === playerName) {
        const mob = e.target
        if (!mob) continue
        if (!mobs[mob]) mobs[mob] = { kills: 0, hits: 0, crits: 0, misses: 0, parries: 0, incomingHits: 0, dmgDealt: 0, dmgTaken: 0, drops: 0 }
        if (e.eventType === 'MeleeDamage') { mobs[mob].hits++; mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'CriticalHit') { mobs[mob].crits++; mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'AbilityDamage' || e.eventType === 'SpellDamage' || e.eventType === 'RangedDamage') { mobs[mob].dmgDealt += e.value }
        if (e.eventType === 'Miss') mobs[mob].misses++
        if (e.eventType === 'MobKill') mobs[mob].kills++
      }

      // Incoming events: source is the mob
      if (e.target === playerName || e.target === playerName) {
        const mob = e.source
        if (!mob) continue
        if (!mobs[mob]) mobs[mob] = { kills: 0, hits: 0, crits: 0, misses: 0, parries: 0, incomingHits: 0, dmgDealt: 0, dmgTaken: 0, drops: 0 }
        if (e.eventType === 'MeleeDamage' || e.eventType === 'CriticalHit') { mobs[mob].incomingHits++; mobs[mob].dmgTaken += e.value }
        if (e.eventType === 'Parry') mobs[mob].parries++
      }

      // Item drops: target is the item name, but we need to associate with last-killed mob
      // For simplicity, attribute drops to the session level (already shown in Farming tab)
    }

    return Object.entries(mobs)
      .filter(([_, m]) => m.kills > 0 || m.dmgDealt > 0)
      .map(([mob, m]) => {
        const totalSwings = m.hits + m.crits + m.misses
        return {
          mob,
          kills: m.kills,
          accuracy: totalSwings > 0 ? (m.hits + m.crits) / totalSwings : 0,
          critRate: (m.hits + m.crits) > 0 ? m.crits / (m.hits + m.crits) : 0,
          parryRate: (m.parries + m.incomingHits) > 0 ? m.parries / (m.parries + m.incomingHits) : 0,
          damageDealt: m.dmgDealt,
          damageTaken: m.dmgTaken,
          drops: 0, // drops not directly associable to mobs from event data
        }
      })
      .sort((a, b) => b.damageDealt - a.damageDealt)
  }, [events, session.characterName])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <div className="text-xs text-gray-500 uppercase">{c.label}</div>
            <div className="text-lg text-gray-100 font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Damage composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Damage by type bar chart */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Damage by Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={damageByType} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <YAxis type="category" dataKey="type" tick={{ fill: '#6b7280', fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value: number) => [value.toLocaleString(), 'Damage']}
              />
              <Bar dataKey="damage" fill="#3b82f6"
                shape={(props: any) => {
                  const color = DAMAGE_COLORS[props.type] || '#3b82f6'
                  return <rect {...props} fill={color} />
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top abilities table */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Top Abilities</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-500 uppercase text-xs">
                <tr>
                  <th className="py-2">Ability</th>
                  <th className="py-2 text-right">Uses</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Avg</th>
                  <th className="py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {topAbilities.map((a) => (
                  <tr key={a.ability}>
                    <td className="py-2 text-gray-200">{a.ability}</td>
                    <td className="py-2 text-right text-gray-400">{a.count}</td>
                    <td className="py-2 text-right text-gray-200">{a.totalDamage.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-400">{a.avgDamage.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-400">{a.pctOfTotal.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Per-mob breakdown */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Per-Mob Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-500 uppercase text-xs">
              <tr>
                <th className="py-2">Mob</th>
                <th className="py-2 text-right">Kills</th>
                <th className="py-2 text-right">Accuracy</th>
                <th className="py-2 text-right">Crit Rate</th>
                <th className="py-2 text-right">Parry Rate</th>
                <th className="py-2 text-right">Dmg Dealt</th>
                <th className="py-2 text-right">Dmg Taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {mobBreakdown.map((m) => (
                <tr key={m.mob}>
                  <td className="py-2 text-gray-200">{m.mob}</td>
                  <td className="py-2 text-right text-gray-400">{m.kills}</td>
                  <td className="py-2 text-right text-gray-400">{(m.accuracy * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-yellow-400">{(m.critRate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-green-400">{(m.parryRate * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-gray-200">{m.damageDealt.toLocaleString()}</td>
                  <td className="py-2 text-right text-red-400">{m.damageTaken.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/CombatTab.tsx
git commit -m "feat: add Combat tab with damage composition and per-mob breakdown"
```

---

### Task 9: Farming Tab — Progress Tracking and Trends

**Files:**
- Create: `src/Vanalytics.Web/src/components/session/FarmingTab.tsx`

- [ ] **Step 1: Create FarmingTab component**

Create `src/Vanalytics.Web/src/components/session/FarmingTab.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceDot
} from 'recharts'
import { api } from '../../api/client'
import type { SessionDetail, SessionEvent, SessionTrendEntry } from '../../types/api'

interface FarmingTabProps {
  session: SessionDetail
  events: SessionEvent[]
}

export default function FarmingTab({ session, events }: FarmingTabProps) {
  const [trends, setTrends] = useState<SessionTrendEntry[]>([])
  const [trendsLoading, setTrendsLoading] = useState(true)

  useEffect(() => {
    setTrendsLoading(true)
    api<SessionTrendEntry[]>(
      `/api/sessions/trends?characterId=${session.characterId}&zone=${encodeURIComponent(session.zone)}`
    )
      .then(setTrends)
      .catch(() => setTrends([]))
      .finally(() => setTrendsLoading(false))
  }, [session.characterId, session.zone])

  const durationHours = session.endedAt
    ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 3600000
    : 0

  const gilGained = events
    .filter(e => e.eventType === 'GilGain')
    .reduce((s, e) => s + e.value, 0)

  const limitPoints = events
    .filter(e => e.eventType === 'LimitGain')
    .reduce((s, e) => s + e.value, 0)

  const itemsLost = events.filter(e => e.eventType === 'ItemLost').length

  const thMax = events
    .filter(e => e.eventType === 'TreasureHunter')
    .reduce((max, e) => Math.max(max, e.value), 0)

  const gilPerHour = durationHours > 0 ? gilGained / durationHours : 0
  const killsPerHour = durationHours > 0 ? session.mobsKilled / durationHours : 0
  const dropsPerHour = durationHours > 0 ? session.itemsDropped / durationHours : 0

  const farmingCards = [
    { label: 'Gil/Hour', value: Math.round(gilPerHour).toLocaleString() },
    { label: 'Kills/Hour', value: Math.round(killsPerHour).toLocaleString() },
    { label: 'Drops/Hour', value: Math.round(dropsPerHour).toLocaleString() },
    { label: 'LP Earned', value: limitPoints.toLocaleString() },
    { label: 'Items Lost', value: itemsLost.toString(), warn: itemsLost > 0 },
    { label: 'TH Max', value: thMax > 0 ? `TH${thMax}` : 'N/A' },
  ]

  // Loot table: group items by name
  const lootTable = useMemo(() => {
    const items: Record<string, { qty: number; first: string; last: string }> = {}
    for (const e of events) {
      if (e.eventType === 'ItemDrop') {
        const name = e.target
        if (!items[name]) items[name] = { qty: 0, first: e.timestamp, last: e.timestamp }
        items[name].qty += e.value
        if (e.timestamp < items[name].first) items[name].first = e.timestamp
        if (e.timestamp > items[name].last) items[name].last = e.timestamp
      }
    }
    return Object.entries(items)
      .map(([item, d]) => ({ item, ...d }))
      .sort((a, b) => b.qty - a.qty)
  }, [events])

  const lostItems = useMemo(() => {
    return events
      .filter(e => e.eventType === 'ItemLost')
      .map(e => ({ item: e.target, timestamp: e.timestamp }))
  }, [events])

  // Trend chart data with averages
  const trendAvgs = useMemo(() => {
    if (trends.length === 0) return { gilAvg: 0, killsAvg: 0, dropsAvg: 0 }
    return {
      gilAvg: trends.reduce((s, t) => s + t.gilPerHour, 0) / trends.length,
      killsAvg: trends.reduce((s, t) => s + t.killsPerHour, 0) / trends.length,
      dropsAvg: trends.reduce((s, t) => s + t.dropsPerHour, 0) / trends.length,
    }
  }, [trends])

  const currentTrendIndex = trends.findIndex(t => t.sessionId === session.id)

  function formatDelta(current: number, avg: number): string {
    if (avg === 0) return ''
    const pct = ((current - avg) / avg) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(0)}% vs avg`
  }

  return (
    <div className="space-y-6">
      {/* Farming metric cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {farmingCards.map((c) => (
          <div key={c.label} className={`rounded-lg border bg-gray-900 px-3 py-2 ${
            c.warn ? 'border-amber-700' : 'border-gray-800'
          }`}>
            <div className="text-xs text-gray-500 uppercase">{c.label}</div>
            <div className={`text-lg font-semibold ${c.warn ? 'text-amber-400' : 'text-gray-100'}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Loot table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">Loot Obtained</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-500 uppercase text-xs">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">First Drop</th>
                <th className="py-2 text-right">Last Drop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lootTable.map((l) => (
                <tr key={l.item}>
                  <td className="py-2 text-gray-200">{l.item}</td>
                  <td className="py-2 text-right text-gray-400">{l.qty}</td>
                  <td className="py-2 text-right text-gray-500 text-xs">
                    {new Date(l.first).toLocaleTimeString()}
                  </td>
                  <td className="py-2 text-right text-gray-500 text-xs">
                    {new Date(l.last).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lostItems.length > 0 && (
          <div className="mt-4 border-t border-amber-800 pt-4">
            <h4 className="text-sm font-medium text-amber-400 mb-2">Items Lost</h4>
            {lostItems.map((l, i) => (
              <div key={i} className="text-sm text-amber-300">
                {l.item} — {new Date(l.timestamp).toLocaleTimeString()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cross-session trends */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase mb-4">
          Trends — {session.zone}
        </h3>

        {trendsLoading ? (
          <p className="text-gray-500">Loading trends...</p>
        ) : trends.length < 2 ? (
          <p className="text-gray-500 text-sm">Need at least 2 completed sessions in this zone to show trends.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gil/Hour trend */}
            <TrendChart
              title="Gil/Hour"
              data={trends}
              dataKey="gilPerHour"
              color="#eab308"
              currentIndex={currentTrendIndex}
              callout={formatDelta(gilPerHour, trendAvgs.gilAvg)}
            />
            {/* Kills/Hour trend */}
            <TrendChart
              title="Kills/Hour"
              data={trends}
              dataKey="killsPerHour"
              color="#3b82f6"
              currentIndex={currentTrendIndex}
              callout={formatDelta(killsPerHour, trendAvgs.killsAvg)}
            />
            {/* Drops/Hour trend */}
            <TrendChart
              title="Drops/Hour"
              data={trends}
              dataKey="dropsPerHour"
              color="#22c55e"
              currentIndex={currentTrendIndex}
              callout={formatDelta(dropsPerHour, trendAvgs.dropsAvg)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TrendChart({ title, data, dataKey, color, currentIndex, callout }: {
  title: string
  data: SessionTrendEntry[]
  dataKey: keyof SessionTrendEntry
  color: string
  currentIndex: number
  callout: string
}) {
  const chartData = data.map((d, i) => ({
    index: i,
    value: d[dataKey] as number,
    date: new Date(d.date).toLocaleDateString(),
  }))

  const currentPoint = currentIndex >= 0 ? chartData[currentIndex] : null

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm text-gray-300">{title}</span>
        {callout && <span className="text-xs text-gray-500">{callout}</span>}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            formatter={(v: number) => [Math.round(v).toLocaleString(), title]}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          {currentPoint && (
            <ReferenceDot
              x={currentPoint.date}
              y={currentPoint.value}
              r={6}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/FarmingTab.tsx
git commit -m "feat: add Farming tab with loot table and cross-session trends"
```

---

### Task 10: Final Integration and Cleanup

**Files:**
- Verify: All new components compile and render
- Verify: Navigation flow works end-to-end

- [ ] **Step 1: Verify the build compiles**

Run from `src/Vanalytics.Web`:

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Fix any compilation errors**

If there are type errors or import issues, fix them. Common issues:
- Missing type exports in `api.ts`
- recharts component imports (check `ComposedChart`, `Scatter`, `ReferenceDot` are available in recharts v3)
- Relative import paths

- [ ] **Step 3: Verify backend builds**

Run from `src/Vanalytics.Api`:

```bash
dotnet build
```

Expected: Build succeeds. The new enum values and DTO fields should compile cleanly.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve compilation issues in session report"
```

- [ ] **Step 5: Final commit with all files verified**

```bash
git status
git log --oneline -10
```

Verify all 10 tasks produced commits and the working tree is clean.
