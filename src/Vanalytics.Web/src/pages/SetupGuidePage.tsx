import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Download } from 'lucide-react'
import AuthLink from '../components/AuthLink'

type Tab = 'install' | 'commands' | 'sync' | 'hunt' | 'macros' | 'sessions' | 'inventory' | 'moves'

const tabs: { id: Tab; label: string }[] = [
  { id: 'install', label: 'Install' },
  { id: 'commands', label: 'Commands' },
  { id: 'sync', label: 'Sync' },
  { id: 'hunt', label: 'Hunt' },
  { id: 'macros', label: 'Macros' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'moves', label: 'Moves' },
]

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
        {number}
      </div>
      <div className="flex-1 pb-8">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="text-sm text-gray-400 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-300 overflow-x-auto">
      <code>{children}</code>
    </pre>
  )
}

function Code({ children }: { children: string }) {
  return <code className="text-blue-300 bg-gray-800 px-1.5 py-0.5 rounded">{children}</code>
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold mb-3">{children}</h3>
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 mb-4">{children}</p>
}

function CommandRow({ command, description }: { command: string; description: string }) {
  return (
    <tr className="border-b border-gray-800">
      <td className="py-2 pr-4"><code className="text-blue-300">{command}</code></td>
      <td className="py-2 text-gray-400">{description}</td>
    </tr>
  )
}

function CommandTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-sm mb-6">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium">Command</th>
          <th className="pb-2 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 mb-6 text-sm text-gray-400 space-y-3">
      {children}
    </div>
  )
}

function WarnBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-5 mb-6">
      {title && <h4 className="font-semibold text-amber-400 mb-2">{title}</h4>}
      <div className="text-sm text-gray-400 space-y-3">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function InstallTab() {
  const { user } = useAuth()

  return (
    <div>
      <Step number={1} title="Install Windower 4">
        <p>
          If you haven't already, download and install{' '}
          <a
            href="https://www.windower.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Windower 4
          </a>
          . Windower is a third-party launcher for Final Fantasy XI that supports addons.
        </p>
        <p>
          Make sure Windower is working and you can log into FFXI through it before continuing.
        </p>
      </Step>

      <Step number={2} title="Generate an API Key">
        <p>
          Go to your{' '}
          <AuthLink to="/profile?tab=apikeys" className="text-blue-400 hover:underline">
            Profile &gt; API Keys
          </AuthLink>
          {' '}tab and click <strong className="text-gray-200">Generate Key</strong>.
        </p>
        <p>
          Copy the key immediately — it will only be shown once. You'll paste this into the addon
          using an in-game command in a later step.
        </p>
        {user?.hasApiKey && (
          <div className="rounded bg-green-900/30 border border-green-800 px-3 py-2 text-green-400">
            You already have an API key generated. If you've lost it, you can regenerate a new one
            from your profile.
          </div>
        )}
      </Step>

      <Step number={3} title="Install the Vanalytics Addon">
        <p>
          Download the addon and extract the <Code>vanalytics</Code> folder
          into your Windower addons directory:
        </p>
        <CodeBlock>{`Windower4\\addons\\vanalytics\\
├── vanalytics.lua
├── inventory.lua
├── macros.lua
├── moves.lua
├── session.lua
└── settings.xml`}</CodeBlock>
        <a
          href="/api/addon/download"
          download
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download Addon (.zip)
        </a>
      </Step>

      <Step number={4} title="Load the Addon in Windower">
        <p>
          Launch FFXI through Windower and log into your character. Then load the addon by typing
          this command in the game chat:
        </p>
        <CodeBlock>{`//lua load vanalytics`}</CodeBlock>
        <p>
          You should see a confirmation message in your chat log. To auto-load the addon every time
          you start Windower, add it to your Windower profile's addon list.
        </p>
      </Step>

      <Step number={5} title="Configure Your API Key">
        <p>
          Set your API key using the in-game command. Paste your key from Step 2:
        </p>
        <CodeBlock>{`//vanalytics apikey YOUR_API_KEY_HERE`}</CodeBlock>
        <p>
          The key is saved automatically and persists across sessions. You only need to do this once.
        </p>
      </Step>

      <Step number={6} title="Verify the Sync">
        <p>
          Run a manual sync to verify everything is working:
        </p>
        <CodeBlock>{`//vanalytics sync`}</CodeBlock>
        <p>
          If successful, you'll see a confirmation in chat. Your character data will now appear on
          your dashboard and will automatically sync on a recurring interval.
        </p>
        <p>
          You can check the addon status at any time:
        </p>
        <CodeBlock>{`//vanalytics status`}</CodeBlock>
      </Step>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mt-4">
        <p className="text-xs text-gray-500">
          You can use the shorthand <Code>//va</Code> instead
          of <Code>//vanalytics</Code> for all commands. See
          the <strong className="text-gray-400">Commands</strong> tab for a full reference.
        </p>
      </div>
    </div>
  )
}

