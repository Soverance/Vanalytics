-- addon-ashita/vanalytics/vanalytics.lua
--
-- Vanalytics — Ashita v4 entry point.
--
-- This is the NEW, thin Ashita-native entry. The actual addon logic lives in
-- core.lua (a verbatim copy of the original Windower `vanalytics.lua`) plus the
-- 11 verbatim helper modules. Those modules are written against the Windower
-- API, so before requiring them we install a Windower-compatibility environment
-- (compat/bootstrap.lua) that provides the global `windower` table and preloads
-- Ashita-backed shims for every Windower stdlib the modules require().
--
-- Responsibilities of THIS file:
--   * Declare the Ashita addon manifest (addon.name/author/version).
--   * Put the addon directory on package.path so `require('compat.x')`,
--     `require('core')` and the helper modules resolve.
--   * Load the compat bootstrap, then core.lua (which registers Windower events
--     against the compat dispatcher).
--   * Register the real Ashita events and translate each one into the Windower
--     event the modules expect (`windower.fire(name, ...)`).
--   * Derive the events Ashita has no primitive for — 'login', 'logout' and
--     'zone change' — from per-frame player/zone state transitions.
--   * Render the ImGui overlays (texts/images shims) once per frame.
--
-- See PORTING.md for the full Windower->Ashita decision log.

addon.name    = 'Vanalytics'
addon.author  = 'Soverance'
addon.version = '1.0.0'

-- Ashita's shared 'common' lib is a convenience only; we don't depend on it,
-- so don't let its absence block loading.
pcall(require, 'common')

-- ---------------------------------------------------------------------------
-- Make the addon directory importable (Ashita may not add our subfolders).
-- ---------------------------------------------------------------------------
do
    local base = (type(addon) == 'table' and addon.path) or '.\\'
    base = base:gsub('/', '\\')
    if base:sub(-1) ~= '\\' then base = base .. '\\' end
    package.path = base .. '?.lua;'
                .. base .. '?\\init.lua;'
                .. package.path
end

-- ---------------------------------------------------------------------------
-- Install the Windower-compat environment, then load the verbatim addon.
-- Order matters: bootstrap sets global `windower`/`_addon` and preloads the
-- shim libs BEFORE core.lua (and its requires) run.
-- ---------------------------------------------------------------------------
require('compat.bootstrap')

local windower = _G.windower
local texts    = require('texts')
local images   = require('images')

-- LuaJIT (Ashita) exposes the global `unpack`; 5.2+ moved it to table.unpack.
local table_unpack = table.unpack or unpack

-- Requiring core.lua runs the original addon top-level code and registers all
-- of its Windower event handlers ('load', 'prerender', 'incoming chunk', ...)
-- against the compat dispatcher (windower.register_event).
require('core')

-- ---------------------------------------------------------------------------
-- Derived-event state.
--
-- Windower emits 'login', 'logout' and 'zone change'; Ashita has no equivalent
-- primitives, so we synthesise them from transitions in player/zone state that
-- we sample every frame in d3d_present.
-- ---------------------------------------------------------------------------
local state = {
    seeded      = false,   -- have we captured the initial baseline yet?
    logged_in   = false,
    zone        = 0,
    char_name   = '',
}

local function poll_derived_events()
    local ok, info = pcall(function() return windower.ffxi.get_info() end)
    if not ok or type(info) ~= 'table' then return end

    local logged_in = info.logged_in and true or false
    local zone      = tonumber(info.zone) or 0

    local name = ''
    if logged_in then
        local okp, player = pcall(function() return windower.ffxi.get_player() end)
        if okp and type(player) == 'table' and player.name then
            name = player.name
        end
    end

    -- First frame after load: capture the baseline WITHOUT firing anything.
    -- core.lua's own 'load' handler already covers the already-logged-in case
    -- (it starts the sync timer), so firing 'login' here would double up.
    if not state.seeded then
        state.seeded    = true
        state.logged_in = logged_in
        state.zone      = zone
        state.char_name = name
        return
    end

    -- Login / logout transitions.
    if logged_in and not state.logged_in then
        state.logged_in = true
        state.char_name = name
        state.zone      = zone
        windower.fire('login', name)
        return
    elseif (not logged_in) and state.logged_in then
        state.logged_in = false
        state.char_name = ''
        state.zone      = zone
        windower.fire('logout')
        return
    end

    -- Zone-change transition (only while logged in, ignore transient 0).
    if logged_in and zone ~= 0 and zone ~= state.zone then
        state.zone = zone
        windower.fire('zone change')
    elseif zone ~= 0 then
        state.zone = zone
    end
end

-- ---------------------------------------------------------------------------
-- Real Ashita events -> Windower dispatcher.
-- ---------------------------------------------------------------------------

ashita.events.register('load', 'va_load', function()
    windower.fire('load')
end)

ashita.events.register('unload', 'va_unload', function()
    windower.fire('unload')
end)

-- Per-frame: derive login/logout/zone, run the addon's prerender work, then
-- draw the overlays. core.lua's 'prerender' handler already pumps async_http
-- and the sync timer, so we must NOT call async_http.poll() here.
ashita.events.register('d3d_present', 'va_present', function()
    poll_derived_events()
    windower.fire('prerender')
    -- Overlays render last so they reflect this frame's state updates.
    local ok = pcall(function() texts.render_all() end)
    if not ok then end
    pcall(function() images.render_all() end)
end)

-- Incoming packets. Ashita's e.data is the raw packet INCLUDING the 4-byte
-- header, matching Windower's `data` buffer, so the modules' byte offsets
-- (data:unpack('H', off+1)) are unchanged.
ashita.events.register('packet_in', 'va_packet_in', function(e)
    windower.fire('incoming chunk', e.id, e.data)
end)

-- Incoming text. Map Ashita's event fields onto Windower's 5-arg signature:
--   function(original, modified, original_mode, modified_mode, blocked)
ashita.events.register('text_in', 'va_text_in', function(e)
    windower.fire('incoming text',
        e.message,         -- original
        e.modifiedmessage, -- modified
        e.mode,            -- original_mode
        e.modifiedmode,    -- modified_mode
        e.blocked)         -- blocked
end)

-- Chat commands: /va and /vanalytics (and the // aliases Ashita strips to /).
ashita.events.register('command', 'va_command', function(e)
    local raw = e.command
    if type(raw) ~= 'string' then return end

    -- Tokenise on whitespace. This addon's arguments are single tokens
    -- (subcommand + an api key / interval), so a simple split is sufficient.
    local tokens = {}
    for tok in raw:gmatch('%S+') do
        tokens[#tokens + 1] = tok
    end
    if #tokens == 0 then return end

    local head = tokens[1]:lower()
    if head ~= '/va' and head ~= '/vanalytics' then
        return
    end

    -- Everything after the trigger: tokens[2] = subcommand, rest = args.
    local subcommand = tokens[2] or 'help'
    local args = {}
    for i = 3, #tokens do
        args[#args + 1] = tokens[i]
    end

    e.blocked = true
    windower.fire('addon command', subcommand, table_unpack(args))
end)
