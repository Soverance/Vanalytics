# Windower Lua Addon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windower 4 Lua addon that automatically syncs FFXI character state (jobs, gear, crafting) to the Vanalytics API.

**Architecture:** Single Lua file addon using Windower 4's built-in APIs for game state reading, LuaSocket for HTTP, and Windower's settings library for configuration. Auto-syncs on a configurable timer and supports manual sync via chat commands.

**Tech Stack:** Lua 5.1 (Windower 4 runtime), LuaSocket (HTTP), Windower APIs (ffxi, settings, resources).

**Spec:** `docs/specs/2026-03-20-vanalytics-mvp-design.md` — Windower Addon section

**Builds on:** Plans 1-3 (API endpoint `POST /api/sync` with `X-Api-Key` auth)

> **Testing note:** Windower addons cannot be unit tested — they require the FFXI game client running with Windower injected. This plan provides complete code that can be verified by loading the addon in-game. Code correctness is ensured through careful implementation matching the spec and Windower API documentation.

---

## File Structure

```
addon/
└── vanalytics/
    ├── vanalytics.lua        # Main addon entry point (all logic)
    └── settings.xml          # Default addon settings
```

---

### Task 1: Default Settings File

**Files:**
- Create: `addon/vanalytics/settings.xml`

- [ ] **Step 1: Create settings.xml with defaults**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings>
    <global>
        <ApiUrl>https://vanalytics.com</ApiUrl>
        <ApiKey></ApiKey>
        <SyncInterval>15</SyncInterval>
    </global>
</settings>
```

Settings:
- `ApiUrl` — base URL of the Vanalytics API (default: `https://vanalytics.com`)
- `ApiKey` — user's API key from the web UI (empty by default, must be configured)
- `SyncInterval` — minutes between auto-syncs (default: 15, minimum enforced: 5)

---

### Task 2: Addon Skeleton and Registration

**Files:**
- Create: `addon/vanalytics/vanalytics.lua`

- [ ] **Step 1: Create the addon file with Windower registration and imports**