function CommandsTab() {
  return (
    <div>
      <SectionHeading>General</SectionHeading>
      <CommandTable>
        <CommandRow command="//va sync" description="Sync character data, inventory, macros, and bazaar presence immediately" />
        <CommandRow command="//va status" description="Show API URL, key status, sync interval, and last sync result" />
        <CommandRow command="//va apikey <key>" description="Set your API key (saved across sessions)" />
        <CommandRow command="//va interval <minutes>" description="Change the auto-sync interval (minimum 5 minutes, default 60)" />
        <CommandRow command="//va notify on|off" description="Toggle in-game chat notifications on successful sync (default on). Errors are always shown regardless." />
        <CommandRow command="//va url <url>" description="Set the API URL directly, or use the shortcuts local or prod" />
        <CommandRow command="//va dump" description="Dump all player/equipment/item data to a text file for debugging" />
        <CommandRow command="//va help" description="Show the in-game command reference" />
      </CommandTable>

      <SectionHeading>Session Tracking</SectionHeading>
      <CommandTable>
        <CommandRow command="//va session start" description="Start a performance tracking session" />
        <CommandRow command="//va session stop" description="Stop the active session and upload remaining data" />
        <CommandRow command="//va session status" description="Show current session info (ID, event count, duration)" />
        <CommandRow command="//va session flush" description="Manually upload buffered events to the API" />
        <CommandRow command="//va session cleanup" description="Delete old local session files" />
        <CommandRow command="//va session debug" description="Toggle debug mode (logs unmatched chat lines to help identify missing parsers)" />
      </CommandTable>

      <SectionHeading>Macro Sync</SectionHeading>
      <CommandTable>
        <CommandRow command="//va macros push [--force]" description="Upload macro books whose content has changed since the last push; --force uploads all 20 books unconditionally" />
        <CommandRow command="//va macros pull [--force]" description="Download pending macro edits queued on the web; --force re-downloads all tracked books" />
        <CommandRow command="//va macros status" description="Show how many macro books the addon is currently tracking" />
        <CommandRow command="//va macros diag" description="Show per-book change-detection state (local hash, remote hash, mtime) for troubleshooting" />
        <CommandRow command="//va macros dump" description="Dump the raw contents of macro DAT files to text for debugging" />
      </CommandTable>

      <SectionHeading>Hunt Overlays</SectionHeading>
      <CommandTable>
        <CommandRow command="//va hunt on|off|toggle" description="Master switch for the hunt overlay set (Target, Watch, Wide Scan, NM Cache)" />
        <CommandRow command="//va hunt" description="Show hunt status: panel state, current target, watch list summary, NM cache state" />
        <CommandRow command="//va hunt watch" description="List watched mob slots with current alive/dead state and HP" />
        <CommandRow command="//va hunt watch nm <name>" description="Pre-watch every curated slot for an NM by name (NM + placeholder, auto-triggers /widescan)" />
        <CommandRow command="//va hunt watch remove <idx>" description="Stop watching a mob (decimal index or 0x-hex)" />
        <CommandRow command="//va hunt watch clear" description="Drop all watched slots and reopen the NM Cache browse window" />
        <CommandRow command="//va hunt nm" description="Re-show the NM Cache panel for 20 seconds" />
        <CommandRow command="//va hunt nm pin" description="Toggle persistent NM Cache visibility (overrides the workflow)" />
        <CommandRow command="//va hunt nm list" description="Dump the curated NM names for the current zone to chat" />
        <CommandRow command="//va hunt sound on|off|test" description="Toggle pop-alert sounds or test playback" />
        <CommandRow command="//va hunt pos" description="Show or set overlay panel positions" />
      </CommandTable>

      <SectionHeading>Inventory Moves</SectionHeading>
      <CommandTable>
        <CommandRow command="//va moves status" description="Show pending inventory move orders queued on the web" />
        <CommandRow command="//va moves execute" description="Execute all pending moves via in-game packet injection" />
      </CommandTable>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 mt-2">
        <p className="text-xs text-gray-500">
          All commands accept the shorthand <Code>//va</Code> in place
          of <Code>//vanalytics</Code>.
        </p>
      </div>
    </div>
  )
}

