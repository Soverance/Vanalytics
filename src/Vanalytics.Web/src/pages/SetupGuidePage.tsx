import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Download } from 'lucide-react'
import AuthLink from '../components/AuthLink'

type Tab = 'install' | 'commands' | 'sync' | 'macros' | 'sessions' | 'inventory'

const tabs: { id: Tab; label: string }[] = [
  { id: 'install', label: 'Install' },
  { id: 'commands', label: 'Commands' },
  { id: 'sync', label: 'Sync' },
  { id: 'macros', label: 'Macros' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'inventory', label: 'Inventory' },
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
        <CommandRow command="//va interval <minutes>" description="Change the auto-sync interval (minimum 5 minutes, default 15)" />
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
        <CommandRow command="//va macros push" description="Force-upload all 20 macro books to the server" />
        <CommandRow command="//va macros pull" description="Check for and download pending macro edits made on the web" />
        <CommandRow command="//va macros status" description="Show how many of the 20 macro books are currently tracked" />
        <CommandRow command="//va macros dump" description="Dump the raw contents of macro DAT files for debugging" />
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
        <ul className="list-disc list-inside space-y-1">
          <li>Character name, server, and active job/level</li>
          <li>All unlocked jobs with their levels</li>
          <li>Job Points (JP), JP spent, and Capacity Points (CP) per job</li>
          <li>All 16 equipment slots with item names and IDs</li>
          <li>Crafting skill levels and ranks for all 10 crafts (including Synergy)</li>
          <li>Current HP, MP, TP, and zone</li>
        </ul>
      </InfoBox>

      <SectionHeading>Auto-Sync Timer</SectionHeading>
      <Paragraph>
        When your API key is configured and you're logged in, the addon starts an auto-sync timer.
        The default interval is <strong className="text-gray-300">15 minutes</strong>, configurable
        down to a minimum of 5 minutes with <Code>{'//va interval <minutes>'}</Code>.
      </Paragraph>
      <Paragraph>
        Each timer tick queues several sync tasks — character data, inventory diffs, bazaar
        presence scans, and macro change detection. These tasks are spread across multiple
        game frames using a work queue to minimize any impact on game performance.
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

function MacrosTab() {
  return (
    <div>
      <Paragraph>
        The macro sync feature lets you view and edit your FFXI macro books on the Vanalytics
        website and push changes back to your game client. Macros are synced automatically as
        part of each sync cycle, or you can manage them manually.
      </Paragraph>

      <SectionHeading>How It Works</SectionHeading>
      <InfoBox>
        <p>
          FFXI stores macros in 20 DAT files (<Code>mcr0.dat</Code> through <Code>mcr19.dat</Code>)
          inside your character's <Code>USER</Code> directory. Each file represents one macro book
          containing 10 sets of 20 macros each (10 Ctrl macros + 10 Alt macros per set).
        </p>
        <p>
          The addon reads these files, computes a hash for each book, and only uploads books whose
          content has actually changed. File modification timestamps are also checked as a fast
          pre-filter to avoid unnecessary disk reads.
        </p>
      </InfoBox>

      <SectionHeading>Uploading Macros (Push)</SectionHeading>
      <Paragraph>
        Macros are checked for changes automatically on each sync cycle. If any books have been
        modified since the last upload, only the changed books are sent to the API. To force a
        full re-upload of all 20 books:
      </Paragraph>
      <CodeBlock>{`//va macros push`}</CodeBlock>

      <SectionHeading>Downloading Macros (Pull)</SectionHeading>
      <Paragraph>
        When you edit macros on the Vanalytics website, those changes are staged as "pending"
        on the server. Use the pull command to download pending edits to your game client:
      </Paragraph>
      <CodeBlock>{`//va macros pull`}</CodeBlock>
      <Paragraph>
        The addon writes the updated DAT files and
        automatically runs <Code>/reloadmacros</Code> so the changes take effect immediately
        without restarting the game.
      </Paragraph>

      <SectionHeading>Checking Status</SectionHeading>
      <Paragraph>
        To see how many of your 20 macro books are currently tracked:
      </Paragraph>
      <CodeBlock>{`//va macros status`}</CodeBlock>
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
        {activeTab === 'macros' && <MacrosTab />}
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'inventory' && <InventoryTab />}
      </div>
    </div>
  )
}
