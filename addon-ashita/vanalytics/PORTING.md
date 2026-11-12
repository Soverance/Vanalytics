# Vanalytics — Windower → Ashita v4 port

This folder (`addon-ashita/vanalytics/`) is an Ashita v4 port of the Windower
addon in `addon/vanalytics/`. The Windower original is **unchanged** and remains
the reference implementation.

The port is **wire-compatible** with the Vanalytics web API: every endpoint,
payload shape, header (`Content-Type: application/json`, `X-Api-Key`) and field
name is identical to the Windower addon, because the addon's business logic runs
**verbatim** on top of a Windower-compatibility shim layer.

> **Status:** all 27 Lua files parse (LuaJIT/5.1-compatible). The addon has NOT
> been run against a live HorizonXI/Ashita client or the Vanalytics backend.
> See **“Needs in-game verification”** below before trusting a first run.

---

## 1. Architecture: a Windower-compat shim layer

Rather than rewrite ~300 KB of untestable Lua, the port keeps the original
modules byte-for-byte and satisfies their Windower dependencies with Ashita-backed
shims. This guarantees the payloads and control flow the live server already
accepts are preserved exactly.

```
vanalytics.lua        NEW  — Ashita entry: manifest + real event wiring
core.lua              COPY — verbatim original vanalytics.lua (3,679 lines)
session.lua           COPY \
macros.lua            COPY  |
moves.lua             COPY  |
inventory.lua         COPY  |  verbatim Windower helper modules,
progression.lua       COPY  |  unmodified
missions.lua          COPY  |
collection.lua        COPY  |
blueprint.lua         COPY  |
extdata_util.lua      COPY  |
porter.lua            COPY /
async_http.lua        NEW  — transport selector (socket+ssl → else WinHTTP)
async_http_socket.lua COPY — verbatim original async_http.lua (LuaSocket/LuaSec)
async_http_winhttp.lua NEW — FFI WinHTTP transport, same public API
compat/               NEW  — Ashita-backed Windower shims (see below)
pill_alive.png etc.   COPY — original assets
```

### The compat layer (`compat/`)

| File | Replaces (Windower) | Notes |
|------|---------------------|-------|
| `bootstrap.lua` | — | Sets global `windower`, `_addon`; preloads the shim libs into `package.loaded` so `require('config')` etc. resolve to our shims. Installs `string:pack/:unpack`. |
| `windower.lua`  | `windower.*` core | Chat, event dispatcher, `ffxi.*`, `packets.inject_outgoing`, paths, `fs`, `play_sound` (WinMM via FFI). |
| `ffxi.lua`      | `windower.ffxi.*` | Adapters over `AshitaCore:GetMemoryManager()` / `GetEntity()` — `get_player`, `get_items`, `get_info`, `get_mob_*`, `get_spells`, `get_key_items`. |
| `resources.lua` | `resources` lib | `res.items/spells/zones/servers/titles` via `GetResourceManager()`. |
| `pack.lua`      | `pack` lib | `string:unpack`/`string.pack` Windower-style format codes. |
| `packets.lua`   | `packets` lib | Targeted `packets.parse` for the packets the addon reads (0x0F4 widescan, 0x056 missions) + inject passthrough. |
| `config.lua`    | `config` + `settings.xml` | `config.load/save` → `config/settings.lua`. |
| `texts.lua`     | `texts` lib | ImGui-backed text overlays with the `${key|default}` template engine. |
| `images.lua`    | `images` lib | ImGui-backed overlays; pills drawn as colored rects. |
| `extdata.lua`   | `extdata` lib | Item extdata decode — linkshell fully ported; **augments stubbed**. |
| `slips.lua` + `slips_data.lua` | `slips` lib | Porter Moogle slip decode reimplemented in plain Lua. |

---

## 2. Windower → Ashita event mapping

The entry (`vanalytics.lua`) registers real Ashita events and forwards them to
the Windower dispatcher (`windower.fire(name, ...)`), which invokes the handlers
`core.lua` registered via `windower.register_event`.