function SyncTab() {
  return (
    <div>
      <Paragraph>
        The core sync uploads a snapshot of your character state to the Vanalytics API. It runs
        automatically on a timer and can also be triggered manually
        with <Code>//va sync</Code>.
      </Paragraph>

      <SectionHeading>What Gets Synced</SectionHeading>
      <InfoBox>
        <p className="text-gray-300 font-medium">Identity &amp; progression</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Character name, server, and race</li>
          <li>Active job and subjob with levels, master level, item level</li>
          <li>All unlocked jobs with levels, Job Points (JP), JP spent, and Capacity Points (CP) per job</li>
          <li>Starting nation, linkshell, current title, and total playtime</li>
          <li>Merit points (non-zero categories)</li>
        </ul>

        <p className="text-gray-300 font-medium pt-2">Gear &amp; skills</p>
        <ul className="list-disc list-inside space-y-1">
          <li>All 16 equipment slots with item names and IDs</li>
          <li>Crafting skill levels and ranks for all 10 crafts (including Synergy)</li>
          <li>Combat, magic, and automaton skill levels with caps (sword, parrying, elemental magic, etc.)</li>
          <li>Equipment and face model IDs (used by the 3D character viewer)</li>
        </ul>

        <p className="text-gray-300 font-medium pt-2">Live stats &amp; vitals</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Current HP / Max HP and MP / Max MP</li>
          <li>Base stats (STR, DEX, VIT, AGI, INT, MND, CHR) and gear/buff additions</li>
          <li>Attack, defense, and elemental resistances (fire, ice, wind, earth, lightning, water, light, dark)</li>
          <li>Nation rank and rank points</li>
        </ul>

        <p className="text-gray-300 font-medium pt-2">Porter Moogle storage</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Contents of every storage slip in your bags, decoded from each slip's extdata</li>
          <li>Items stored at the Porter Moogle are surfaced in the <strong className="text-gray-300">Porter</strong> tab on the character detail page</li>
          <li>Slips not currently in your bags keep their last known contents — server data is never wiped on absence</li>
        </ul>
      </InfoBox>

      <SectionHeading>Auto-Sync Timer</SectionHeading>
      <Paragraph>
        When your API key is configured and you're logged in, the addon starts an auto-sync timer.
        The default interval is <strong className="text-gray-300">60 minutes</strong>, configurable
        down to a minimum of 5 minutes with <Code>{'//va interval <minutes>'}</Code>.
      </Paragraph>
      <Paragraph>
        Each timer tick queues several tasks — character data, inventory diffs, Porter storage
        contents, bazaar presence scans, and a check for pending inventory moves. These tasks
        are spread across multiple game frames using a work queue to minimize any impact on
        game performance.
      </Paragraph>

      <SectionHeading>Chat Notifications</SectionHeading>
      <Paragraph>
        On each successful auto-sync, the addon prints a confirmation line to your game chat. If
        that's too chatty for your taste, silence it with <Code>//va notify off</Code>, or turn it
        back on with <Code>//va notify on</Code>. The setting is stored in your addon
        configuration and persists across game sessions. The equivalent XML key
        is <Code>NotifyOnSync</Code> in <Code>addon/vanalytics/settings.xml</Code>.
      </Paragraph>
      <Paragraph>
        Errors (connection failures, invalid API key, rate limiting) are always shown regardless
        of this setting so you're never left guessing when a sync fails. Manual commands
        like <Code>//va sync</Code>, <Code>//va macros push</Code>, or <Code>//va session start</Code> also
        continue to print their own feedback because you explicitly asked for them.
      </Paragraph>
      <Paragraph>
        <strong className="text-gray-300">Macros are intentionally excluded</strong> from the
        auto-sync cycle to avoid overwriting your saved macros with empty defaults when logging
        in from a fresh FFXI installation. Use <Code>//va macros push</Code> to upload macro
        changes manually. See the <strong className="text-gray-300">Macros</strong> tab for details.
      </Paragraph>

      <SectionHeading>Bazaar Presence</SectionHeading>
      <Paragraph>
        As part of each sync cycle, the addon passively scans for nearby players who have a
        bazaar open and reports their names, zone, and server to the API. This powers the
        bazaar tracking features on the site. No manual action is required.
      </Paragraph>

      <WarnBox title="Troubleshooting">
        <dl className="space-y-4">
          <div>
            <dt className="font-medium text-gray-300">Sync says "Invalid API key"</dt>
            <dd className="text-gray-500 mt-1">
              Your API key may be incorrect or revoked. Generate a new one from your{' '}
              <AuthLink to="/profile?tab=apikeys" className="text-blue-400 hover:underline">
                Profile &gt; API Keys
              </AuthLink>{' '}
              tab and set it with <Code>{'//va apikey <new-key>'}</Code>.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-300">Sync says "Rate limit exceeded"</dt>
            <dd className="text-gray-500 mt-1">
              The API allows a maximum of 20 sync requests per hour. Increase your sync interval
              or wait for the limit to reset.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-300">Brief game freeze during sync</dt>
            <dd className="text-gray-500 mt-1">
              The addon uses synchronous HTTP requests, which may cause a momentary freeze
              (less than a second) each time it syncs. This is normal and only happens once per
              sync interval.
            </dd>
          </div>
        </dl>
      </WarnBox>
    </div>
  )
}

