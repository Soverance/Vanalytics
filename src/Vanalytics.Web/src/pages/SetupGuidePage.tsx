import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

export default function SetupGuidePage() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Windower Addon Setup Guide</h1>
      <p className="text-gray-400 mb-8">
        Follow these steps to automatically sync your FFXI character data to Vana'lytics.
      </p>

      <div className="max-w-2xl">
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

        <Step number={2} title="Register Your Character">
          <p>
            Go to your{' '}
            <Link to="/characters" className="text-blue-400 hover:underline">
              Characters
            </Link>
            {' '}and add your character by entering your character name and server.
          </p>
          <p>
            Your character must be registered in Vana'lytics before the addon can sync data for it.
          </p>
        </Step>

        <Step number={3} title="Generate an API Key">
          <p>
            Go to your{' '}
            <Link to="/profile" className="text-blue-400 hover:underline">
              Profile &gt; API Keys
            </Link>
            {' '}tab and click <strong className="text-gray-200">Generate Key</strong>.
          </p>
          <p>
            Copy the key immediately — it will only be shown once. You'll paste this into the addon's
            configuration file in the next step.
          </p>
          {user?.hasApiKey && (
            <div className="rounded bg-green-900/30 border border-green-800 px-3 py-2 text-green-400">
              You already have an API key generated. If you've lost it, you can regenerate a new one
              from your profile.
            </div>
          )}
        </Step>

        <Step number={4} title="Install the Vanalytics Addon">
          <p>
            Copy the <code className="text-blue-300 bg-gray-800 px-1.5 py-0.5 rounded">vanalytics</code> addon
            folder into your Windower addons directory:
          </p>
          <CodeBlock>{`Windower4\\addons\\vanalytics\\
├── vanalytics.lua
└── settings.xml`}</CodeBlock>
          <p>
            The addon files can be downloaded from the Vana'lytics repository or provided by your
            server administrator.
          </p>
        </Step>

        <Step number={5} title="Configure Your API Key">
          <p>
            Open the settings file at:
          </p>
          <CodeBlock>{`Windower4\\addons\\vanalytics\\settings.xml`}</CodeBlock>
          <p>
            Paste your API key between the <code className="text-blue-300 bg-gray-800 px-1.5 py-0.5 rounded">&lt;ApiKey&gt;</code> tags:
          </p>
          <CodeBlock>{`<settings>
    <global>
        <ApiUrl>https://vanalytics.soverance.com</ApiUrl>
        <ApiKey>YOUR_API_KEY_HERE</ApiKey>
        <SyncInterval>15</SyncInterval>
    </global>
</settings>`}</CodeBlock>
          <p>
            The <code className="text-blue-300 bg-gray-800 px-1.5 py-0.5 rounded">SyncInterval</code> is
            how often (in minutes) the addon will automatically sync. The minimum is 5 minutes.
          </p>
        </Step>

        <Step number={6} title="Load the Addon in Windower">
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

        <Step number={7} title="Verify the Sync">
          <p>
            Run a manual sync to verify everything is working:
          </p>
          <CodeBlock>{`//vanalytics sync`}</CodeBlock>
          <p>
            If successful, you'll see a confirmation in chat. Your character data (jobs, gear, crafting
            skills) will now appear on your dashboard.
          </p>
          <p>
            You can also check the addon status at any time:
          </p>
          <CodeBlock>{`//vanalytics status`}</CodeBlock>
        </Step>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mt-4">
          <h3 className="text-lg font-semibold mb-3">Addon Commands Reference</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-gray-500">
                <th className="pb-2 font-medium">Command</th>
                <th className="pb-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              <tr className="border-b border-gray-800">
                <td className="py-2"><code className="text-blue-300">{'//vanalytics sync'}</code></td>
                <td className="py-2">Sync your character data immediately</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-2"><code className="text-blue-300">{'//vanalytics status'}</code></td>
                <td className="py-2">Show sync status and connection info</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-2"><code className="text-blue-300">{'//vanalytics interval <min>'}</code></td>
                <td className="py-2">Change auto-sync interval (minimum 5 minutes)</td>
              </tr>
              <tr>
                <td className="py-2"><code className="text-blue-300">{'//vanalytics help'}</code></td>
                <td className="py-2">Show available commands</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-600">
            You can also use the shorthand <code className="text-gray-500">{'//va'}</code> instead
            of <code className="text-gray-500">{'//vanalytics'}</code>.
          </p>
        </div>

        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-6 mt-6">
          <h3 className="text-lg font-semibold text-amber-400 mb-3">Troubleshooting</h3>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-gray-300">Sync says "Character does not have an active license"</dt>
              <dd className="text-gray-500 mt-1">
                Your character needs an active license for automatic syncing. Check your{' '}
                <Link to="/profile" className="text-blue-400 hover:underline">
                  Licensing tab
                </Link>{' '}
                for details.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-300">Sync says "Invalid API key"</dt>
              <dd className="text-gray-500 mt-1">
                Your API key may be incorrect or revoked. Generate a new one from your{' '}
                <Link to="/profile" className="text-blue-400 hover:underline">
                  Profile &gt; API Keys
                </Link>{' '}
                tab and update your settings.xml.
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
              <dt className="font-medium text-gray-300">Character not found</dt>
              <dd className="text-gray-500 mt-1">
                Make sure your character is registered on the{' '}
                <Link to="/characters" className="text-blue-400 hover:underline">
                  Characters
                </Link>{' '}
                with the exact name and server that matches your in-game character.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