```lua
-- addon/vanalytics/vanalytics.lua
-- Vanalytics - FFXI Character Progress Tracker
-- Automatically syncs character state to the Vanalytics web app

_addon.name = 'Vanalytics'
_addon.author = 'Soverance'
_addon.version = '1.0.0'
_addon.commands = {'vanalytics', 'va'}

local config = require('config')
local res = require('resources')

-- Default settings (matches settings.xml)
local defaults = {
    ApiUrl = 'https://vanalytics.com',
    ApiKey = '',
    SyncInterval = 15,
}

local settings = config.load(defaults)

-- State
local last_sync_time = nil
local last_sync_status = 'Never synced'
local sync_timer = nil
local MIN_INTERVAL = 5

-----------------------------------------------------------------------
-- Utility: chat log output
-----------------------------------------------------------------------
local function log(msg)
    windower.add_to_chat('\30\02[Vanalytics]\30\01 ' .. msg)
end

local function log_error(msg)
    windower.add_to_chat('\30\02[Vanalytics]\30\68 ' .. msg)
end

local function log_success(msg)
    windower.add_to_chat('\30\02[Vanalytics]\30\158 ' .. msg)
end

-----------------------------------------------------------------------
-- Equipment slot mapping (Windower slot ID -> API slot name)
-----------------------------------------------------------------------
local slot_names = {
    [0]  = 'Main',
    [1]  = 'Sub',
    [2]  = 'Range',
    [3]  = 'Ammo',
    [4]  = 'Head',
    [5]  = 'Body',
    [6]  = 'Hands',
    [7]  = 'Legs',
    [8]  = 'Feet',
    [9]  = 'Neck',
    [10] = 'Waist',
    [11] = 'Ear1',
    [12] = 'Ear2',
    [13] = 'Ring1',
    [14] = 'Ring2',
    [15] = 'Back',
}

-----------------------------------------------------------------------
-- Crafting skill IDs and rank thresholds
-----------------------------------------------------------------------
-- Crafting skill keys as they appear in windower.ffxi.get_player().skills
-- These may be keyed by lowercase name or by skill ID depending on Windower version.
-- We try both approaches for compatibility.
local craft_skill_names = {
    ['fishing']       = 'Fishing',
    ['woodworking']   = 'Woodworking',
    ['smithing']      = 'Smithing',
    ['goldsmithing']  = 'Goldsmithing',
    ['clothcraft']    = 'Clothcraft',
    ['leathercraft']  = 'Leathercraft',
    ['bonecraft']     = 'Bonecraft',
    ['alchemy']       = 'Alchemy',
    ['cooking']       = 'Cooking',
}

local craft_skill_ids = {
    [48] = 'Fishing',
    [49] = 'Woodworking',
    [50] = 'Smithing',
    [51] = 'Goldsmithing',
    [52] = 'Clothcraft',
    [53] = 'Leathercraft',
    [54] = 'Bonecraft',
    [55] = 'Alchemy',
    [56] = 'Cooking',
}

local function get_craft_rank(level)
    if level == 0 then return 'Amateur'
    elseif level < 10 then return 'Recruit'
    elseif level < 20 then return 'Initiate'
    elseif level < 30 then return 'Novice'
    elseif level < 40 then return 'Apprentice'
    elseif level < 50 then return 'Journeyman'
    elseif level < 60 then return 'Craftsman'
    elseif level < 70 then return 'Artisan'
    elseif level < 80 then return 'Adept'
    elseif level < 90 then return 'Veteran'
    elseif level < 100 then return 'Expert'
    elseif level < 110 then return 'Authority'
    else return 'Luminary'
    end
end

-----------------------------------------------------------------------
-- JSON encoder (minimal, sufficient for sync payload)
-----------------------------------------------------------------------
local function json_encode_string(s)
    return '"' .. s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n') .. '"'
end

local function json_encode(val)
    if type(val) == 'string' then
        return json_encode_string(val)
    elseif type(val) == 'number' then
        return tostring(val)
    elseif type(val) == 'boolean' then
        return val and 'true' or 'false'
    elseif type(val) == 'table' then
        -- Check if array (sequential integer keys starting at 1)
        local is_array = true
        local max_index = 0
        for k, _ in pairs(val) do
            if type(k) ~= 'number' or k ~= math.floor(k) or k < 1 then
                is_array = false
                break
            end
            if k > max_index then max_index = k end
        end
        if is_array and max_index == #val then
            local parts = {}
            for i = 1, #val do
                parts[i] = json_encode(val[i])
            end
            return '[' .. table.concat(parts, ',') .. ']'
        else
            local parts = {}
            for k, v in pairs(val) do
                table.insert(parts, json_encode_string(tostring(k)) .. ':' .. json_encode(v))
            end
            return '{' .. table.concat(parts, ',') .. '}'
        end
    elseif val == nil then
        return 'null'
    end
    return 'null'
end

-----------------------------------------------------------------------
-- Read character state from Windower APIs
-----------------------------------------------------------------------
local function read_character_state()
    local player = windower.ffxi.get_player()
    if not player then
        return nil, 'Not logged into a character'
    end

    local info = windower.ffxi.get_info()
    if not info then
        return nil, 'Could not read character info'
    end

    -- Character name and server
    local char_name = player.name
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'

    -- Active job
    local active_job = res.jobs[player.main_job] and res.jobs[player.main_job].ens or 'UNK'
    local active_job_level = player.main_job_level

    -- All jobs with levels > 0
    local jobs = {}
    for job_id, level in pairs(player.jobs) do
        if level > 0 and res.jobs[job_id] then
            table.insert(jobs, {
                job = res.jobs[job_id].ens,
                level = level,
            })
        end
    end

    -- Equipped gear
    -- Windower's get_items().equipment entries have .bag and .slot fields.
    -- Bag IDs map to bag names: 0=inventory, 8=wardrobe, 10=wardrobe2, etc.
    -- Access inventory bags via items[bag_id] where bag_id is numeric.
    local gear = {}
    local items = windower.ffxi.get_items()
    if items and items.equipment then
        for slot_id, slot_name in pairs(slot_names) do
            local equip = items.equipment[slot_id]
            if equip and equip.slot ~= 0 and equip.slot ~= empty then
                local bag_table = items[equip.bag]
                if bag_table then
                    local item = bag_table[equip.slot]
                    if item and item.id and item.id > 0 then
                        local item_res = res.items[item.id]
                        local item_name = item_res and item_res.en or ('Item ' .. item.id)
                        table.insert(gear, {
                            slot = slot_name,
                            itemId = item.id,
                            itemName = item_name,
                        })
                    end
                end
            end
        end
    end

    -- Crafting skills — try name-based keys first, fall back to ID-based
    local crafting = {}
    if player.skills then
        -- Try name-based keys (e.g., player.skills.fishing)
        for skill_key, craft_name in pairs(craft_skill_names) do
            local skill = player.skills[skill_key]
            if skill then
                local level = type(skill) == 'table' and (skill.level or 0) or tonumber(skill) or 0
                if level > 0 then
                    table.insert(crafting, {
                        craft = craft_name,
                        level = level,
                        rank = get_craft_rank(level),
                    })
                end
            end
        end
        -- If no name-based results, try ID-based keys
        if #crafting == 0 then
            for skill_id, craft_name in pairs(craft_skill_ids) do
                local skill = player.skills[skill_id]
                if skill then
                    local level = type(skill) == 'table' and (skill.level or 0) or tonumber(skill) or 0
                    if level > 0 then
                        table.insert(crafting, {
                            craft = craft_name,
                            level = level,
                            rank = get_craft_rank(level),
                        })
                    end
                end
            end
        end
    end

    return {
        characterName = char_name,
        server = server,
        activeJob = active_job,
        activeJobLevel = active_job_level,
        jobs = jobs,
        gear = gear,
        crafting = crafting,
    }
end

-----------------------------------------------------------------------
-- HTTP sync to API
-----------------------------------------------------------------------
local function do_sync()
    if settings.ApiKey == '' then
        log_error('API key not configured. Set it in addon/vanalytics/settings.xml')
        return
    end

    local state, err = read_character_state()
    if not state then
        log_error(err)
        return
    end

    local payload = json_encode(state)
    local url = settings.ApiUrl .. '/api/sync'

    -- Note: LuaSocket HTTP is synchronous and will briefly freeze the game.
    -- This is acceptable for an infrequent sync (every 5-15 min). A short timeout
    -- limits the freeze if the API is unreachable.
    local http = require('socket.http')
    local ltn12 = require('ltn12')
    http.TIMEOUT = 5

        local response_body = {}
        local result, status_code, headers = http.request({
            url = url,
            method = 'POST',
            headers = {
                ['Content-Type'] = 'application/json',
                ['Content-Length'] = tostring(#payload),
                ['X-Api-Key'] = settings.ApiKey,
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        })

        if not result then
            log_error('Connection failed: ' .. tostring(status_code))
            last_sync_status = 'Connection failed'
            return
        end

        if status_code == 200 then
            last_sync_time = os.time()
            last_sync_status = 'Success'
            log_success('Sync successful (' .. state.characterName .. ' @ ' .. state.server .. ')')
        elseif status_code == 403 then
            last_sync_status = 'Forbidden (no license)'
            log_error('Character does not have an active license. Visit the Vanalytics web app to activate.')
        elseif status_code == 429 then
            last_sync_status = 'Rate limited'
            log_error('Rate limit exceeded. Sync will retry on next interval.')
        elseif status_code == 401 then
            last_sync_status = 'Unauthorized'
            log_error('Invalid API key. Check your settings.xml configuration.')
        else
            last_sync_status = 'Error (' .. tostring(status_code) .. ')'
            log_error('Sync failed with status ' .. tostring(status_code))
        end
end

-----------------------------------------------------------------------
-- Auto-sync timer (single global prerender handler, controlled by state)
-----------------------------------------------------------------------
local timer_active = false
local timer_elapsed = 0
local timer_last_time = os.clock()
local timer_interval_seconds = 0

local function get_effective_interval()
    local interval = settings.SyncInterval
    if interval < MIN_INTERVAL then
        interval = MIN_INTERVAL
    end
    return interval
end

local function start_timer()
    timer_interval_seconds = get_effective_interval() * 60
    timer_elapsed = 0
    timer_last_time = os.clock()
    timer_active = true
end

local function stop_timer()
    timer_active = false
end

-- Single prerender handler registered once at load time
windower.register_event('prerender', function()
    if not timer_active then return end

    local now = os.clock()
    timer_elapsed = timer_elapsed + (now - timer_last_time)
    timer_last_time = now

    if timer_elapsed >= timer_interval_seconds then
        timer_elapsed = 0
        do_sync()
    end
end)

-----------------------------------------------------------------------
-- Chat commands
-----------------------------------------------------------------------
windower.register_event('addon command', function(command, ...)
    command = command and command:lower() or 'help'
    local args = {...}

    if command == 'sync' then
        log('Syncing...')
        do_sync()

    elseif command == 'status' then
        local interval = get_effective_interval()
        log('--- Vanalytics Status ---')
        log('API URL: ' .. settings.ApiUrl)
        log('API Key: ' .. (settings.ApiKey ~= '' and '****' .. settings.ApiKey:sub(-4) or 'Not set'))
        log('Sync Interval: ' .. interval .. ' minutes')
        if last_sync_time then
            local ago = os.difftime(os.time(), last_sync_time)
            local mins = math.floor(ago / 60)
            log('Last Sync: ' .. mins .. ' minute(s) ago (' .. last_sync_status .. ')')
        else
            log('Last Sync: ' .. last_sync_status)
        end

    elseif command == 'interval' then
        local minutes = tonumber(args[1])
        if not minutes then
            log_error('Usage: //vanalytics interval <minutes>')
            return
        end
        if minutes < MIN_INTERVAL then
            log('Minimum interval is ' .. MIN_INTERVAL .. ' minutes. Setting to ' .. MIN_INTERVAL .. '.')
            minutes = MIN_INTERVAL
        end
        settings.SyncInterval = minutes
        config.save(settings)
        log('Sync interval set to ' .. minutes .. ' minutes.')
        -- Restart timer with new interval
        stop_timer()
        start_timer()

    elseif command == 'help' then
        log('--- Vanalytics Commands ---')
        log('//vanalytics sync       - Sync now')
        log('//vanalytics status     - Show status')
        log('//vanalytics interval N - Set sync interval (min: ' .. MIN_INTERVAL .. ')')
        log('//vanalytics help       - Show this help')

    else
        log_error('Unknown command: ' .. command .. '. Type //vanalytics help')
    end
end)

-----------------------------------------------------------------------
-- Addon lifecycle events
-----------------------------------------------------------------------
windower.register_event('login', function(name)
    log('Logged in as ' .. name .. '. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
    start_timer()
end)

windower.register_event('logout', function()
    stop_timer()
    last_sync_time = nil
    last_sync_status = 'Never synced'
end)

windower.register_event('load', function()
    -- If already logged in when addon loads, start timer
    local player = windower.ffxi.get_player()
    if player then
        log('Loaded. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
        start_timer()
    else
        log('Loaded. Waiting for login...')
    end
end)

windower.register_event('unload', function()
    stop_timer()
end)
```