function HuntTab() {
  return (
    <div>
      <Paragraph>
        The hunt feature turns Vanalytics into a live HUD for camping Notorious Monsters. Four
        on-screen panels track your current target, watched mob slots, the latest Wide Scan
        results, and a curated NM reference card for the zone you're standing in. Everything is
        gated behind a single switch — <Code>//va hunt on</Code> — and the panels appear and
        disappear automatically based on what you're doing.
      </Paragraph>

      <SectionHeading>The Four Panels</SectionHeading>
      <InfoBox>
        <p className="text-gray-300 font-medium">Target</p>
        <p>
          Shows the name, level, HP%, and a text HP bar for whatever you currently have
          targeted. Visible whenever you have a game target.
        </p>

        <p className="text-gray-300 font-medium pt-2">Watch</p>
        <p>
          A live list of mob slots you're monitoring for pops or respawns. Each row shows the
          mob's current name, slot index, alive/dead status, HP%, and distance + compass
          direction. Alive entries render green; dead entries render red with a respawn
          countdown when known. Slots are added automatically when you use the in-game Track
          on a Wide Scan entry, or explicitly via <Code>//va hunt watch nm</Code>.
        </p>

        <p className="text-gray-300 font-medium pt-2">Wide Scan</p>
        <p>
          A list of every mob your most recent <Code>/widescan</Code> picked up, sorted in
          arrival order with distance and direction. Flashes on each scan burst and
          auto-dismisses when you close the next in-game menu — treat it as a HUD popup, not a
          persistent panel.
        </p>

        <p className="text-gray-300 font-medium pt-2">NM Cache</p>
        <p>
          A reference card listing every curated Notorious Monster known for the current zone.
          Each NM shows its name, respawn timer (or window), placeholder name and slot index,
          and a one-line note about its spawn mechanic. Visibility is workflow-driven (see
          below).
        </p>
      </InfoBox>

      <SectionHeading>The Workflow</SectionHeading>
      <Paragraph>
        The hunt panels are designed to stay out of your way except when they're useful. You
        don't have to toggle individual panels on and off — the addon infers what you're doing
        and shows the right thing.
      </Paragraph>
      <InfoBox>
        <p>
          <strong className="text-gray-300">Browse</strong> — You just zoned in (or just
          cleared your watch list). NM Cache appears for 20 seconds so you can see what's
          huntable in the zone without typing anything.
        </p>
        <p>
          <strong className="text-gray-300">Commit</strong> — You ran <Code>//va hunt watch nm</Code> on
          a specific NM, or the in-game Track auto-added something. The watch list now has
          entries, so NM Cache hides — it served its purpose. Watch + Target take over.
        </p>
        <p>
          <strong className="text-gray-300">Hunt</strong> — You're actively camping. Watch
          shows alive/dead state with respawn countdowns. Wide Scan flashes whenever you
          trigger <Code>/widescan</Code>.
        </p>
        <p>
          <strong className="text-gray-300">Reset</strong> — <Code>//va hunt watch clear</Code> empties
          the watch list and re-opens the Browse window so you can pick your next target.
        </p>
      </InfoBox>
      <Paragraph>
        Need NM Cache visible during a hunt for reference? Run <Code>//va hunt nm pin</Code> to
        override the workflow and keep it on screen permanently. Run it again to unpin. Or use
        bare <Code>//va hunt nm</Code> to re-trigger the 20-second Browse window without pinning.
      </Paragraph>

      <SectionHeading>Pre-Watching an NM by Name</SectionHeading>
      <Paragraph>
        <Code>{'//va hunt watch nm <name>'}</Code> is the marquee command. Given a curated NM
        name, it looks up every slot that NM could occupy plus its placeholder slot, adds them
        all to the watch list, and automatically issues <Code>/widescan</Code> so the panel
        has fresh position data. You don't need to find the placeholder yourself.
      </Paragraph>
      <Paragraph>
        Example: <Code>//va hunt watch nm valkurm emperor</Code> adds the NM's spawn slot
        (<Code>0x14E</Code>) and the curated Damselfly placeholder slot (<Code>0x14A</Code>).
        When the placeholder dies and the NM pops in its slot — or when you walk into render
        range to find the NM already spawned — you'll get an audible alert and a chat line.
      </Paragraph>
      <Paragraph>
        The watch panel displays distance and compass direction relative to your current
        position. A <Code>~</Code> prefix on the distance (e.g. <Code>~120y NE</Code>) means
        the position is approximate — derived from the last <Code>/widescan</Code> rather than
        live render data. Run <Code>/widescan</Code> again to refresh, or just walk closer
        until the mob enters render range (no prefix) for accurate live tracking.
      </Paragraph>

      <SectionHeading>Alerts &amp; Sounds</SectionHeading>
      <Paragraph>
        When a watched slot transitions to alive — either via a name change (placeholder
        died, NM popped) or a fresh dead-to-alive observation — the addon plays a sound and
        prints a chat confirmation. Curated NMs trigger <Code>notify_NM.wav</Code>; everything
        else (regular respawns, placeholder churn) plays <Code>notify_Standard.wav</Code>.
        Both files live in <Code>addon/vanalytics/</Code> and can be swapped if you prefer
        different chimes.
      </Paragraph>
      <Paragraph>
        Toggle sounds with <Code>//va hunt sound on|off</Code>, or test playback
        with <Code>//va hunt sound test</Code>. The chat lines fire regardless — sound is the
        louder secondary cue.
      </Paragraph>

      <SectionHeading>Respawn Countdowns</SectionHeading>
      <Paragraph>
        When a watched mob dies, the addon timestamps the death and renders a live countdown
        next to its DEAD label. The wording is spawn-type aware:
      </Paragraph>
      <InfoBox>
        <p>
          <strong className="text-gray-300">Timed NMs</strong> — Shows <Code>in 5m 32s</Code> while
          counting down, <Code>DUE</Code> at zero, <Code>DUE +2m 14s</Code> past expected pop.
        </p>
        <p>
          <strong className="text-gray-300">Lottery NMs</strong> — Shows <Code>WINDOW in 5m 32s</Code> while
          waiting for the spawn window to open, <Code>WINDOW OPEN</Code> the moment it does,
          and <Code>WINDOW OPEN +2m 14s</Code> after. Lottery NMs can pop on any subsequent
          placeholder kill once the window is open; the countdown does not predict the pop
          itself.
        </p>
        <p>
          <strong className="text-gray-300">Popped / quest NMs</strong> — No countdown
          (no respawn timer applies). Shown as <Code>[?]</Code> in the NM Cache.
        </p>
      </InfoBox>

      <SectionHeading>Curated NM Data</SectionHeading>
      <Paragraph>
        Vanalytics ships with curated data for 155+ FFXI zones, covering roughly 2000 named
        monsters. Each NM entry includes its placeholder, respawn behavior, and a one-line note
        sourced from BG-Wiki. When you zone into a curated zone, this data is fetched
        automatically and used to:
      </Paragraph>
      <InfoBox>
        <ul className="list-disc list-inside space-y-1">
          <li>Render the NM Cache panel with placeholder names, slot indices, and notes</li>
          <li>Resolve <Code>{'//va hunt watch nm <name>'}</Code> to the right slot(s) to monitor</li>
          <li>Decide whether a pop plays the NM sound vs. the standard respawn sound</li>
          <li>Pick the right countdown wording (timed vs. lottery vs. popped)</li>
        </ul>
      </InfoBox>
      <Paragraph>
        For zones that aren't curated yet, the addon falls back to a server-side heuristic
        that classifies mobs as NMs based on respawn time and spawn flags. The heuristic is
        less accurate (it may miss some NMs and tag some non-NMs) but keeps the watch panel
        and sound alerts functional anywhere in Vana'diel.
      </Paragraph>

      <SectionHeading>Commands</SectionHeading>
      <CommandTable>
        <CommandRow command="//va hunt on|off|toggle" description="Master switch for the hunt overlay set" />
        <CommandRow command="//va hunt" description="Show hunt status: panel state, current target, watch list summary, NM cache state" />
        <CommandRow command="//va hunt watch" description="List watched mob slots with current alive/dead state and HP" />
        <CommandRow command="//va hunt watch nm <name>" description="Pre-watch every curated slot for an NM by name (NM + placeholder, auto-triggers /widescan)" />
        <CommandRow command="//va hunt watch remove <idx>" description="Stop watching a mob (decimal index or 0x-hex)" />
        <CommandRow command="//va hunt watch clear" description="Drop all watched slots and reopen the NM Cache browse window" />
        <CommandRow command="//va hunt nm" description="Re-show the NM Cache panel for 20 seconds" />
        <CommandRow command="//va hunt nm pin" description="Toggle persistent NM Cache visibility (overrides the workflow)" />
        <CommandRow command="//va hunt nm list" description="Dump the curated NM names for the current zone to chat" />
        <CommandRow command="//va hunt sound on|off|test" description="Toggle pop-alert sounds or test playback" />
        <CommandRow command="//va hunt pos" description="Show or set overlay panel positions (target / widescan / watch / nm)" />
      </CommandTable>

      <SectionHeading>Tips</SectionHeading>
      <InfoBox>
        <p>
          <strong className="text-gray-300">Auto-add via Track</strong> — Whenever you use the
          in-game Track action on a Wide Scan entry, that mob is automatically added to your
          watch list. No command needed — just track what you're hunting.
        </p>
        <p>
          <strong className="text-gray-300">Widescan staleness</strong> — A <Code>~</Code>{' '}
          prefix on distance means the position is from your last <Code>/widescan</Code>, not
          live. Walking changes the actual distance but not the cached scan. Rescan periodically
          while navigating to a distant placeholder.
        </p>
        <p>
          <strong className="text-gray-300">Subjob requirement</strong> — <Code>/widescan</Code> only
          works on Ranger, Beastmaster, or Puppetmaster subjobs. The auto-scan
          on <Code>//va hunt watch nm</Code> silently no-ops if your subjob can't use it; you'll
          have to navigate by other means until you can scan.
        </p>
        <p>
          <strong className="text-gray-300">Multi-NM camping</strong> — You can pre-watch
          several NMs at once. The watch panel lists all slots together; alerts identify which
          slot popped by name.
        </p>
        <p>
          <strong className="text-gray-300">Dragging panels</strong> — Each panel's header is
          draggable; the body follows automatically. Use <Code>//va hunt pos save</Code> to
          persist the current positions.
        </p>
      </InfoBox>

      <WarnBox title="Limitations">
        <p>
          The hunt feature is intended for FFXI's Notorious Monster ecosystem — timed and
          lottery spawns with placeholders, popped event NMs, and quest-specific mobs. It does
          not model BCNM / Limbus / Salvage instances, Voidwatch triggers, or Dynamis-era
          mechanics beyond what BG-Wiki documents for the relevant zones.
        </p>
        <p>
          Curated NM coverage is currently 155 of 299 zones — primarily older content zones
          (cities, vanilla outdoor, expansion content through Wings of the Goddess). Newer
          zones (Adoulin, RoV, TVR) have partial coverage and fall back to the server-side
          heuristic.
        </p>
      </WarnBox>
    </div>
  )
}