| Windower event | Ashita source | How |
|----------------|---------------|-----|
| `load` | `load` | direct |
| `unload` | `unload` | direct |
| `prerender` | `d3d_present` | direct (overlays rendered right after) |
| `incoming chunk` | `packet_in` | fires `(e.id, e.data)`; `e.data` includes the 4-byte header, so the modules' byte offsets are unchanged |
| `incoming text` | `text_in` | fires `(message, modifiedmessage, mode, modifiedmode, blocked)` |
| `addon command` | `command` | parses `/va` and `/vanalytics`, splits args, fires `(subcommand, ...)`, sets `e.blocked` |
| `login` | **derived** | player-presence transition (`get_info().logged_in` false→true) sampled each `d3d_present` |
| `logout` | **derived** | player-presence transition true→false |
| `zone change` | **derived** | `get_info().zone` changes to a new non-zero id |

**Why derived, not packet-driven:** Ashita has no `login`/`logout`/`zone change`
primitives. Deriving from `get_info()` state transitions is simpler and more
robust than reconstructing them from raw packets, and it reuses the same
`AshitaCore` state the rest of the addon reads. On the **first** `d3d_present`
after load we only capture a baseline (no event fires) so a `/addon reload` while
already logged in doesn't double-fire `login` — `core.lua`'s own `load` handler
already covers the already-logged-in case.

**No double-poll:** `core.lua`'s `prerender` handler already calls
`async_http.poll()` and drives the sync timer, so the entry does **not** call
`poll()` itself; it only renders overlays after firing `prerender`.

---

## 3. HTTP transport (`async_http.lua`)

The original uses LuaSocket + LuaSec (`require('socket')` / `require('ssl')`)
with a non-blocking, per-frame coroutine `poll()`. Ashita's LuaJIT environment
does not reliably ship luasocket/luasec, and TLS is required (endpoints are
`https`).

`async_http.lua` is now a **selector**:

1. If real `socket` **and** `ssl` are `require`-able → use `async_http_socket.lua`
   (verbatim original, incremental yielding — best behavior).
2. Otherwise → use `async_http_winhttp.lua` (FFI **WinHTTP**; Windows handles TLS).

Both transports expose the identical public API and the same callback contract:
`callback(true, status, headers, body)` on success, `callback(nil, err)` on error.

**WinHTTP tradeoff:** each queued request is resolved **synchronously**, but only
**one request per `poll()` frame**, because calling back into Lua from WinHTTP's
async worker threads is unsafe. This can cause a brief per-request stall versus
the socket transport's byte-incremental yielding. Certificate errors are ignored
(`WINHTTP_OPTION_SECURITY_FLAGS`) to match the original `verify = 'none'`.

> `bootstrap.lua` deliberately does **not** preload fake `socket`/`ssl` modules,
> so the selector's probe correctly detects their real absence.

---

## 4. What was STUBBED (functionally reduced)

These emit valid, safe data but are not full reproductions. Gear/character sync
still works; only the noted extras are absent.

- **Item augments** (`compat/extdata.lua`) — Windower's augment decoder relies on
  ~2,000 lines of lookup tables (`augments`, `augment_values`) that are infeasible
  to reproduce accurately offline. `extdata.decode()` returns items with **no
  augment strings**. Linkshell extdata decode **is** fully ported. To restore:
  port Windower's `extdata.lua` augment tables into `compat/extdata.lua`.
- **Merit points** (`compat/ffxi.lua`) — `get_player().merits` is left **empty**
  (`core.lua` treats empty as nil). Restore once the Ashita merit accessor is
  confirmed.
- **Job points / capacity points & master level** (`compat/ffxi.lua`) — guarded,
  default to `0` if the Ashita accessor names differ from what's assumed.

---

## 5. Needs in-game verification (`VERIFY:` in the code)

All of these are `pcall`-guarded so a wrong guess **degrades gracefully** instead
of crashing, but they should be confirmed on a live HorizonXI client. Highest
correctness risk first:

1. **`info.server` (world id)** — `compat/ffxi.lua` `get_info()`. The web contract
   keys characters by **name + server**, so a wrong/zero server id would create
   duplicate/misattributed characters. Ashita has no clean “world id”; we try
   player/party server-id accessors, then a retail world-id map
   (`compat/resources.lua`), else `0`. **Confirm this returns the correct value on
   HorizonXI** (private servers often report a non-retail id).
2. **Linkshell item type** — `compat/resources.lua` maps `item.type == 6`
   (Windower “Linkshell”) from Ashita `item.Type`. Verify Ashita's type numbering.
3. **Equipped-linkshell detection** — `compat/ffxi.lua` item status/flags mapping
   (Windower `status == 19`). Verify against Ashita inventory item flags.
4. **Equipment slot decode** — `compat/ffxi.lua` `.Index` is assumed to pack
   `container << 8 | slot`. Verify.
5. **Spells / key items** — `get_spells` assumes `HasSpell(id)`; `get_key_items`
   assumes a bit-table accessor. Verify method names.
6. **Macro book / menu state** — `get_info().macro_book` / `menu_open` accessor
   names (used by macro sync).
7. **Entity flags** — `get_mob_*` `valid_target`/rendered flag bit meanings.
8. **Packet offsets** — 0x061 char-stats, 0x0F4 widescan, 0x056 missions are read
   with Windower `fields.lua` offsets; Ashita `packet_in` `e.data` includes the
   4-byte header, so offsets should match. Sanity-check the first parsed values.
9. **Overlays** — `texts`/`images` are ImGui approximations (see §7).

---

## 6. Configuration (ApiUrl / ApiKey)

Settings moved from Windower's `settings.xml` to a Lua file written by the
`config` shim:

```
addon-ashita/vanalytics/config/settings.lua
```

Keys are unchanged: `ApiUrl`, `ApiKey`, `SyncInterval`, `NotifyOnSync`,
`macro_hashes`, `HuntEnabled`, `Hunt*Pos`, `HuntSoundEnabled`, `HuntNmPinned`,
`AugmentBackfillDone`. Defaults are baked into `core.lua`
(`ApiUrl = https://vanalytics.soverance.com`, `ApiKey = ''`).

Set the API key in-game after loading the addon:

```
/addon load vanalytics
/vanalytics apikey <your-key>
/vanalytics status
/vanalytics sync
```

Both `/va` and `/vanalytics` triggers work (and Ashita's `//` aliases).

---

## 7. UI (texts / images) approximations

Windower's `texts`/`images` have no Ashita equivalent, so they're reimplemented
with ImGui (`require('imgui')`) drawn from `d3d_present`:

- **Text overlays** (`compat/texts.lua`): per-object ImGui window; supports the
  `${key|default}` template engine, show/hide/update/color/position, translucent
  black background, per-object font scale. **Not reproduced:** bold/italic/stroke
  styling. Uses `TextUnformatted` so `%` in HP text isn't treated as printf.
- **Images/pills** (`compat/images.lua`): the status pill is drawn as a solid
  colored rectangle (green when the path contains `alive`, red for `dead`) using
  an ImGui draw list, avoiding all D3D texture loading. The original
  `pill_alive.png` / `pill_dead.png` / `white_pixel.png` are still shipped for
  reference and in case a future revision loads real textures.

---

## 8. Assets & provenance

- `pill_alive.png`, `pill_dead.png`, `white_pixel.png`, `notify_NM.wav`,
  `notify_Standard.wav` — copied verbatim from the Windower addon.
- `compat/slips_data.lua` — the Porter Moogle slip catalog, downloaded verbatim
  from Windower's `Resources/resources_data/slips.lua` (BSD-licensed; header
  retained). `compat/slips.lua` reimplements the bit-unpack decode in plain Lua.

---

## 9. Verifying the port parses

From this folder (requires a Lua compiler; the code targets LuaJIT/5.1 but also
parses under 5.4):

```powershell
Get-ChildItem -Recurse -Filter *.lua |
  ForEach-Object { luac -p $_.FullName }
```

All 27 files must report no errors.