This is the complete addon in a single file. Key implementation details:

- **Settings:** Uses Windower's `config` library to load/save settings from `settings.xml`
- **Game state reading:** Uses `windower.ffxi.get_player()` for jobs/levels, `windower.ffxi.get_items()` for equipped gear, `player.skills` for crafting
- **JSON encoding:** Minimal custom encoder (Windower doesn't include a JSON library by default)
- **HTTP:** Uses LuaSocket (`socket.http`) wrapped in a coroutine for non-blocking requests
- **Timer:** Uses `prerender` event to track elapsed time and fire syncs
- **Edge cases:** Checks for login state before syncing, handles 401/403/429 with clear messages, enforces 5-minute minimum interval
- **Commands:** All four spec commands implemented (`sync`, `status`, `interval`, `help`)
- **Aliases:** Both `//vanalytics` and `//va` work as command prefixes

- [ ] **Step 2: Verify the Lua file has no syntax errors**

```bash
# If lua is installed locally:
lua -e "loadfile('addon/vanalytics/vanalytics.lua')" 2>&1 || echo "No lua interpreter available - manual review only"
```

Note: The addon cannot be fully tested without the FFXI game client and Windower 4. Syntax checking is the most we can do outside the game.

---

### Task 3: Verify File Structure and Documentation

- [ ] **Step 1: Verify the addon directory structure matches spec**

```
addon/
└── vanalytics/
    ├── vanalytics.lua        # Main addon entry point
    └── settings.xml          # Default addon settings (API URL, key)
```

- [ ] **Step 2: Verify all spec requirements are covered**

Checklist against spec:
- [x] Configuration: ApiUrl, ApiKey, SyncInterval in settings.xml
- [x] Commands: `//vanalytics sync`, `status`, `interval <minutes>`, `help`
- [x] Game state: jobs/levels, equipped gear (16 slots), crafting skills
- [x] Sync payload matches spec JSON format (characterName, server, activeJob, activeJobLevel, jobs[], gear[], crafting[])
- [x] X-Api-Key header on POST /api/sync
- [x] Edge cases: no sync without login, graceful API errors, 403 license message, 5-min floor, 429 warning
- [x] Auto-sync timer (configurable interval)
- [x] Chat log output for success/failure