function MacrosTab() {
  return (
    <div>
      <Paragraph>
        The macro sync feature lets you view and edit your FFXI macro books on the Vanalytics
        website and push changes back to your game client — or pull web-side edits back into the
        game. Unlike character sync, macros are never transferred automatically; every push and
        pull is explicit.
      </Paragraph>

      <SectionHeading>How It Works</SectionHeading>
      <InfoBox>
        <p>
          FFXI stores macros in 20 DAT files (<Code>mcr0.dat</Code> through <Code>mcr19.dat</Code>)
          inside your character's <Code>USER</Code> directory. Each file represents one macro book
          containing 10 sets of 20 macros each (10 Ctrl macros + 10 Alt macros per set).
        </p>
        <p>
          The addon reads these files, computes a hash for each book, and tracks the last-known
          local and remote hash so it can detect changes on either side. File modification
          timestamps are used as a fast pre-filter to avoid unnecessary disk reads.
        </p>
      </InfoBox>

      <WarnBox title="Why macros aren't auto-synced">
        <p>
          A fresh FFXI installation starts with empty macro books. If the addon auto-pushed those
          empty books at login, it would overwrite your server-side macros with blanks. To prevent
          this, push and pull are always manual — you decide when to transfer.
        </p>
      </WarnBox>

      <SectionHeading>Uploading Macros (Push)</SectionHeading>
      <Paragraph>
        Push uploads any macro books whose content has changed since the last push. Only books
        with a different hash are sent — unchanged books are skipped entirely:
      </Paragraph>
      <CodeBlock>{`//va macros push`}</CodeBlock>
      <Paragraph>
        FFXI caches the currently loaded macro book in memory and only writes it to disk when you
        zone, switch books, or log out. If you want to push edits you just made to the active book,
        zone once first so the DAT reflects your changes.
      </Paragraph>
      <Paragraph>
        To force a full re-upload of every tracked book regardless of hash state:
      </Paragraph>
      <CodeBlock>{`//va macros push --force`}</CodeBlock>

      <SectionHeading>Downloading Macros (Pull)</SectionHeading>
      <Paragraph>
        When you edit macros on the Vanalytics website, those changes are staged as "pending"
        on the server. Pull downloads them to your game client:
      </Paragraph>
      <CodeBlock>{`//va macros pull`}</CodeBlock>
      <Paragraph>
        The addon writes the updated DAT files and runs <Code>/reloadmacros</Code> automatically.
      </Paragraph>

      <WarnBox title="Zone before switching to a pulled book">
        <p>
          FFXI keeps the currently active macro book in memory. If you switch to a book that was
          just pulled without zoning or relogging first, the game will overwrite the new DAT file
          with its cached (pre-pull) copy, silently losing your web edits.
        </p>
        <p>
          After a successful pull, <strong className="text-gray-300">zone or relog before selecting
          any pulled book</strong>. If you pulled the currently active book, just zone once and the
          new macros will be loaded.
        </p>
      </WarnBox>

      <Paragraph>
        To force re-downloading every tracked book regardless of pending status:
      </Paragraph>
      <CodeBlock>{`//va macros pull --force`}</CodeBlock>

      <SectionHeading>Checking Status &amp; Diagnostics</SectionHeading>
      <Paragraph>
        To see how many macro books the addon is currently tracking:
      </Paragraph>
      <CodeBlock>{`//va macros status`}</CodeBlock>
      <Paragraph>
        For troubleshooting — if a push or pull isn't behaving as expected — run diagnostics to
        see the per-book change-detection state (local hash, remote hash, modification time):
      </Paragraph>
      <CodeBlock>{`//va macros diag`}</CodeBlock>
    </div>
  )
}

function SessionsTab() {
  return (
    <div>
      <Paragraph>
        Sessions let you track your gameplay performance over a defined period. While a session
        is active, the addon parses your chat log in real-time to capture combat and economy
        events, then uploads them to the API for analysis.
      </Paragraph>

      <SectionHeading>Starting a Session</SectionHeading>
      <Paragraph>
        Start a session before you begin an activity you want to track (farming, leveling, etc.):
      </Paragraph>
      <CodeBlock>{`//va session start`}</CodeBlock>
      <Paragraph>
        The addon begins monitoring your chat log for events like damage dealt, items obtained,
        experience gained, and gil changes. Events are buffered locally in a JSONL file and
        periodically uploaded to the API in batches.
      </Paragraph>

      <SectionHeading>Stopping a Session</SectionHeading>
      <CodeBlock>{`//va session stop`}</CodeBlock>
      <Paragraph>
        Stopping a session flushes any remaining buffered events and finalizes the session on the
        server. You can then view the full session report on the Vanalytics website.
      </Paragraph>

      <SectionHeading>Managing Session Data</SectionHeading>
      <InfoBox>
        <ul className="list-disc list-inside space-y-1">
          <li><Code>{'//va session status'}</Code> — View session ID, event count, and elapsed time</li>
          <li><Code>{'//va session flush'}</Code> — Manually upload buffered events without stopping the session</li>
          <li><Code>{'//va session cleanup'}</Code> — Delete old local JSONL session files to free disk space</li>
        </ul>
      </InfoBox>

      <SectionHeading>Debug Mode</SectionHeading>
      <Paragraph>
        Debug mode logs chat lines that the session parser doesn't recognize. This is useful for
        identifying missing parsers or verifying that events are being captured correctly.
      </Paragraph>
      <CodeBlock>{`//va session debug`}</CodeBlock>
      <Paragraph>
        Toggle it again to turn debug mode off. Unmatched lines are written to a separate debug
        log file in the addon directory.
      </Paragraph>
    </div>
  )
}

function InventoryTab() {
  return (
    <div>
      <Paragraph>
        Inventory sync captures a snapshot of all your storage containers and uploads only the
        changes (additions, removals, and quantity changes) to the API. It runs automatically
        as part of each sync cycle — no manual commands are needed.
      </Paragraph>

      <SectionHeading>Tracked Bags</SectionHeading>
      <InfoBox>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            'Inventory', 'Mog Safe', 'Mog Safe 2', 'Storage', 'Mog Locker',
            'Mog Satchel', 'Mog Sack', 'Mog Case', 'Mog Wardrobe',
            'Mog Wardrobe 2', 'Mog Wardrobe 3', 'Mog Wardrobe 4',
            'Mog Wardrobe 5', 'Mog Wardrobe 6', 'Mog Wardrobe 7', 'Mog Wardrobe 8',
          ].map(bag => (
            <div key={bag} className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>{bag}</span>
            </div>
          ))}
        </div>
      </InfoBox>

      <SectionHeading>Diff-Based Uploads</SectionHeading>
      <Paragraph>
        On the first sync after loading the addon, the entire inventory is sent as the baseline.
        On subsequent syncs, the addon compares the current snapshot against the previous one and
        only uploads the differences — items that were added, removed, or changed in quantity. This
        keeps the payload small and the sync fast.
      </Paragraph>

      <Paragraph>
        Each item record includes its ID, name, quantity, and which bag it's stored in. This data
        powers the inventory browser on your character's detail page.
      </Paragraph>
    </div>
  )
}

function MovesTab() {
  return (
    <div>
      <Paragraph>
        The inventory moves feature lets you queue item moves on the Vanalytics website and have
        the addon execute them in-game. This is useful for bulk reorganizing across bags —
        something the native FFXI UI makes painfully slow.
      </Paragraph>

      <SectionHeading>How It Works</SectionHeading>
      <InfoBox>
        <p>
          When you queue moves on the website, the addon picks them up during its next sync cycle
          and notifies you in chat — for example:
          <br />
          <Code>[Vanalytics] 3 pending inventory move(s). Type //va moves execute to run them.</Code>
        </p>
        <p>
          Moves are never executed automatically. You run them with{' '}
          <Code>//va moves execute</Code> when you're ready and in the right place (e.g., Mog
          House for Locker/Storage access).
        </p>
        <p>
          Each move is sent as an injected game packet, with verification after every step. A
          detailed log is written to <Code>addons/vanalytics/moves.log</Code> for troubleshooting.
        </p>
      </InfoBox>

      <SectionHeading>Viewing Pending Moves</SectionHeading>
      <Paragraph>
        To see what's queued before running:
      </Paragraph>
      <CodeBlock>{`//va moves status`}</CodeBlock>
      <Paragraph>
        This polls the server and lists each pending move (quantity, item name, source bag,
        destination bag).
      </Paragraph>

      <SectionHeading>Executing Moves</SectionHeading>
      <CodeBlock>{`//va moves execute`}</CodeBlock>
      <Paragraph>
        The addon processes moves one at a time. Each successful move is reported in chat.
        Moves that touch partial stacks are split intelligently so existing stacks fill first
        before new slots are used.
      </Paragraph>

      <SectionHeading>The Inventory Relay</SectionHeading>
      <Paragraph>
        FFXI only allows direct moves <em>to or from</em> Inventory. A move between two non-
        Inventory bags (e.g., Satchel → Locker) is handled automatically as a two-step relay:
        Satchel → Inventory → Locker. Both steps are verified before the move is reported
        successful.
      </Paragraph>

      <WarnBox title="Bag accessibility">
        <p>
          Some bags are only available in specific locations. Locker, Storage, and all Mog
          Wardrobes 2–8 require being inside your Mog House. If a queued move references a bag
          that isn't currently accessible, that move is skipped and the addon reports which bags
          are needed.
        </p>
        <p>
          Head to your Mog House (or the appropriate zone) and run{' '}
          <Code>//va moves execute</Code> again to complete skipped moves.
        </p>
      </WarnBox>

      <SectionHeading>After Execution</SectionHeading>
      <Paragraph>
        When all executable moves finish, the addon acknowledges them to the server (so they're
        removed from the queue) and triggers an inventory re-sync to bring the website up to date
        with the new bag contents.
      </Paragraph>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SetupGuidePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = tabs.find(t => t.id === searchParams.get('tab'))?.id ?? 'install'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'install' ? {} : { tab }, { replace: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Windower Addon Setup Guide</h1>
      <p className="text-gray-400 mb-6">
        Install and configure the Vanalytics Windower addon to automatically sync your FFXI
        character data.
      </p>

      <div className="flex gap-1 border-b border-gray-700 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl">
        {activeTab === 'install' && <InstallTab />}
        {activeTab === 'commands' && <CommandsTab />}
        {activeTab === 'sync' && <SyncTab />}
        {activeTab === 'hunt' && <HuntTab />}
        {activeTab === 'macros' && <MacrosTab />}
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'moves' && <MovesTab />}
      </div>
    </div>
  )
}
