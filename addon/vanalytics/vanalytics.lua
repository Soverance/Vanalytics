-- addon/vanalytics/vanalytics.lua
-- Vanalytics - FFXI Character Progress Tracker
-- Automatically syncs character state to the Vanalytics web app

_addon.name = 'Vanalytics'
_addon.author = 'Soverance'
_addon.version = '1.0.0'
_addon.commands = {'vanalytics', 'va'}

local config = require('config')
local res = require('resources')
require('pack')
local texts = require('texts')
local images = require('images')
local packets = require('packets')
local session = require('session')
local inventory = require('inventory')
local porter = require('porter')
local extdata_util = require('extdata_util')

-- Inventory item.status value for an equipped linkshell. Confirmed via
-- //va lsdump on a live client: equipped linkshells report status 19. Spare
-- pearls carried in a bag are not status 19, so they are excluded.
local EQUIPPED_LS_STATUSES = { [19] = true }
-- Equipped linkshells live in the main inventory bag.
local LS_BAGS = { 'inventory' }

-- Returns a list of { linkshellId, name, colorRgb, rank } for the character's
-- currently-equipped linkshells (0, 1 or 2 entries), or nil if none. Slot
-- (LS1 vs LS2) is intentionally not derived: player.linkshell_slot is the
-- active pearl's inventory index, not the 1/2 linkshell number, which is only
-- available in the equip packets (0x0C4/0x0E0) we don't capture.
local function collect_equipped_linkshells(player, items)
    if not player or not items then return nil end

    local found = {}
    for _, bag_key in ipairs(LS_BAGS) do
        local bag = items[bag_key]
        if bag then
            for _, item in pairs(bag) do
                if type(item) == 'table' and item.id and item.id > 0
                    and item.status and EQUIPPED_LS_STATUSES[item.status] then
                    local r = res.items[item.id]
                    if r and r.type == 6 then
                        local ls = extdata_util.decode_linkshell(item)
                        if ls then found[#found + 1] = ls end
                    end
                end
            end
        end
    end

    if #found == 0 then return nil end
    return found
end

local progression = require('progression')
local missions_lib = require('missions')
local collection_lib = require('collection')
local macro_lib = require('macros')
local moves_lib = require('moves')
local async_http = require('async_http')

-- Default settings (matches settings.xml)
local defaults = {
    ApiUrl = 'https://vanalytics.soverance.com',
    ApiKey = '',
    SyncInterval = 60,
    NotifyOnSync = true,
    macro_hashes = {},
    HuntEnabled = false,
    HuntTargetPos = { x = 10, y = 400 },
    HuntWidescanPos = { x = 180, y = 10 },
    HuntWatchPos = { x = 900, y = 350 },
    HuntSoundEnabled = true,
    HuntNmPos = { x = 1200, y = 50 },
    HuntNmPinned = false,
    -- One-time flag: forces a full inventory re-sync after upgrading to the
    -- augment-capture build so existing (unchanged) items backfill their augments.
    AugmentBackfillDone = false,
}

local settings = config.load(defaults)

-- State
local last_sync_time = nil
local last_sync_status = 'Never synced'
local sync_timer = nil
local MIN_INTERVAL = 5
local current_title_id = 0
local packet_stats = nil  -- populated from incoming packet 0x061
local playtime_seconds = nil  -- populated from incoming packet 0x00A

-----------------------------------------------------------------------
-- Utility: chat log output
-----------------------------------------------------------------------
local function log(msg)
    windower.add_to_chat(8, '[Vanalytics] ' .. msg)
end

local function log_error(msg)
    windower.add_to_chat(167, '[Vanalytics] ' .. msg)
end

local function log_success(msg)
    windower.add_to_chat(158, '[Vanalytics] ' .. msg)
end

-----------------------------------------------------------------------
-- HTTP helper. Non-blocking via async_http; the callback fires on a future
-- frame when the response (or error) is available. The game thread is
-- never blocked by network I/O.
--
-- params shape:
--   url, method, headers, body (string), timeout, label
-- callback signature:
--   (ok, status_or_err, headers, body)
--     ok = true on HTTP response received, nil on connection failure
--     status_or_err = numeric HTTP status (on success) or labeled error string
--     headers = lowercased response header table
--     body = response body string
-----------------------------------------------------------------------
local function http_request(params, callback)
    async_http.request(params, callback)
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
    ['synergy']       = 'Synergy',
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
    [57] = 'Synergy',
}

-----------------------------------------------------------------------
-- Combat, magic, and automaton skill maps
-- Name-based keys match windower.ffxi.get_player().skills (lowercase).
-- ID-based keys are fallback for alternative Windower versions.
-----------------------------------------------------------------------
local combat_skill_names = {
    ['hand-to-hand']    = 'HandToHand',
    ['dagger']          = 'Dagger',
    ['sword']           = 'Sword',
    ['great sword']     = 'GreatSword',
    ['axe']             = 'Axe',
    ['great axe']       = 'GreatAxe',
    ['scythe']          = 'Scythe',
    ['polearm']         = 'Polearm',
    ['katana']          = 'Katana',
    ['great katana']    = 'GreatKatana',
    ['club']            = 'Club',
    ['staff']           = 'Staff',
    ['archery']         = 'Archery',
    ['marksmanship']    = 'Marksmanship',
    ['throwing']        = 'Throwing',
    ['guard']           = 'Guard',
    ['evasion']         = 'Evasion',
    ['shield']          = 'Shield',
    ['parrying']        = 'Parrying',
}

local magic_skill_names = {
    ['divine magic']        = 'DivineMagic',
    ['healing magic']       = 'HealingMagic',
    ['enhancing magic']     = 'EnhancingMagic',
    ['enfeebling magic']    = 'EnfeeblingMagic',
    ['elemental magic']     = 'ElementalMagic',
    ['dark magic']          = 'DarkMagic',
    ['summoning magic']     = 'SummoningMagic',
    ['ninjutsu']            = 'Ninjutsu',
    ['singing']             = 'Singing',
    ['stringed instrument'] = 'StringedInstrument',
    ['wind instrument']     = 'WindInstrument',
    ['blue magic']          = 'BlueMagic',
    ['geomancy']            = 'Geomancy',
    ['handbell']            = 'Handbell',
}

local automaton_skill_names = {
    ['automaton melee']   = 'AutomatonMelee',
    ['automaton archery'] = 'AutomatonArchery',
    ['automaton magic']   = 'AutomatonMagic',
}

local combat_skill_ids = {
    [1]  = 'HandToHand',
    [2]  = 'Dagger',
    [3]  = 'Sword',
    [4]  = 'GreatSword',
    [5]  = 'Axe',
    [6]  = 'GreatAxe',
    [7]  = 'Scythe',
    [8]  = 'Polearm',
    [9]  = 'Katana',
    [10] = 'GreatKatana',
    [11] = 'Club',
    [12] = 'Staff',
    [25] = 'Archery',
    [26] = 'Marksmanship',
    [27] = 'Throwing',
    [28] = 'Guard',
    [29] = 'Evasion',
    [30] = 'Shield',
    [31] = 'Parrying',
}

local magic_skill_ids = {
    [32] = 'DivineMagic',
    [33] = 'HealingMagic',
    [34] = 'EnhancingMagic',
    [35] = 'EnfeeblingMagic',
    [36] = 'ElementalMagic',
    [37] = 'DarkMagic',
    [38] = 'SummoningMagic',
    [39] = 'Ninjutsu',
    [40] = 'Singing',
    [41] = 'StringedInstrument',
    [42] = 'WindInstrument',
    [43] = 'BlueMagic',
    [44] = 'Geomancy',
    [45] = 'Handbell',
}

local automaton_skill_ids = {
    [22] = 'AutomatonMelee',
    [23] = 'AutomatonArchery',
    [24] = 'AutomatonMagic',
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
    -- Build output byte-by-byte to handle control chars efficiently
    local out = {}
    for i = 1, #s do
        local b = s:byte(i)
        if b == 0x5C then      -- backslash
            out[#out+1] = '\\\\'
        elseif b == 0x22 then  -- double quote
            out[#out+1] = '\\"'
        elseif b == 0x0A then  -- newline
            out[#out+1] = '\\n'
        elseif b == 0x0D then  -- carriage return
            out[#out+1] = '\\r'
        elseif b == 0x09 then  -- tab
            out[#out+1] = '\\t'
        elseif b < 0x20 then   -- other control chars
            out[#out+1] = string.format('\\u%04x', b)
        else
            out[#out+1] = s:sub(i, i)
        end
    end
    return '"' .. table.concat(out) .. '"'
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
-- JSON decoder (minimal, sufficient for API responses)
-----------------------------------------------------------------------
local json_decode
do
    local function skip_ws(s, pos)
        return s:match('^%s*()', pos)
    end

    local function decode_string(s, pos)
        -- pos should be right after opening "
        local result = {}
        local i = pos
        while i <= #s do
            local c = s:sub(i, i)
            if c == '"' then
                return table.concat(result), i + 1
            elseif c == '\\' then
                i = i + 1
                local esc = s:sub(i, i)
                if esc == '"' then table.insert(result, '"')
                elseif esc == '\\' then table.insert(result, '\\')
                elseif esc == '/' then table.insert(result, '/')
                elseif esc == 'n' then table.insert(result, '\n')
                elseif esc == 'r' then table.insert(result, '\r')
                elseif esc == 't' then table.insert(result, '\t')
                else table.insert(result, esc)
                end
                i = i + 1
            else
                table.insert(result, c)
                i = i + 1
            end
        end
        return table.concat(result), i
    end

    local function decode_value(s, pos)
        pos = skip_ws(s, pos)
        local c = s:sub(pos, pos)

        if c == '"' then
            return decode_string(s, pos + 1)
        elseif c == '{' then
            local obj = {}
            pos = skip_ws(s, pos + 1)
            if s:sub(pos, pos) == '}' then return obj, pos + 1 end
            while true do
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) ~= '"' then break end
                local key
                key, pos = decode_string(s, pos + 1)
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ':' then pos = pos + 1 end
                local val
                val, pos = decode_value(s, pos)
                obj[key] = val
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ',' then pos = pos + 1
                elseif s:sub(pos, pos) == '}' then pos = pos + 1; break
                end
            end
            return obj, pos
        elseif c == '[' then
            local arr = {}
            pos = skip_ws(s, pos + 1)
            if s:sub(pos, pos) == ']' then return arr, pos + 1 end
            while true do
                local val
                val, pos = decode_value(s, pos)
                table.insert(arr, val)
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ',' then pos = pos + 1
                elseif s:sub(pos, pos) == ']' then pos = pos + 1; break
                end
            end
            return arr, pos
        elseif s:sub(pos, pos + 3) == 'true' then
            return true, pos + 4
        elseif s:sub(pos, pos + 4) == 'false' then
            return false, pos + 5
        elseif s:sub(pos, pos + 3) == 'null' then
            return nil, pos + 4
        else
            -- number
            local num_str = s:match('^-?%d+%.?%d*[eE]?[+-]?%d*', pos)
            if num_str then
                return tonumber(num_str), pos + #num_str
            end
            return nil, pos + 1
        end
    end

    json_decode = function(s)
        if not s or s == '' then return nil end
        local val, _ = decode_value(s, 1)
        return val
    end
end

-----------------------------------------------------------------------
-- Macro sync functions
-----------------------------------------------------------------------
local function find_macro_path()
    local user_dir = windower.ffxi_path .. 'USER'
    -- Find the most recently modified content ID directory.
    local best_dir = nil

    local ok_lfs, lfs = pcall(require, 'lfs')
    if ok_lfs then
        local best_time = 0
        local entries = windower.get_dir(user_dir)
        if entries then
            for _, name in ipairs(entries) do
                local full = user_dir .. '\\' .. name
                local attr = lfs.attributes(full)
                if attr and attr.mode == 'directory' and (attr.modification or 0) > best_time then
                    best_time = attr.modification
                    best_dir = name
                end
            end
        end
    else
        -- Fallback for installs without LuaFileSystem. Spawns a brief
        -- cmd.exe window; acceptable in the rare-fallback case.
        local handle = io.popen('dir "' .. user_dir .. '" /b /ad /o-d 2>nul')
        if handle then
            -- First line is the most recently modified directory.
            best_dir = handle:read('*l')
            handle:close()
        end
    end

    if not best_dir then return nil end
    return user_dir .. '\\' .. best_dir
end

-- Migrate macro hash format from string to {local, remote} table
if settings.macro_hashes then
    for key, value in pairs(settings.macro_hashes) do
        if type(value) == 'string' then
            settings.macro_hashes[key] = { ['local'] = value, remote = '' }
        end
    end
end

-----------------------------------------------------------------------
-- Hunt: target overlay
-- In-game UI panel that mirrors the standard Windower `targetinfo` addon:
-- shows the current target's mob.index in both decimal and 3-digit hex,
-- the convention BG-wiki / LSB / community tools use for placeholder IDs
-- (e.g. "ID 157" = 0x157 = decimal 343).
-- Part of the `hunt` feature group, gated behind `settings.HuntEnabled`.
-----------------------------------------------------------------------
-- (Earlier had a prim-based HP bar here. Dropped — replaced by a third text
-- object stacked under the target stats. See hunt_target_hp_text.)
-----------------------------------------------------------------------
-- Target overlay is split into two stacked text objects so the mob name can
-- carry a different color/size/weight than the supporting stats. Only the
-- name is draggable; the stats sync to it each update tick. Saved position
-- (HuntTargetPos) tracks the name — stats derive from it.
local hunt_target_name_text = texts.new(
    '${name|---}',
    {
        pos = { x = settings.HuntTargetPos.x or 10, y = settings.HuntTargetPos.y or 400 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 14,
            alpha = 255,
            red = 210, green = 180, blue = 120,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = true, bold = true, italic = false },
    }
)
local hunt_target_stats_text = texts.new(
    '${idx_dec|-} | 0x${idx_hex|-} | st ${status|-} | hp ${hpp|-}% | claim ${claim|-}',
    {
        pos = { x = settings.HuntTargetPos.x or 10, y = (settings.HuntTargetPos.y or 400) + 32 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 130, green = 170, blue = 180,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = false, italic = false },
    }
)
-- HP bar — third stacked text under stats. Color shifts green/amber/red
-- based on current HP%. ASCII bar (10 cells = 10% granularity) replaces the
-- earlier prim-based bar which didn't render.
local hunt_target_hp_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntTargetPos.x or 10, y = (settings.HuntTargetPos.y or 400) + 72 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 130, green = 170, blue = 100,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = true, italic = false },
    }
)
-- Range line — fourth stacked object under the stats line. Shows edge-to-edge
-- distance, vertical (height) offset, and a range-band label; color shifts
-- green/gold/muted by band (see update_hunt_target_text). Separate object
-- because the texts library is one-color-per-object — same reason the HP bar
-- is split out. Initial pos is a placeholder; repositioned each tick.
local hunt_target_range_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntTargetPos.x or 10, y = (settings.HuntTargetPos.y or 400) + 56 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 130, green = 170, blue = 180,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = true, italic = false },
    }
)
hunt_target_name_text:hide()
hunt_target_stats_text:hide()
hunt_target_hp_text:hide()
hunt_target_range_text:hide()

-- Name is one line of size-14 bold + padding both sides. Stats block is one
-- size-10 line + padding. Heights used for vertical stacking of the four
-- target text objects (name → stats → range → hp bar). Mirrors the WATCH_* constants.
local TARGET_NAME_HEIGHT = 40
local TARGET_STATS_HEIGHT = 30  -- 1 line * ~18px + 12 padding
local TARGET_RANGE_HEIGHT = 30  -- 1 line * ~18px + 12 padding

-- Range bands in edge-to-edge yalms. Verified vs Windower DistancePlus and
-- FFXIclopedia <https://ffxiclopedia.fandom.com/wiki/Distance>. We subtract
-- model sizes before banding, so these fixed cutoffs are size-independent.
local MELEE_RANGE = 3.0   -- edge melee cutoff (TUNABLE — confirm in-game)
local CAST_RANGE  = 20.0  -- edge cast/action cutoff (21.8' center - ~1.8 models)
local HEIGHT_UP   = 8.5   -- vertical gate, target above you (DistancePlus)
local HEIGHT_DOWN = 7.5   -- vertical gate magnitude, target below you (DistancePlus)

local function hide_hunt_target_panel()
    hunt_target_name_text:hide()
    hunt_target_stats_text:hide()
    hunt_target_range_text:hide()
    hunt_target_hp_text:hide()
end

local function update_hunt_target_text()
    if not settings.HuntEnabled then return end
    local mob = windower.ffxi.get_mob_by_target('st')
        or windower.ffxi.get_mob_by_target('t')
    if not mob or not mob.id or mob.id == 0 then
        hide_hunt_target_panel()
        return
    end

    -- Distance / height / range band. Horizontal distance matches the game's
    -- range checks; subtracting both model sizes gives the edge-to-edge gap
    -- that actually governs whether an action lands. dz gates vertically.
    local range_str = '?'
    local rr, rg, rb = 150, 150, 150           -- muted gray = unknown / out of render
    local player = windower.ffxi.get_player()
    local self_mob = player and windower.ffxi.get_mob_by_id(player.id) or nil
    if self_mob and mob.x and self_mob.x then
        local dx = mob.x - self_mob.x
        local dy = mob.y - self_mob.y
        local dz = (mob.z or self_mob.z) - self_mob.z
        local center = math.sqrt(dx * dx + dy * dy)
        local edge = center - (mob.model_size or 0) - (self_mob.model_size or 0)
        if edge < 0 then edge = 0 end

        -- ASCII-safe directional arrows (^/v) chosen up front over the unicode
        -- arrows, which may not render through Windower's text path.
        local height_str
        if dz >= 0.5 then      height_str = string.format('^%.1f', dz)
        elseif dz <= -0.5 then height_str = string.format('v%.1f', -dz)
        else                   height_str = '~0.0' end

        local label
        if dz > HEIGHT_UP or dz < -HEIGHT_DOWN then
            label, rr, rg, rb = '[HEIGHT]', 190, 110, 110
        elseif edge <= MELEE_RANGE then
            label, rr, rg, rb = '[MELEE]', 130, 170, 100
        elseif edge <= CAST_RANGE then
            label, rr, rg, rb = '[CAST]', 210, 180, 120
        else
            label, rr, rg, rb = '[FAR]', 190, 110, 110
        end
        range_str = string.format('%.1fy  %s  %s', edge, height_str, label)
    end

    hunt_target_name_text:update({ name = mob.name or '?' })
    hunt_target_stats_text:update({
        idx_dec = tostring(mob.index or 0),
        idx_hex = string.format('%03X', mob.index or 0),
        status = tostring(mob.status or 0),
        hpp = tostring(mob.hpp or 0),
        claim = (mob.claim_id and mob.claim_id ~= 0) and tostring(mob.claim_id) or '-',
    })

    -- HP bar (text-based): 10-cell █/░ bar + numeric %. Color shifts as HP
    -- drops. Sits under the stats block, derived position.
    local hp = mob.hpp or 0
    if hp < 0 then hp = 0 elseif hp > 100 then hp = 100 end
    local filled = math.floor(hp / 10 + 0.5)
    -- Plain ASCII bar — unicode block chars (U+2588/U+2591) might not render
    -- through Windower's text path. '=' and '-' work everywhere.
    local bar = string.rep('=', filled) .. string.rep('-', 10 - filled)
    hunt_target_hp_text:update({ content = string.format('[%s] %3d%%', bar, hp) })
    if hp >= 75 then     hunt_target_hp_text:color(130, 170, 100)
    elseif hp >= 25 then hunt_target_hp_text:color(210, 180, 120)
    else                 hunt_target_hp_text:color(190, 110, 110) end

    hunt_target_range_text:update({ content = range_str })
    hunt_target_range_text:color(rr, rg, rb)

    -- Sync positions every tick: name → stats → range → hp bar.
    local nx, ny = hunt_target_name_text:pos_x(), hunt_target_name_text:pos_y()
    hunt_target_stats_text:pos(nx, ny + TARGET_NAME_HEIGHT)
    hunt_target_range_text:pos(nx, ny + TARGET_NAME_HEIGHT + TARGET_STATS_HEIGHT)
    hunt_target_hp_text:pos(nx, ny + TARGET_NAME_HEIGHT + TARGET_STATS_HEIGHT + TARGET_RANGE_HEIGHT)

    hunt_target_name_text:show()
    hunt_target_stats_text:show()
    hunt_target_range_text:show()
    hunt_target_hp_text:show()
end

-----------------------------------------------------------------------
-- Hunt: Wide Scan tracker overlay
-- Hooks incoming packet 0x0F4 (one per mob in the in-game Wide Scan
-- result) and renders a parallel panel that mirrors the game's native
-- list with each mob's index in 3-digit hex (matching the BG-wiki
-- convention) plus relative distance and 8-way compass direction.
--
-- Highlights the mob currently set as the in-game "Track" target
-- (windower.ffxi.get_mob_by_target('scan')) with a '>' prefix and a
-- tracking header line that shows live distance/direction as the player
-- moves. Discovered via the //va hunt probe recon — the 'scan' target
-- slot populates only after the user commits a Track action in-game.
--
-- Visibility:
--   * Shows when a Wide Scan burst (0x0F4 packets) just arrived. This
--     is the only signal the *user actually triggered Wide Scan*; any
--     other menu (inventory, status, chat) doesn't fire these packets,
--     so the panel won't appear unless it's relevant.
--   * Stays shown while tracking (get_mob_by_target('scan') is set),
--     so it persists as a navigation companion after Track closes the
--     map.
--   * Hidden the moment any menu closes (info.menu_open flips to
--     false). Closing the map dismisses the panel as expected, and
--     reopening any menu *without* re-scanning won't reshow it —
--     prevents the panel from being stale clutter.
--
-- Part of the `hunt` feature group, gated behind `settings.HuntEnabled`:
-- //va hunt on  -> both target overlay and this panel active
-- //va hunt off -> both hidden
-----------------------------------------------------------------------
local widescan_entries = {}        -- ordered array of {name, idx, x_off, y_off, seen_at}, in 0x0F4 arrival order (matches game's native list)
local widescan_index_map = {}      -- mob.index -> position in widescan_entries[]; lets us update-in-place on duplicates without changing list order
local last_widescan_packet = 0     -- os.clock() of most recent 0x0F4
local widescan_dirty = false       -- set true when panel needs re-render (only for non-tracking refresh; tracking forces re-render each frame for live distance)
local widescan_active = false      -- gates panel visibility: true after a 0x0F4 burst (user just triggered Wide Scan), cleared the moment any menu closes
local SCAN_RESET_GAP = 1.0         -- seconds; gap >= this before a new packet = new scan
local hunt_probe_counter = 0       -- incremented per //va hunt probe; resets on addon reload

-- Wide Scan is split into header (gold, includes tracking line + scan title)
-- and body (amber, scan rows). Same design pattern as target + watch panels.
-- Only the header is draggable; body re-syncs each tick.
local hunt_widescan_header_text = texts.new(
    '${content|Wide Scan (no data)}',
    {
        pos = { x = settings.HuntWidescanPos.x or 10, y = settings.HuntWidescanPos.y or 50 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 210, green = 180, blue = 120,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = true, bold = true, italic = false },
    }
)
local hunt_widescan_body_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntWidescanPos.x or 10, y = (settings.HuntWidescanPos.y or 50) + 24 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 200, green = 180, blue = 140,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = false, italic = false },
    }
)
hunt_widescan_header_text:hide()
hunt_widescan_body_text:hide()

-- Tracking text: separate text object so it can carry its own color/weight,
-- but position is now derived from the watch panel header (see
-- update_hunt_watch_text). Initial position doesn't matter — it gets
-- repositioned each tick when the watch panel updates.
local hunt_tracking_text = texts.new(
    '${content|}',
    {
        pos = { x = 0, y = 0 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 210, green = 180, blue = 120,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = true, bold = true, italic = false },
    }
)
hunt_tracking_text:hide()

-- Same per-line height as the watch panel — 14 caused overlap there too.
local WIDESCAN_LINE_HEIGHT = 18
local WIDESCAN_PANEL_PADDING = 6

local function hide_hunt_widescan_panel()
    hunt_widescan_header_text:hide()
    hunt_widescan_body_text:hide()
end

-- Convert (x_off, y_off) to an 8-way compass label.
-- FFXI convention: +X east, +Y north. If in-game testing shows N/S inverted,
-- flip the sign on y_off in the atan2 call below.
local DIR_LABELS = { 'E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE' }
local function direction_8(x_off, y_off)
    if not x_off or not y_off then return '?' end
    if x_off == 0 and y_off == 0 then return '·' end
    local angle = math.atan2(y_off, x_off)
    local sector = math.floor((angle + math.pi / 8) / (math.pi / 4)) % 8
    return DIR_LABELS[sector + 1]
end

local function distance_yards(x_off, y_off)
    if not x_off or not y_off then return 0 end
    return math.floor(math.sqrt(x_off * x_off + y_off * y_off) + 0.5)
end

-- Compute live distance + direction from the player to a tracked mob.
-- Returns strings ready for display. Falls back to '?' if any data is missing.
local function tracking_dist_dir(tracked_index)
    local tracked = windower.ffxi.get_mob_by_index(tracked_index)
    if not tracked or not tracked.x then return '?', '?' end
    local player = windower.ffxi.get_player()
    if not player then return '?', '?' end
    local self_mob = windower.ffxi.get_mob_by_id(player.id)
    if not self_mob or not self_mob.x then return '?', '?' end
    local dx = tracked.x - self_mob.x
    local dy = tracked.y - self_mob.y
    return string.format('%d', math.floor(math.sqrt(dx * dx + dy * dy) + 0.5)),
        direction_8(dx, dy)
end

local function build_widescan_panel(scan_target)
    -- Returns (header_str, body_str). Tracking line was extracted into its
    -- own hunt_tracking_text panel since it updates every frame whereas
    -- the wide scan list only refreshes on 0x0F4 packet bursts.
    if #widescan_entries == 0 then
        return 'Wide Scan (waiting for scan...)', ''
    end

    local body_lines = {}
    for _, e in ipairs(widescan_entries) do
        -- Prefix the tracked row with '>' so it stands out at a glance.
        local prefix = (scan_target and scan_target.index == e.idx) and '>' or ' '
        body_lines[#body_lines + 1] = string.format('%s %-18s 0x%03X %4dy %s',
            prefix, e.name or '?', e.idx,
            distance_yards(e.x_off, e.y_off),
            direction_8(e.x_off, e.y_off))
    end
    return string.format('=== Wide Scan (%d) ===', #widescan_entries),
           table.concat(body_lines, '\n')
end

-- Tracking display is rendered inline with the watch panel — see
-- update_hunt_watch_text below for the actual placement logic. Kept as its
-- own text object so it can carry a distinct color/weight, but position is
-- now derived from the watch header (no independent draggability).

local function update_hunt_widescan_text()
    if not settings.HuntEnabled then return end

    local info = windower.ffxi.get_info()
    local menu_open = info and info.menu_open
    local scan_target = windower.ffxi.get_mob_by_target('scan')

    -- Closing any menu deactivates the panel. Reopening a menu does NOT
    -- reactivate it — only a fresh widescan burst (handled in 0x0F4) does.
    -- This keeps the panel from appearing when the user opens inventory,
    -- chat, etc. but hasn't actually triggered a Wide Scan.
    if not menu_open then
        widescan_active = false
    end

    if not widescan_active and not scan_target then
        hide_hunt_widescan_panel()
        return
    end

    -- Re-render every frame when tracking (distance/direction change live);
    -- otherwise only when scan list contents changed.
    if scan_target or widescan_dirty then
        local header_str, body_str = build_widescan_panel(scan_target)
        hunt_widescan_header_text:update({ content = header_str })
        hunt_widescan_body_text:update({ content = body_str })
        widescan_dirty = false
    end

    -- Position sync runs every tick (not just on rebuild). Otherwise if the
    -- user drags either text object — or if draggable=false fails to actually
    -- block dragging — the body can detach from the header and never recover.
    local hx = hunt_widescan_header_text:pos_x()
    local hy = hunt_widescan_header_text:pos_y()
    local header_h = WIDESCAN_LINE_HEIGHT + WIDESCAN_PANEL_PADDING * 2
    hunt_widescan_body_text:pos(hx, hy + header_h)

    hunt_widescan_header_text:show()
    if #widescan_entries > 0 then hunt_widescan_body_text:show() else hunt_widescan_body_text:hide() end
end

-----------------------------------------------------------------------
-- Hunt: Watch list
-- Persistent per-zone list of mob indices we want to be alerted about.
-- Auto-populated when the user activates in-game Track on a mob (via
-- scan_target transition detection). Stays in place across kills — when
-- the watched slot respawns, fires an audio alert + chat log. Cleared
-- on zone change, //va hunt off, or //va hunt watch clear.
--
-- Sound classification uses an authoritative per-zone NM list fetched
-- from GET /api/zones/{id}/nm on zone change: names returned by that
-- endpoint play notify_NM.wav, all others play notify_Standard.wav.
-- If the API fetch fails (offline / down), all alerts default to the
-- standard sound and a warning is logged once.
-----------------------------------------------------------------------
local watch_list = {}                  -- ordered array of watch entries (see add_to_watch for shape)
local watch_index_map = {}             -- mob.index -> position in watch_list[]
local mob_info = {}                    -- name (string) -> { isNm = bool, respawn = seconds } for every distinct mob in current zone
local mob_info_zone = nil              -- zone_id mob_info was loaded for (nil = not loaded)
local last_scan_target_idx = nil       -- for nil->mob and A->B transition detection on auto-add

local function parse_mob_idx(s)
    -- Accepts decimal "343", hex "0x157" / "157h". Returns number or nil.
    if not s or s == '' then return nil end
    s = tostring(s):lower():gsub('h$', '')
    if s:sub(1, 2) == '0x' then return tonumber(s:sub(3), 16) end
    -- Treat any 3-char string with hex letters as hex (e.g. "1ab"); else decimal.
    if s:match('[a-f]') then return tonumber(s, 16) end
    return tonumber(s)
end

local function is_status_alive(status, hpp)
    if status == nil or hpp == nil then return false end
    return (status == 0 or status == 1 or status == 2) and hpp > 0
end

local function classify_as_nm(name)
    if not name then return false end
    local info = mob_info[name]
    return info ~= nil and info.isNm == true
end

local function get_respawn_seconds(name)
    if not name then return nil end
    local info = mob_info[name]
    return info and info.respawn or nil
end

local function get_spawn_type(name)
    if not name then return nil end
    local info = mob_info[name]
    return info and info.spawnType or nil
end

local function play_alert(is_nm)
    if not settings.HuntSoundEnabled then return end
    local wav = is_nm and 'notify_NM.wav' or 'notify_Standard.wav'
    windower.play_sound(windower.addon_path .. wav)
end

local function clear_watch_list()
    watch_list = {}
    watch_index_map = {}
end

local function rebuild_watch_index_map()
    watch_index_map = {}
    for i, e in ipairs(watch_list) do
        watch_index_map[e.idx] = i
    end
end

-- Adds a single mob index to the watch list. Returns true on insert, false if
-- already watched. name_hint is the baseline name used for the "* differs from
-- add" indicator and the log message — for live-mob adds it's the current name,
-- for curated-NM pre-watch it's the NM name we're hoping will pop in that slot.
--
-- IMPORTANT: last_name / last_status / last_hpp are all left nil. The poll
-- loop populates them on the first frame the mob is genuinely in client memory
-- and uses `last_* ~= nil` as the guard for transition detection — so a
-- pre-watch entry doesn't false-alert when the slot currently holds the PH
-- under a different name than `name_hint`, and a Track-added entry doesn't
-- false-fire on first frame from garbage status/hpp read out of range.
local function add_index_to_watch(idx, name_hint)
    if not idx then return false end
    if watch_index_map[idx] then return false end
    local entry = {
        idx        = idx,
        added_at   = os.time(),
        added_name = name_hint or '?',
        last_name  = nil,
        last_status = nil,
        last_hpp   = nil,
    }
    watch_list[#watch_list + 1] = entry
    watch_index_map[idx] = #watch_list
    log_success(string.format('Added to watch: %s (idx %d / 0x%03X)',
        name_hint or '?', idx, idx))
    return true
end

local function add_to_watch(mob)
    if not mob or not mob.index then return false end
    return add_index_to_watch(mob.index, mob.name)
end

local function remove_from_watch(idx)
    local pos = watch_index_map[idx]
    if not pos then return false end
    table.remove(watch_list, pos)
    rebuild_watch_index_map()
    return true
end

-- Fetch the authoritative per-mob metadata for a zone (NM classification
-- + respawn time per name). Async via http_request; mob_info populates on
-- whichever frame the response arrives. Hunt features that read mob_info
-- before the response just see an empty table (alerts default gracefully).
local function fetch_zone_nms(zone_id)
    if not zone_id or zone_id == 0 then return end
    local url = settings.ApiUrl .. '/api/zones/' .. tostring(zone_id) .. '/nm'
    http_request({
        url = url,
        method = 'GET',
        label = 'zone-nms',
    }, function(result, status_code, _, body)
        if not result or status_code ~= 200 then
            -- Silent: uncurated zones (most of them) and transient fetch
            -- failures shouldn't spam chat. The hunt classifier degrades
            -- gracefully — empty mob_info means standard sound, no countdown.
            mob_info = {}
            mob_info_zone = zone_id
            return
        end
        local payload = body and json_decode(body)
        if type(payload) ~= 'table' then
            mob_info = {}
            mob_info_zone = zone_id
            return
        end
        mob_info = {}
        local total, nm_count = 0, 0
        for name, info in pairs(payload) do
            if type(name) == 'string' and type(info) == 'table' then
                local entry = {
                    isNm        = info.isNm == true,
                    respawn     = tonumber(info.respawn) or 0,
                    spawnType   = type(info.spawnType) == 'string' and info.spawnType or nil,
                    genus       = type(info.genus) == 'string' and info.genus or nil,
                    notes       = type(info.notes) == 'string' and info.notes or nil,
                    mobIndices  = {},
                    placeholder = nil,
                }
                if type(info.mobIndices) == 'table' then
                    for _, ix in ipairs(info.mobIndices) do
                        if type(ix) == 'string' then entry.mobIndices[#entry.mobIndices + 1] = ix end
                    end
                end
                if type(info.placeholder) == 'table' then
                    entry.placeholder = {
                        name     = type(info.placeholder.name) == 'string' and info.placeholder.name or nil,
                        mobIndex = type(info.placeholder.mobIndex) == 'string' and info.placeholder.mobIndex or nil,
                    }
                end
                mob_info[name] = entry
                total = total + 1
                if entry.isNm then nm_count = nm_count + 1 end
            end
        end
        mob_info_zone = zone_id
    end)
end

-- Watch auto-add: detect in-game Track transitions and append the targeted
-- mob to the watch list. Track is the only signal we have for "user just
-- declared interest in this mob," so we treat it as the primary entry point.
local function check_scan_target_transition()
    local scan_target = windower.ffxi.get_mob_by_target('scan')
    local current_idx = scan_target and scan_target.index or nil
    if current_idx ~= last_scan_target_idx then
        if scan_target and current_idx then
            add_to_watch(scan_target)
        end
        last_scan_target_idx = current_idx
    end
end

-- Per-watch poll: compares each watched mob's current state to its last
-- observed state. Fires an alert on either:
--   * name change (was X, now Y — covers PH → NM pop and back)
--   * dead/absent → alive transition (covers vanilla respawn)
-- Sound is chosen via nm_set classification. Dedup is implicit: we only
-- alert when state TRANSITIONS, and after firing we update last_* fields
-- so the next identical-state poll won't re-fire.
local function poll_watch_entry(entry)
    local mob = windower.ffxi.get_mob_by_index(entry.idx)
    if not mob or not mob.name or mob.name == '' or mob.status == nil then
        -- Out of client memory: don't update state, don't alert.
        return
    end

    local current_name = mob.name
    local current_status = mob.status
    local current_hpp = mob.hpp or 0
    local was_alive = is_status_alive(entry.last_status, entry.last_hpp)
    local now_alive = is_status_alive(current_status, current_hpp)
    local name_changed = entry.last_name ~= nil and current_name ~= entry.last_name

    local should_alert = false
    if now_alive then
        if name_changed then
            should_alert = true
        elseif (not was_alive) and entry.last_status ~= nil then
            -- Real dead → alive transition (we had a prior observation, and it was not-alive).
            should_alert = true
        elseif entry.last_status == nil
           and entry.added_name
           and current_name == entry.added_name
           and classify_as_nm(current_name) then
            -- First in-render observation of a pre-watched slot, and the slot
            -- contains exactly the NM we were hoping for. Without this branch,
            -- watch-nm silently establishes baseline against an already-popped
            -- NM (e.g. player walks into range after Valkurm Emperor has
            -- already spawned) — the pop is missed entirely.
            should_alert = true
        end
    end

    if should_alert then
        local is_nm = classify_as_nm(current_name)
        play_alert(is_nm)
        local label = is_nm and 'NM POP' or 'Respawn'
        log_success(string.format('[%s] %s (idx %d / 0x%03X) alive — %d%% HP',
            label, current_name, entry.idx, entry.idx, current_hpp))
    end

    -- Track death timestamp for the live respawn countdown. We only set it on
    -- a real alive -> dead transition (so a freshly-watched corpse we never
    -- saw alive doesn't get a bogus countdown). Cleared whenever we observe
    -- the mob alive again.
    if was_alive and not now_alive and current_hpp == 0 then
        entry.died_at = os.time()
    end
    if now_alive then
        entry.died_at = nil
    end

    entry.last_name = current_name
    entry.last_status = current_status
    entry.last_hpp = current_hpp
end

local function check_all_watches()
    for _, entry in ipairs(watch_list) do
        poll_watch_entry(entry)
    end
end

-- Watch panel is split into three stacked text objects so each row group can
-- carry its own color (header gold / alive green / dead red). Only the header
-- is draggable; alive and dead sync to it each update tick. Saved position
-- (HuntWatchPos) tracks the header — alive/dead derive from it.
local hunt_watch_header_text = texts.new(
    '${content|Hunt Watch (empty)}',
    {
        pos = { x = settings.HuntWatchPos.x or 900, y = settings.HuntWatchPos.y or 350 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 210, green = 180, blue = 120,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = true, bold = true, italic = false },
    }
)
local hunt_watch_alive_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntWatchPos.x or 900, y = (settings.HuntWatchPos.y or 350) + 24 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 130, green = 170, blue = 100,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = false, italic = false },
    }
)
local hunt_watch_dead_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntWatchPos.x or 900, y = (settings.HuntWatchPos.y or 350) + 48 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 190, green = 110, blue = 110,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = false, italic = false },
    }
)
hunt_watch_header_text:hide()
hunt_watch_alive_text:hide()
hunt_watch_dead_text:hide()

-- ============================================================
-- Colored prim accents (images-library overlays). We don't ship per-color
-- assets at native size. The white-pixel + runtime color tint approach didn't
-- render (lib reported image objects fine but nothing appeared on screen), so
-- we ship per-color PNGs and let fit=true size each prim to its texture.
-- Declared before hide_hunt_watch_panel so the hide helper can reach them.
-- ============================================================
local PILL_ALIVE_PATH = windower.addon_path .. 'pill_alive.png'
local PILL_DEAD_PATH  = windower.addon_path .. 'pill_dead.png'

-- Watch panel status pills: thin vertical bars to the left of each row.
-- Green for alive, red for dead. Pool sized to MAX_WATCH_PILLS so we never
-- allocate per-update; surplus pills hide each tick. Each pill swaps its
-- texture path between PILL_ALIVE_PATH and PILL_DEAD_PATH on each render.
local MAX_WATCH_PILLS = 32
local WATCH_PILL_WIDTH = 4
local WATCH_PILL_HEIGHT = 14
local WATCH_PILL_GAP = 6  -- gap between pill and text panel edge
local watch_pills = {}
for i = 1, MAX_WATCH_PILLS do
    watch_pills[i] = images.new('watch_pill_' .. i, {
        pos = { x = 0, y = 0 },
        visible = false,
        color = { alpha = 230, red = 255, green = 255, blue = 255 },
        size = { width = WATCH_PILL_WIDTH, height = WATCH_PILL_HEIGHT },
        texture = { path = PILL_ALIVE_PATH, fit = true },
        draggable = false,
    })
end

-- target_hp_bar is no longer used (the prim-based HP bar didn't render). We
-- now display HP via a third target text object — see hunt_target_hp_text.
-- The forward declaration up top stays for the hide_hunt_target_panel guard.

local function hide_hunt_watch_panel()
    hunt_watch_header_text:hide()
    hunt_watch_alive_text:hide()
    hunt_watch_dead_text:hide()
    hunt_tracking_text:hide()
    for i = 1, MAX_WATCH_PILLS do watch_pills[i]:hide() end
end

-- Granular MM:SS / H:MM:SS used for the live respawn countdown — we want
-- per-second precision near the pop window so it actually feels like a
-- countdown, not a chunky '4m' that doesn't change for 60 seconds.
-- IMPORTANT: math.floor every input. Windower runs Lua 5.1, where %d in
-- string.format strictly requires an integer-typed number; respawn values
-- arrive from JSON as doubles, and `seconds % 60` produces doubles too,
-- which would otherwise throw and crash the prerender hook.
local function format_countdown(seconds)
    seconds = math.floor(seconds)
    if seconds < 60 then return string.format('%ds', seconds) end
    if seconds < 3600 then
        return string.format('%dm %02ds', math.floor(seconds / 60), seconds % 60)
    end
    local h = math.floor(seconds / 3600)
    local rem = seconds % 3600
    return string.format('%dh %dm %02ds', h, math.floor(rem / 60), rem % 60)
end

-- Lottery NMs respawn-time is the *window-open delay* after PH ToD, not a
-- countdown to a guaranteed pop. Once the window opens, the NM can pop on
-- any subsequent PH kill (or, on some, any time interval). Render the copy
-- to reflect that — "WINDOW OPEN" vs "DUE" prevents a false-confidence read
-- that the NM is overdue when really the window has just started.
local function format_countdown_signed(remaining, spawn_type)
    remaining = math.floor(remaining)
    local is_lottery = spawn_type == 'lottery'
    if remaining <= 0 then
        local overdue = -remaining
        if is_lottery then
            if overdue < 5 then return 'WINDOW OPEN' end
            return 'WINDOW OPEN +' .. format_countdown(overdue)
        end
        if overdue < 5 then return 'DUE' end
        return 'DUE +' .. format_countdown(overdue)
    end
    if is_lottery then return 'WINDOW in ' .. format_countdown(remaining) end
    return 'in ' .. format_countdown(remaining)
end

local function build_watch_panel()
    if #watch_list == 0 then return '', '', '', 0 end
    local scan_target = windower.ffxi.get_mob_by_target('scan')
    local scan_idx = scan_target and scan_target.index or nil
    local player = windower.ffxi.get_player()
    local self_mob = player and windower.ffxi.get_mob_by_id(player.id)

    local header_str = string.format('Hunt Watch (%d)', #watch_list)
    local alive_lines = {}
    local dead_lines = {}
    for _, e in ipairs(watch_list) do
        -- Prefer live mob data, fall back to last-observed state cached on the
        -- watch entry. FFXI clients drop mob entities from memory ~20s after
        -- death (corpse phase + despawn), at which point get_mob_by_index
        -- returns nil — but we still want to show the last known state
        -- (typically 'DEAD') rather than '???'.
        local mob = windower.ffxi.get_mob_by_index(e.idx)
        local name = (mob and mob.name and mob.name ~= '' and mob.name)
            or e.last_name or e.added_name or '?'
        local eff_status = (mob and mob.status) or e.last_status
        local eff_hpp = (mob and mob.hpp) or e.last_hpp
        local status_label, dist_str = 'out of range', ''
        local is_alive = false
        -- Widescan-derived position fallback. Pulls the most recent 0x0F4
        -- offset for this index, prefixes '~' to signal approximation, and
        -- adopts the widescan-reported name (helps when a pre-watched slot
        -- currently holds a different name than the hint — e.g. a Damselfly
        -- in a slot we're watching for Valkurm Emperor).
        local function apply_widescan_dist()
            local ws_pos = widescan_index_map[e.idx]
            local ws = ws_pos and widescan_entries[ws_pos]
            if not (ws and ws.x_off and ws.y_off) then return false end
            dist_str = string.format(' ~%4dy %s',
                distance_yards(ws.x_off, ws.y_off),
                direction_8(ws.x_off, ws.y_off))
            if ws.name and ws.name ~= '' then name = ws.name end
            return true
        end
        if eff_status ~= nil and eff_hpp ~= nil then
            if is_status_alive(eff_status, eff_hpp) then
                is_alive = true
                status_label = string.format('alive %3d%%', eff_hpp)
                -- Prefer live coords (in-render only), else fall back to
                -- widescan. For wide-scan-only mobs, mob.x is scan-time
                -- position in a different frame-of-reference than self_mob —
                -- using it directly produces confidently-wrong compass.
                local in_render = mob and mob.valid_target
                if in_render and self_mob and mob.x and self_mob.x then
                    local dx = mob.x - self_mob.x
                    local dy = mob.y - self_mob.y
                    dist_str = string.format('  %4dy %s',
                        distance_yards(dx, dy), direction_8(dx, dy))
                else
                    apply_widescan_dist()
                end
            elseif eff_hpp == 0 then
                -- HPP 0 (with a non-nil status from a real observation) covers
                -- both the corpse phase (status 2, ~20s after kill) and the
                -- fully-despawned phase (status 3). Either way: dead.
                status_label = 'DEAD'
                -- Append live respawn countdown when we know when the mob
                -- died (real alive->dead transition observed) AND we have a
                -- respawn time for its name from the zone's mob_info cache.
                if e.died_at then
                    local respawn = get_respawn_seconds(name)
                        or get_respawn_seconds(e.added_name)
                    if respawn and respawn > 0 then
                        local spawn_type = get_spawn_type(name) or get_spawn_type(e.added_name)
                        local remaining = respawn - (os.time() - e.died_at)
                        status_label = 'DEAD  ' .. format_countdown_signed(remaining, spawn_type)
                    end
                end
            else
                status_label = 'st=' .. tostring(eff_status)
            end
        elseif apply_widescan_dist() then
            -- No in-memory mob data, but the most recent /widescan picked
            -- this slot up. Typical state for a freshly-watched distant PH —
            -- watch-nm's auto /widescan gives us the first position fix
            -- before the player walks into render range.
            is_alive = true
            status_label = 'alive (scan)'
        end
        -- Two-column prefix: column 1 = tracked-by-game-scan (>), column 2 = popped (* = name differs from baseline)
        local m1 = (scan_idx == e.idx) and '>' or ' '
        local m2 = (name ~= e.added_name) and '*' or ' '
        local row = string.format('%s%s %-18s 0x%03X %-22s%s',
            m1, m2, name, e.idx, status_label, dist_str)
        if is_alive then
            alive_lines[#alive_lines + 1] = row
        else
            dead_lines[#dead_lines + 1] = row
        end
    end
    return header_str,
           table.concat(alive_lines, '\n'),
           table.concat(dead_lines, '\n'),
           #alive_lines
end

-- Approximate per-line height for size-10 Consolas + per-panel padding. Used
-- only for vertical stacking of the three watch text objects. Tuned by trial:
-- 14 caused alive to overlay the header, 18 leaves a small visible separator.
local WATCH_LINE_HEIGHT = 18
local WATCH_PANEL_PADDING = 6

local function update_hunt_watch_text()
    -- Panel is visible if hunt is on AND (any watched mob OR in-game Track active).
    -- Tracking-without-watch is a valid state — user might be probing a mob
    -- before adding it to the watch list.
    local scan_target = settings.HuntEnabled and windower.ffxi.get_mob_by_target('scan') or nil
    local has_tracking = scan_target ~= nil and scan_target.index ~= nil
    local has_watches = settings.HuntEnabled and #watch_list > 0

    if not has_tracking and not has_watches then
        hide_hunt_watch_panel()
        return
    end

    -- Header content: show watch count even if zero (so "Hunt Watch (0)" appears
    -- when only tracking is active, making the panel state explicit).
    local header_str, alive_str, dead_str, alive_count
    if has_watches then
        header_str, alive_str, dead_str, alive_count = build_watch_panel()
    else
        header_str, alive_str, dead_str, alive_count = 'Hunt Watch (0)', '', '', 0
    end
    hunt_watch_header_text:update({ content = header_str })
    hunt_watch_alive_text:update({ content = alive_str })
    hunt_watch_dead_text:update({ content = dead_str })

    if has_tracking then
        local dist_str, dir_str = tracking_dist_dir(scan_target.index)
        hunt_tracking_text:update({
            content = string.format('>> Tracking: %s (idx %d / 0x%03X)  ~%sy %s',
                scan_target.name or '?', scan_target.index, scan_target.index,
                dist_str, dir_str)
        })
    end

    -- Position sync (runs every tick): header → tracking → alive → dead.
    local hx = hunt_watch_header_text:pos_x()
    local hy = hunt_watch_header_text:pos_y()
    local header_h = WATCH_LINE_HEIGHT + WATCH_PANEL_PADDING * 2
    local tracking_h = has_tracking and (WATCH_LINE_HEIGHT + WATCH_PANEL_PADDING * 2) or 0
    local alive_h = (alive_count > 0) and (alive_count * WATCH_LINE_HEIGHT + WATCH_PANEL_PADDING * 2) or 0
    hunt_tracking_text:pos(hx, hy + header_h)
    hunt_watch_alive_text:pos(hx, hy + header_h + tracking_h)
    hunt_watch_dead_text:pos(hx, hy + header_h + tracking_h + alive_h)

    hunt_watch_header_text:show()
    if has_tracking then hunt_tracking_text:show() else hunt_tracking_text:hide() end
    if alive_count > 0 then hunt_watch_alive_text:show() else hunt_watch_alive_text:hide() end
    if (#watch_list - alive_count) > 0 then hunt_watch_dead_text:show() else hunt_watch_dead_text:hide() end

    -- Render pills: one per watch row (alive=green, dead=red). Pills sit just
    -- to the left of the alive/dead text blocks. Tracking line gets no pill.
    local pill_x = hx - WATCH_PILL_WIDTH - WATCH_PILL_GAP
    local pill_y_offset = math.floor((WATCH_LINE_HEIGHT - WATCH_PILL_HEIGHT) / 2)
    local pill_idx = 1
    -- Alive rows (green)
    local alive_top = hunt_watch_alive_text:pos_y() + WATCH_PANEL_PADDING
    for i = 1, alive_count do
        if pill_idx > MAX_WATCH_PILLS then break end
        local p = watch_pills[pill_idx]
        p:path(PILL_ALIVE_PATH)
        p:pos(pill_x, alive_top + (i - 1) * WATCH_LINE_HEIGHT + pill_y_offset)
        p:show()
        pill_idx = pill_idx + 1
    end
    -- Dead/OOR rows (red)
    local dead_count = #watch_list - alive_count
    local dead_top = hunt_watch_dead_text:pos_y() + WATCH_PANEL_PADDING
    for i = 1, dead_count do
        if pill_idx > MAX_WATCH_PILLS then break end
        local p = watch_pills[pill_idx]
        p:path(PILL_DEAD_PATH)
        p:pos(pill_x, dead_top + (i - 1) * WATCH_LINE_HEIGHT + pill_y_offset)
        p:show()
        pill_idx = pill_idx + 1
    end
    -- Hide any unused pills from a prior tick (e.g., watch list shrank)
    for i = pill_idx, MAX_WATCH_PILLS do watch_pills[i]:hide() end
end

-----------------------------------------------------------------------
-- Hunt: NM cache inspector
-- Debug overlay that lists every name in nm_set for the current zone.
-- Useful for spotting false positives in the server-side classification
-- heuristic (name appears <= 2 times OR spawntype != 0).
-----------------------------------------------------------------------
-- NM cache is split into header (gold, count + zone) and body (cyan, NM list).
-- Same design pattern as target / watch / widescan. Header is always exactly
-- one line so body position is a fixed offset.
local hunt_nm_header_text = texts.new(
    '${content|NM Cache (empty)}',
    {
        pos = { x = settings.HuntNmPos.x or 1200, y = settings.HuntNmPos.y or 50 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 210, green = 180, blue = 120,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = true, bold = true, italic = false },
    }
)
local hunt_nm_body_text = texts.new(
    '${content|}',
    {
        pos = { x = settings.HuntNmPos.x or 1200, y = (settings.HuntNmPos.y or 50) + 24 },
        bg = { alpha = 200, red = 0, green = 0, blue = 0, visible = true },
        padding = 6,
        text = {
            font = 'Consolas',
            size = 10,
            alpha = 255,
            red = 130, green = 170, blue = 180,
            stroke = { width = 1, alpha = 255, red = 0, green = 0, blue = 0 },
        },
        flags = { draggable = false, bold = false, italic = false },
    }
)
hunt_nm_header_text:hide()
hunt_nm_body_text:hide()

local NM_HEADER_HEIGHT = 30  -- 1 line of size-10 + padding both sides (matches watch panel's 18+12)

local function hide_hunt_nm_panel()
    hunt_nm_header_text:hide()
    hunt_nm_body_text:hide()
end

-- NM Cache visibility is workflow-driven, not a manual toggle:
--   * Browse — just zoned in or just cleared the watch list. Panel auto-shows
--     for NM_BROWSE_SECONDS so the player can see what's curated, then fades.
--   * Commit — watch_list non-empty. Panel hides; the player has picked their
--     hunt and Watch + Target take over screen real estate.
--   * Pinned — //va hunt nm pin overrides everything; panel stays visible.
-- Re-trigger Browse by typing //va hunt nm with no args.
local NM_BROWSE_SECONDS = 20
local nm_cache_browse_until = 0
local function start_nm_cache_browse()
    nm_cache_browse_until = os.time() + NM_BROWSE_SECONDS
end

local function format_respawn(seconds)
    if not seconds or seconds <= 0 then return '?' end
    if seconds < 60 then return seconds .. 's' end
    if seconds < 3600 then return string.format('%dm', math.floor(seconds / 60)) end
    local h = math.floor(seconds / 3600)
    local m = math.floor((seconds % 3600) / 60)
    if m == 0 then return h .. 'h' end
    return string.format('%dh%dm', h, m)
end

local function build_nm_panel()
    -- Returns (header_str, body_str). Header carries the count + zone; body
    -- renders 3-line-per-NM details: stats / placeholder+index / notes.
    -- Optional lines (PH/index, notes) are skipped when the curated data is
    -- absent — uncurated zones collapse to the single name+respawn line.
    local nm_names = {}
    for name, info in pairs(mob_info) do
        if info.isNm then nm_names[#nm_names + 1] = name end
    end
    table.sort(nm_names)
    local header
    if mob_info_zone then
        header = string.format('NM Cache (%d — zone %d)', #nm_names, mob_info_zone)
    else
        header = 'NM Cache (not loaded)'
    end
    if #nm_names == 0 then return header, '' end
    local body_lines = {}
    for _, n in ipairs(nm_names) do
        local info = mob_info[n]
        local resp = format_respawn(info.respawn)
        body_lines[#body_lines + 1] = string.format('  %-30s [%s]', n, resp)

        -- Line 2: PH name (+ PH index) and/or NM mobIndices. Skip if neither.
        local ph = info.placeholder
        local has_ph = ph and (ph.name or ph.mobIndex)
        local has_nm_idx = info.mobIndices and #info.mobIndices > 0
        if has_ph or has_nm_idx then
            local parts = {}
            if has_ph then
                if ph.name and ph.mobIndex then
                    parts[#parts + 1] = string.format('PH: %s (%s)', ph.name, ph.mobIndex)
                elseif ph.name then
                    parts[#parts + 1] = 'PH: ' .. ph.name
                else
                    parts[#parts + 1] = 'PH: ' .. ph.mobIndex
                end
            end
            if has_nm_idx then
                parts[#parts + 1] = 'NM: ' .. table.concat(info.mobIndices, ', ')
            end
            body_lines[#body_lines + 1] = '    ' .. table.concat(parts, '  ')
        end

        -- Line 3: notes if present.
        if info.notes and info.notes ~= '' then
            body_lines[#body_lines + 1] = '    ' .. info.notes
        end
    end
    return header, table.concat(body_lines, '\n')
end

local function update_hunt_nm_text()
    if not settings.HuntEnabled then
        hide_hunt_nm_panel()
        return
    end
    -- Workflow visibility: pinned > committed (hide) > browse window > hidden.
    local should_show
    if settings.HuntNmPinned then
        should_show = true
    elseif #watch_list > 0 then
        should_show = false
    elseif os.time() < nm_cache_browse_until then
        should_show = true
    else
        should_show = false
    end
    if not should_show then
        hide_hunt_nm_panel()
        return
    end
    local header_str, body_str = build_nm_panel()
    hunt_nm_header_text:update({ content = header_str })
    hunt_nm_body_text:update({ content = body_str })

    -- Sync body to header position (header is always 1 line; fixed offset).
    local hx = hunt_nm_header_text:pos_x()
    local hy = hunt_nm_header_text:pos_y()
    hunt_nm_body_text:pos(hx, hy + NM_HEADER_HEIGHT)

    hunt_nm_header_text:show()
    if body_str ~= '' then hunt_nm_body_text:show() else hunt_nm_body_text:hide() end
end

-----------------------------------------------------------------------
-- Initialize session and inventory modules
-----------------------------------------------------------------------
session.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    json_decode = json_decode,
    log = log,
    log_error = log_error,
    log_success = log_success,
})

inventory.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

porter.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

progression.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

missions_lib.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

collection_lib.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

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
    local active_job = player.main_job
    local active_job_level = player.main_job_level

    -- All jobs with levels > 0, including JP/CP and master-level data.
    -- player.master_levels only contains jobs that own the Master Breaker
    -- key item, so masterLevel is nil for locked jobs and 0-50 for unlocked.
    local jobs = {}
    for job_key, level in pairs(player.jobs) do
        if type(level) == 'number' and level > 0 then
            local job_abbr = tostring(job_key)
            local jp_data = player.job_points and player.job_points[job_abbr:lower()]
            local master_level = player.master_levels and player.master_levels[job_abbr]
            table.insert(jobs, {
                job = job_abbr,
                level = level,
                jp = jp_data and jp_data.jp or 0,
                jpSpent = jp_data and jp_data.jp_spent or 0,
                cp = jp_data and jp_data.cp or 0,
                masterLevel = master_level,  -- nil when locked (no breaker)
            })
        end
    end

    -- Equipped gear
    -- Windower's get_items().equipment uses string keys matching slot names.
    local equip_key_map = {
        [0]  = 'main',
        [1]  = 'sub',
        [2]  = 'range',
        [3]  = 'ammo',
        [4]  = 'head',
        [5]  = 'body',
        [6]  = 'hands',
        [7]  = 'legs',
        [8]  = 'feet',
        [9]  = 'neck',
        [10] = 'waist',
        [11] = 'left_ear',
        [12] = 'right_ear',
        [13] = 'left_ring',
        [14] = 'right_ring',
        [15] = 'back',
    }

    -- Equipped gear
    -- Windower equipment fields: slot_name = inventory index, slot_name_bag = bag ID
    local equip_keys = {
        [0]  = 'main',
        [1]  = 'sub',
        [2]  = 'range',
        [3]  = 'ammo',
        [4]  = 'head',
        [5]  = 'body',
        [6]  = 'hands',
        [7]  = 'legs',
        [8]  = 'feet',
        [9]  = 'neck',
        [10] = 'waist',
        [11] = 'left_ear',
        [12] = 'right_ear',
        [13] = 'left_ring',
        [14] = 'right_ring',
        [15] = 'back',
    }

    local gear = {}
    local items = windower.ffxi.get_items()
    if items and items.equipment then
        local equip = items.equipment
        -- Map numeric bag IDs to items table string keys
        local bag_names = {
            [0]  = 'inventory',
            [1]  = 'safe',
            [2]  = 'storage',
            [3]  = 'temporary',
            [4]  = 'locker',
            [5]  = 'satchel',
            [6]  = 'sack',
            [7]  = 'case',
            [8]  = 'wardrobe',
            [9]  = 'safe2',
            [10] = 'wardrobe2',
            [11] = 'wardrobe3',
            [12] = 'wardrobe4',
            [13] = 'wardrobe5',
            [14] = 'wardrobe6',
            [15] = 'wardrobe7',
            [16] = 'wardrobe8',
            [17] = 'recycle',
        }

        for slot_id, slot_name in pairs(slot_names) do
            local ekey = equip_keys[slot_id]
            if ekey then
                local inv_index = equip[ekey]
                local bag_id = equip[ekey .. '_bag']
                if inv_index and inv_index > 0 and bag_id then
                    local bag_key = bag_names[bag_id]
                    local bag_table = bag_key and items[bag_key]
                    if bag_table then
                        local item = bag_table[inv_index]
                        if item and item.id and item.id > 0 then
                            local item_res = res.items[item.id]
                            local item_name = item_res and item_res.en or ('Item ' .. item.id)
                            table.insert(gear, {
                                slot = slot_name,
                                itemId = item.id,
                                itemName = item_name,
                                augments = extdata_util.decode_augments(item),
                            })
                        end
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

    -- Collect combat, magic, and automaton skills
    -- Try name-based keys first (lowercase strings), fall back to numeric IDs
    local skills = {}
    if player.skills then
        local all_skill_names = {}
        for k, v in pairs(combat_skill_names) do all_skill_names[k] = v end
        for k, v in pairs(magic_skill_names) do all_skill_names[k] = v end
        for k, v in pairs(automaton_skill_names) do all_skill_names[k] = v end

        for skill_key, skill_name in pairs(all_skill_names) do
            local skill = player.skills[skill_key]
            if skill then
                local level = 0
                local cap = 0
                if type(skill) == 'table' then
                    level = skill.level or 0
                    cap = skill.cap or 0
                else
                    level = tonumber(skill) or 0
                end
                if level > 0 then
                    table.insert(skills, {
                        skill = skill_name,
                        level = level,
                        cap = cap,
                    })
                end
            end
        end

        -- Fall back to ID-based keys if name-based yielded nothing
        if #skills == 0 then
            local all_skill_ids = {}
            for id, name in pairs(combat_skill_ids) do all_skill_ids[id] = name end
            for id, name in pairs(magic_skill_ids) do all_skill_ids[id] = name end
            for id, name in pairs(automaton_skill_ids) do all_skill_ids[id] = name end

            for skill_id, skill_name in pairs(all_skill_ids) do
                local skill = player.skills[skill_id]
                if skill then
                    local level = 0
                    local cap = 0
                    if type(skill) == 'table' then
                        level = skill.level or 0
                        cap = skill.cap or 0
                    else
                        level = tonumber(skill) or 0
                    end
                    if level > 0 then
                        table.insert(skills, {
                            skill = skill_name,
                            level = level,
                            cap = cap,
                        })
                    end
                end
            end
        end
    end

    -- Collect merit points (only non-zero values to keep payload small)
    local merits = nil
    if player.merits then
        merits = {}
        for merit_key, merit_val in pairs(player.merits) do
            if type(merit_val) == 'number' and merit_val > 0 then
                merits[merit_key] = merit_val
            end
        end
        -- Use nil if no merits to avoid empty array serialization
        if not next(merits) then merits = nil end
    end

    local equipped_linkshells = collect_equipped_linkshells(player, items)

    local state = {
        characterName = char_name,
        server = server,
        activeJob = active_job,
        activeJobLevel = active_job_level,
        subJob = player.sub_job,
        subJobLevel = player.sub_job_level,
        masterLevel = (player.master_levels and player.main_job
            and player.master_levels[player.main_job]) or 0,
        superiorLevel = player.superior_level,
        itemLevel = player.item_level,
        hp = player.vitals.hp,
        maxHp = player.vitals.max_hp,
        mp = player.vitals.mp,
        maxMp = player.vitals.max_mp,
        linkshell = player.linkshell,
        -- player.linkshell is only the *active* LS; linkshell_slot (1 or 2)
        -- records which equipped slot it came from so the UI can label it.
        linkshellSlot = player.linkshell_slot,
        linkshells = equipped_linkshells,
        nation = player.nation,
        titleId = current_title_id,
        titleName = (current_title_id > 0 and res.titles[current_title_id])
            and res.titles[current_title_id].en
            or '',
        merits = merits,
        jobs = jobs,
        gear = gear,
        crafting = crafting,
        skills = skills,
    }

    -- Read mob entity for race and model data
    local mob = windower.ffxi.get_mob_by_id(player.id)
    if mob then
        state.race = mob.race
    end

    -- Models: attempt to read equipment model IDs from the player mob entity.
    if mob and mob.models then
        -- Slot 1 is the face/hair model
        local face_id = mob.models[1]
        if face_id and face_id >= 0 then
            state.faceModelId = face_id
        end

        local models = {}
        for slot_id = 2, 9 do
            local model_id = mob.models[slot_id]
            if model_id and model_id > 0 then
                table.insert(models, {
                    slotId = slot_id,
                    modelId = model_id,
                })
            end
        end
        if #models > 0 then
            state.models = models
        end
    end

    -- Merge packet-captured stats (from 0x061) into the sync payload
    if packet_stats then
        for k, v in pairs(packet_stats) do
            state[k] = v
        end
    end

    -- Playtime from packet 0x00A
    if playtime_seconds and playtime_seconds > 0 then
        state.playtimeSeconds = playtime_seconds
    end

    return state
end

-----------------------------------------------------------------------
-- HTTP sync to API (async). Fires the /api/sync POST and calls
-- on_complete() when finished. Sub-syncs are chained by enqueue_sync_work().
-----------------------------------------------------------------------
local function do_sync(on_complete)
    on_complete = on_complete or function() end

    if settings.ApiKey == '' then
        log_error('API key not configured. Set it in addon/vanalytics/settings.xml')
        on_complete()
        return
    end

    local state, err = read_character_state()
    if not state then
        log_error(err)
        on_complete()
        return
    end

    local payload = json_encode(state)
    local url = settings.ApiUrl .. '/api/sync'

    http_request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'main-sync',
    }, function(result, status_code, _, _)
        if not result then
            log_error('Connection failed: ' .. tostring(status_code))
            last_sync_status = 'Connection failed'
        elseif status_code == 200 then
            last_sync_time = os.time()
            last_sync_status = 'Success'
            if settings.NotifyOnSync then
                log_success('Sync successful (' .. state.characterName .. ' @ ' .. state.server .. ')')
            end
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
        on_complete()
    end)
end

-----------------------------------------------------------------------
-- Version check
--
-- Compares this addon's _addon.version against the server's reported
-- version (from /health). The bundled addon is stamped to match the
-- deployment version at release time (deploy.yml), so a mismatch means
-- the player is running an addon copy from a different release.
--
-- report_always=true prints a full report (the //va version command);
-- false stays silent unless the addon is out of date (the login nag).
-----------------------------------------------------------------------

-- Extract major.minor.patch from a version string, tolerating any
-- +commithash / -suffix the server's InformationalVersion may carry.
local function parse_semver(v)
    if type(v) ~= 'string' then return nil end
    local maj, min, pat = v:match('(%d+)%.(%d+)%.(%d+)')
    if not maj then return nil end
    return { tonumber(maj), tonumber(min), tonumber(pat) }
end

-- Returns -1, 0, 1 for a < b, a == b, a > b.
local function compare_semver(a, b)
    for i = 1, 3 do
        if a[i] < b[i] then return -1 end
        if a[i] > b[i] then return 1 end
    end
    return 0
end

local function check_version(report_always)
    http_request({
        url = settings.ApiUrl .. '/health',
        method = 'GET',
        label = 'version-check',
    }, function(result, status_code, _, body)
        -- /health returns 200 when healthy, 503 when the DB is degraded;
        -- the version is in the body either way, so we parse regardless of
        -- status_code. result is nil only on a connection-level failure.
        if not result then
            if report_always then
                log_error('Version check failed: could not reach server (' .. tostring(status_code) .. ').')
            end
            return
        end

        local data = body and json_decode(body)
        local server_version = type(data) == 'table' and data.version or nil
        local server = parse_semver(server_version)
        local localv = parse_semver(_addon.version)

        if not server then
            if report_always then
                log_error('Version check: server did not report a recognizable version.')
            end
            return
        end

        local cmp = localv and compare_semver(localv, server)

        if report_always then
            log('--- Vanalytics Version ---')
            log('Addon:  ' .. tostring(_addon.version))
            log('Server: ' .. tostring(server_version))
            if not localv then
                log_error('Local addon version is in an unrecognized format.')
            elseif cmp == 0 then
                log_success('You are up to date.')
            elseif cmp < 0 then
                log_error('Your addon is OUT OF DATE. Re-download it from ' .. settings.ApiUrl)
            else
                log('Your addon is newer than the server (dev/preview build).')
            end
        elseif localv and cmp < 0 then
            -- Silent path (login): only speak up when behind.
            log_error('Addon out of date: you have ' .. tostring(_addon.version)
                .. ', server is ' .. tostring(server_version)
                .. '. Re-download from the web app to update.')
        end
    end)
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

-----------------------------------------------------------------------
-- Bazaar Presence Scan (passive, runs on sync timer)
-----------------------------------------------------------------------
local function scan_bazaars()
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    local zone = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'

    local mob_array = windower.ffxi.get_mob_array()
    local bazaar_players = {}

    for _, mob in pairs(mob_array) do
        if mob.spawn_type == 13 and mob.name and mob.name ~= '' then
            -- spawn_type 13 = PC; check bazaar flag in status
            -- The bazaar flag is indicated by the player having a bazaar icon
            -- This is typically in mob.status or a specific flag field
            if mob.bazaar then
                table.insert(bazaar_players, { name = mob.name })
            end
        end
    end

    if #bazaar_players == 0 then return end

    local payload = json_encode({
        server = server,
        zone = zone,
        players = bazaar_players,
    })

    local url = settings.ApiUrl .. '/api/economy/bazaar/presence'

    http_request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'bazaar-presence',
    }, function(_, _, _, _) end)
end

-----------------------------------------------------------------------
-- Work queue: spreads sync tasks across frames to avoid stutter.
-- Each entry is a function. One function runs per frame until the queue
-- is empty.
-----------------------------------------------------------------------
local work_queue = {}

moves_lib.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    json_decode = json_decode,
    log = log,
    log_error = log_error,
    log_success = log_success,
    enqueue = function(fn) table.insert(work_queue, fn) end,
    inventory_sync = function()
        local player = windower.ffxi.get_player()
        local info = windower.ffxi.get_info()
        if player and info then
            local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
            inventory.sync(player.name, server_name, function() end)
        end
    end,
})

-- Helper: run an array of async steps strictly in sequence. Each step is a
-- function(done) that must eventually call done(). Avoids deep nested
-- callbacks at the sync-chain call sites.
local function run_steps(steps)
    local function next_step(i)
        if i > #steps then return end
        local ok, err = pcall(steps[i], function() next_step(i + 1) end)
        if not ok then
            log_error('Sync step ' .. i .. ' threw: ' .. tostring(err))
            next_step(i + 1)
        end
    end
    next_step(1)
end

-- Mutex flag: prevents auto-timer and manual //va sync from running two
-- chains in parallel. Without this, two concurrent chains could fire
-- duplicate POSTs and race on shared module state (e.g. inventory diff
-- snapshot, progression last_payload_hash).
local sync_in_progress = false

local function enqueue_sync_work()
    if sync_in_progress then
        log('Sync already in progress — skipping duplicate trigger.')
        return
    end
    sync_in_progress = true

    -- All HTTPS work is non-blocking via async_http. Each step's callback
    -- triggers the next one, so the chain runs strictly in sequence but
    -- never blocks a game frame. Macros are intentionally excluded —
    -- use //va macros push to sync manually (auto-syncing risks overwriting
    -- saved macros with empty defaults on fresh FFXI installs).
    local function with_player(fn)
        return function(done)
            local player = windower.ffxi.get_player()
            local info = windower.ffxi.get_info()
            if not (player and info) then done() return end
            local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
            fn(player.name, server_name, done)
        end
    end

    run_steps({
        function(done) do_sync(done) end,
        with_player(inventory.sync),
        with_player(porter.sync),
        with_player(progression.sync),
        with_player(missions_lib.sync),
        with_player(collection_lib.sync),
        function(done) scan_bazaars(); done() end,
        function(done) moves_lib.check_pending(false, done) end,
        function(done) sync_in_progress = false; done() end,
    })
end

-- Single prerender handler registered once at load time
windower.register_event('prerender', function()
    -- Refresh overlays every frame (all gated on settings.HuntEnabled)
    update_hunt_target_text()
    update_hunt_widescan_text()

    -- Watch list: detect in-game Track to auto-add, then poll watched
    -- mobs for name/status transitions and fire alerts. Cheap (small list,
    -- direct API calls), so we run it every frame when hunt is on.
    if settings.HuntEnabled then
        check_scan_target_transition()
        check_all_watches()
    end
    update_hunt_watch_text()
    update_hunt_nm_text()

    -- Pump in-flight async HTTP requests. Each call advances all active
    -- coroutines by however many bytes the socket has ready; cost per
    -- frame is in microseconds.
    async_http.poll()

    -- Process one queued work item per frame (used by moves_lib for
    -- spreading in-game action sequences across frames)
    if #work_queue > 0 then
        local task = table.remove(work_queue, 1)
        task()
    end

    if not timer_active then return end

    local now = os.clock()
    timer_elapsed = timer_elapsed + (now - timer_last_time)
    timer_last_time = now

    if timer_elapsed >= timer_interval_seconds then
        timer_elapsed = 0
        enqueue_sync_work()
    end

    -- Check if session needs auto-flush
    session.check_auto_flush()
end)

-----------------------------------------------------------------------
-- Packet capture: read title from Char Stats packet (0x061)
-----------------------------------------------------------------------
windower.register_event('incoming chunk', function(id, data)
    if id == 0x061 then
        current_title_id = data:unpack('H', 0x44 + 1) or 0

        -- Base stats (unsigned short)
        local baseStr = data:unpack('H', 0x14 + 1)
        local baseDex = data:unpack('H', 0x16 + 1)
        local baseVit = data:unpack('H', 0x18 + 1)
        local baseAgi = data:unpack('H', 0x1A + 1)
        local baseInt = data:unpack('H', 0x1C + 1)
        local baseMnd = data:unpack('H', 0x1E + 1)
        local baseChr = data:unpack('H', 0x20 + 1)

        -- Added stats from gear/buffs (signed short)
        local addedStr = data:unpack('h', 0x22 + 1)
        local addedDex = data:unpack('h', 0x24 + 1)
        local addedVit = data:unpack('h', 0x26 + 1)
        local addedAgi = data:unpack('h', 0x28 + 1)
        local addedInt = data:unpack('h', 0x2A + 1)
        local addedMnd = data:unpack('h', 0x2C + 1)
        local addedChr = data:unpack('h', 0x2E + 1)

        -- Combat stats (unsigned short)
        local attack  = data:unpack('H', 0x30 + 1)
        local defense = data:unpack('H', 0x32 + 1)

        -- Elemental resistances (signed short)
        local resFire      = data:unpack('h', 0x34 + 1)
        local resIce       = data:unpack('h', 0x36 + 1)
        local resWind      = data:unpack('h', 0x38 + 1)
        local resEarth     = data:unpack('h', 0x3A + 1)
        local resLightning = data:unpack('h', 0x3C + 1)
        local resWater     = data:unpack('h', 0x3E + 1)
        local resLight     = data:unpack('h', 0x40 + 1)
        local resDark      = data:unpack('h', 0x42 + 1)

        -- Nation rank and rank points (unsigned short)
        local nationRank   = data:unpack('H', 0x46 + 1)
        local rankPoints   = data:unpack('H', 0x48 + 1)

        packet_stats = {
            baseStr = baseStr, baseDex = baseDex, baseVit = baseVit, baseAgi = baseAgi,
            baseInt = baseInt, baseMnd = baseMnd, baseChr = baseChr,
            addedStr = addedStr, addedDex = addedDex, addedVit = addedVit, addedAgi = addedAgi,
            addedInt = addedInt, addedMnd = addedMnd, addedChr = addedChr,
            attack = attack, defense = defense,
            resFire = resFire, resIce = resIce, resWind = resWind, resEarth = resEarth,
            resLightning = resLightning, resWater = resWater, resLight = resLight, resDark = resDark,
            nationRank = nationRank, rankPoints = rankPoints,
        }
    elseif id == 0x00A then
        -- Playtime in seconds (uint32 at offset 0xA0)
        playtime_seconds = data:unpack('I', 0xA0 + 1) or 0
    elseif id == 0x063 then
        -- Multiplexed status packet: progression module handles Orders
        -- 0x02 (limit/merit points), 0x05 (job points), 0x06 (warps).
        progression.handle_packet(data)
    elseif id == 0x056 then
        -- Quest/mission update packet: missions module handles Types
        -- 0x00D0/0x00D8/0x00C0 (bitfields) and 0xFFFE/0xFFFF (pointers).
        missions_lib.handle_packet(data)
    elseif id == 0x0F4 then
        -- Wide Scan tracker: server sends one of these per mob detected
        -- by the player's most recent wide scan. Parsed via Windower's
        -- packets lib so we don't depend on hard-coded byte offsets.
        local ok, p = pcall(packets.parse, 'incoming', data)
        if not ok or not p or not p.Index then return end

        local now = os.clock()
        if last_widescan_packet > 0 and (now - last_widescan_packet) > SCAN_RESET_GAP then
            widescan_entries = {}
            widescan_index_map = {}
        end
        last_widescan_packet = now

        local entry = {
            name    = p.Name or '?',
            idx     = p.Index,
            x_off   = p['X Offset'],
            y_off   = p['Y Offset'],
            seen_at = now,
        }
        local existing_pos = widescan_index_map[p.Index]
        if existing_pos then
            -- Same scan re-emitting this mob (or packet retry): update in place,
            -- preserving its position in the displayed list.
            widescan_entries[existing_pos] = entry
        else
            widescan_entries[#widescan_entries + 1] = entry
            widescan_index_map[p.Index] = #widescan_entries
        end
        widescan_dirty = true
        widescan_active = true   -- a fresh Wide Scan just happened; activate panel
    end
end)

-- TODO: Packet capture for AH history (0x0E7) and bazaar contents (0x109)
-- Byte offsets are placeholders and need in-game verification with
-- Windower's PacketViewer addon before this will produce usable data.
-- See git history for the skeleton implementation.
--
-- windower.register_event('incoming chunk', function(id, data)
--     -- AH History (0x0E7): parse item_id, price, timestamp, buyer/seller
--     --   -> POST /api/economy/ah
--     -- Bazaar Contents (0x109): parse seller_name, items, prices, quantities
--     --   -> POST /api/economy/bazaar
-- end)

-----------------------------------------------------------------------
-- Chat commands
-----------------------------------------------------------------------
windower.register_event('addon command', function(command, ...)
    command = command and command:lower() or 'help'
    local args = {...}

    if command == 'sync' then
        if settings.NotifyOnSync then log('Syncing...') end
        enqueue_sync_work()

    elseif command == 'status' then
        local interval = get_effective_interval()
        log('--- Vanalytics Status ---')
        log('API URL: ' .. settings.ApiUrl)
        log('API Key: ' .. (settings.ApiKey ~= '' and '****' .. settings.ApiKey:sub(-4) or 'Not set'))
        log('Sync Interval: ' .. interval .. ' minutes')
        log('Notify On Sync: ' .. (settings.NotifyOnSync and 'on' or 'off'))
        if last_sync_time then
            local ago = os.difftime(os.time(), last_sync_time)
            local mins = math.floor(ago / 60)
            log('Last Sync: ' .. mins .. ' minute(s) ago (' .. last_sync_status .. ')')
        else
            log('Last Sync: ' .. last_sync_status)
        end

    elseif command == 'version' then
        check_version(true)

    elseif command == 'apikey' then
        local key = args[1]
        if not key or key == '' then
            log_error('Usage: //vanalytics apikey <your-api-key>')
            return
        end
        settings.ApiKey = key
        config.save(settings)
        log_success('API key saved.')

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

    elseif command == 'notify' then
        local arg = args[1] and args[1]:lower() or ''
        if arg == 'on' then
            settings.NotifyOnSync = true
        elseif arg == 'off' then
            settings.NotifyOnSync = false
        else
            log_error('Usage: //vanalytics notify on|off')
            return
        end
        config.save(settings)
        log('Sync chat notifications: ' .. (settings.NotifyOnSync and 'on' or 'off'))

    elseif command == 'session' then
        local subcommand = args[1] and args[1]:lower() or 'help'
        if subcommand == 'start' then
            local player = windower.ffxi.get_player()
            local info = windower.ffxi.get_info()
            if not player then
                log_error('Not logged in.')
                return
            end
            local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
            local zone_name = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'
            session.start(player.name, server_name, zone_name)
        elseif subcommand == 'stop' then
            session.stop()
        elseif subcommand == 'status' then
            session.print_status()
        elseif subcommand == 'flush' then
            session.flush()
        elseif subcommand == 'cleanup' then
            session.cleanup()
        elseif subcommand == 'debug' then
            local enabled = session.toggle_debug()
            log('Session debug mode: ' .. (enabled and 'ON' or 'OFF'))
        else
            log('Session commands: start | stop | status | flush | cleanup | debug')
        end

    elseif command == 'lsdump' then
        local player = windower.ffxi.get_player()
        local items = windower.ffxi.get_items()
        if not player or not items then
            log_error('Not logged in.')
            return
        end
        local extdata = require('extdata')
        local lines = {}
        lines[#lines + 1] = 'active linkshell = ' .. tostring(player.linkshell)
        lines[#lines + 1] = 'active linkshell_slot = ' .. tostring(player.linkshell_slot)
        lines[#lines + 1] = ''
        local bag_names = {
            [0] = 'inventory', [1] = 'safe', [2] = 'storage', [3] = 'temporary',
            [4] = 'locker', [5] = 'satchel', [6] = 'sack', [7] = 'case', [8] = 'wardrobe',
            [9] = 'safe2', [10] = 'wardrobe2', [11] = 'wardrobe3', [12] = 'wardrobe4',
            [13] = 'wardrobe5', [14] = 'wardrobe6', [15] = 'wardrobe7', [16] = 'wardrobe8',
        }
        for _, bag_key in pairs(bag_names) do
            local bag = items[bag_key]
            if bag then
                for _, item in pairs(bag) do
                    if type(item) == 'table' and item.id and item.id > 0 then
                        local r = res.items[item.id]
                        if r and r.type == 6 then
                            local ok, d = pcall(extdata.decode, item)
                            local decoded = (ok and type(d) == 'table')
                                and string.format('type=%s ls_id=%s status_id=%s name=%s rgb=%s,%s,%s',
                                    tostring(d.type), tostring(d.linkshell_id), tostring(d.status_id),
                                    tostring(d.name), tostring(d.r), tostring(d.g), tostring(d.b))
                                or 'decode failed'
                            lines[#lines + 1] = string.format('bag=%s id=%d status=%s | %s',
                                bag_key, item.id, tostring(item.status), decoded)
                        end
                    end
                end
            end
        end
        local path = windower.addon_path .. 'lsdump.txt'
        local f = io.open(path, 'w')
        if f then
            f:write(table.concat(lines, '\n'))
            f:close()
            log_success('LS dump written to ' .. path)
        else
            log_error('Failed to write lsdump.txt')
        end

    elseif command == 'dump' then
        local player = windower.ffxi.get_player()
        if not player then
            log_error('Not logged in.')
            return
        end
        local items = windower.ffxi.get_items()
        local info = windower.ffxi.get_info()
        local mob = windower.ffxi.get_mob_by_id(player.id)

        local lines = {}

        -- Dump all known Windower path variables
        table.insert(lines, '=== Windower Paths ===')
        table.insert(lines, 'windower.addon_path = ' .. tostring(windower.addon_path or 'nil'))
        table.insert(lines, 'windower.windower_path = ' .. tostring(windower.windower_path or 'nil'))
        table.insert(lines, 'windower.pol_path = ' .. tostring(windower.pol_path or 'nil'))
        table.insert(lines, 'windower.ffxi_path = ' .. tostring(windower.ffxi_path or 'nil'))
        table.insert(lines, 'windower.script_path = ' .. tostring(windower.script_path or 'nil'))
        table.insert(lines, 'windower.appdata_path = ' .. tostring(windower.appdata_path or 'nil'))
        table.insert(lines, '')

        local function dump(val, prefix, depth)
            if depth > 4 then
                table.insert(lines, prefix .. ' = <max depth>')
                return
            end
            if type(val) == 'table' then
                for k, v in pairs(val) do
                    local key = prefix .. '.' .. tostring(k)
                    if type(v) == 'table' then
                        table.insert(lines, key .. ' = {table}')
                        dump(v, key, depth + 1)
                    else
                        table.insert(lines, key .. ' = ' .. tostring(v) .. ' (' .. type(v) .. ')')
                    end
                end
            else
                table.insert(lines, prefix .. ' = ' .. tostring(val) .. ' (' .. type(val) .. ')')
            end
        end

        table.insert(lines, '=== player ===')
        dump(player, 'player', 0)
        table.insert(lines, '')
        table.insert(lines, '=== info ===')
        dump(info, 'info', 0)
        table.insert(lines, '')
        table.insert(lines, '=== mob (self) ===')
        if mob then dump(mob, 'mob', 0) else table.insert(lines, 'mob = nil') end
        table.insert(lines, '')
        table.insert(lines, '=== items.equipment ===')
        if items and items.equipment then dump(items.equipment, 'equipment', 0) end
        table.insert(lines, '')
        -- Dump one bag sample (inventory slot 1) to show item structure
        table.insert(lines, '=== items.inventory[1] (sample) ===')
        if items and items.inventory and items.inventory[1] then
            dump(items.inventory[1], 'inventory[1]', 0)
        end

        local path = windower.addon_path .. 'dump.txt'
        local f = io.open(path, 'w')
        if f then
            f:write(table.concat(lines, '\n'))
            f:close()
            log_success('Player data dumped to ' .. path)
        else
            log_error('Failed to write dump file.')
        end

    elseif command == 'hunt' then
        local arg = args[1] and args[1]:lower() or nil
        if arg == nil then
            -- Bare command: show hunt status
            local target_pos = settings.HuntTargetPos or { x = 0, y = 0 }
            local widescan_pos = settings.HuntWidescanPos or { x = 0, y = 0 }
            local n_entries = #widescan_entries
            log('--- Hunt Status ---')
            log('Overlays: ' .. (settings.HuntEnabled and 'ON' or 'OFF'))
            log(string.format('Target overlay pos: (%d, %d)', target_pos.x or 0, target_pos.y or 0))
            log(string.format('Wide scan tracker pos: (%d, %d)', widescan_pos.x or 0, widescan_pos.y or 0))
            if last_widescan_packet > 0 then
                local ago = math.floor(os.clock() - last_widescan_packet)
                log(string.format('Wide scan entries: %d (last scan %ds ago)', n_entries, ago))
            else
                log(string.format('Wide scan entries: %d (no scans this session)', n_entries))
            end
            local scan_target = windower.ffxi.get_mob_by_target('scan')
            if scan_target then
                local dist_str, dir_str = tracking_dist_dir(scan_target.index)
                log(string.format('Tracking: %s (idx %d / 0x%03X) ~%sy %s',
                    scan_target.name or '?', scan_target.index, scan_target.index,
                    dist_str, dir_str))
            else
                log('Tracking: (none — use in-game Track on a widescan entry)')
            end
            log(string.format('Watch list: %d entries  |  Sound: %s',
                #watch_list, settings.HuntSoundEnabled and 'ON' or 'OFF'))
            local nm_count, total = 0, 0
            for _, info in pairs(mob_info) do
                total = total + 1
                if info.isNm then nm_count = nm_count + 1 end
            end
            if mob_info_zone then
                log(string.format('Mob info cache: %d total / %d NMs for zone %d',
                    total, nm_count, mob_info_zone))
            else
                log('Mob info cache: (not loaded — fetched on zone-in)')
            end
            local nm_state
            if settings.HuntNmPinned then
                nm_state = 'pinned (always visible)'
            elseif #watch_list > 0 then
                nm_state = 'hidden (committed to hunt)'
            elseif os.time() < nm_cache_browse_until then
                nm_state = string.format('browse (%ds left)', nm_cache_browse_until - os.time())
            else
                nm_state = 'hidden (browse window expired)'
            end
            log('NM cache panel: ' .. nm_state)
        elseif arg == 'pos' then
            -- //va hunt pos                              -> show positions
            -- //va hunt pos target <x> <y>               -> set target overlay pos
            -- //va hunt pos widescan <x> <y>             -> set wide scan panel pos
            -- //va hunt pos watch <x> <y>                -> set watch list panel pos
            -- //va hunt pos save                         -> capture current dragged positions
            local which = args[2] and args[2]:lower() or nil
            if which == nil then
                log(string.format('Target overlay: (%d, %d)',
                    settings.HuntTargetPos.x or 0, settings.HuntTargetPos.y or 0))
                log(string.format('Wide scan tracker: (%d, %d)',
                    settings.HuntWidescanPos.x or 0, settings.HuntWidescanPos.y or 0))
                log(string.format('Watch list: (%d, %d)',
                    settings.HuntWatchPos.x or 0, settings.HuntWatchPos.y or 0))
                log(string.format('NM cache: (%d, %d)',
                    settings.HuntNmPos.x or 0, settings.HuntNmPos.y or 0))
                log('Set: //va hunt pos <target|widescan|watch|nm> <x> <y>  |  Save dragged: //va hunt pos save')
                log('(Tracking line is nested under the watch panel — no separate position.)')
            elseif which == 'save' then
                settings.HuntTargetPos = { x = hunt_target_name_text:pos_x(), y = hunt_target_name_text:pos_y() }
                settings.HuntWidescanPos = { x = hunt_widescan_header_text:pos_x(), y = hunt_widescan_header_text:pos_y() }
                settings.HuntWatchPos = { x = hunt_watch_header_text:pos_x(), y = hunt_watch_header_text:pos_y() }
                settings.HuntNmPos = { x = hunt_nm_header_text:pos_x(), y = hunt_nm_header_text:pos_y() }
                config.save(settings)
                log(string.format('Saved: target (%d,%d), widescan (%d,%d), watch (%d,%d), nm (%d,%d)',
                    settings.HuntTargetPos.x, settings.HuntTargetPos.y,
                    settings.HuntWidescanPos.x, settings.HuntWidescanPos.y,
                    settings.HuntWatchPos.x, settings.HuntWatchPos.y,
                    settings.HuntNmPos.x, settings.HuntNmPos.y))
            elseif which == 'target' or which == 'widescan' or which == 'watch' or which == 'nm' then
                local x = tonumber(args[3])
                local y = tonumber(args[4])
                if not x or not y then
                    log_error('Usage: //va hunt pos ' .. which .. ' <x> <y>')
                    return
                end
                if which == 'target' then
                    settings.HuntTargetPos = { x = x, y = y }
                    hunt_target_name_text:pos(x, y)
                    -- stats text re-syncs to the name on the next update tick
                elseif which == 'widescan' then
                    settings.HuntWidescanPos = { x = x, y = y }
                    hunt_widescan_header_text:pos(x, y)
                    -- body re-syncs to the header on the next update tick
                elseif which == 'watch' then
                    settings.HuntWatchPos = { x = x, y = y }
                    hunt_watch_header_text:pos(x, y)
                    -- alive/dead text objects re-sync to the header on the next update tick
                else
                    settings.HuntNmPos = { x = x, y = y }
                    hunt_nm_header_text:pos(x, y)
                    -- body re-syncs to the header on the next update tick
                end
                config.save(settings)
                log(string.format('%s position set to (%d, %d)', which, x, y))
            else
                log_error('Usage: //va hunt pos [target|widescan|watch|nm <x> <y> | save]')
            end
        elseif arg == 'probe' then
            -- //va hunt probe [label]
            -- Recon dump: writes every plausible cursor-related signal we can
            -- get out of Windower to addon/vanalytics/hunt-probe-<N>[-label].txt
            -- so we can diff multiple captures and see what (if anything)
            -- changes with the in-game widescan cursor.
            local label = args[2]
            hunt_probe_counter = hunt_probe_counter + 1
            local filename = 'hunt-probe-' .. hunt_probe_counter
            if label and label ~= '' then
                filename = filename .. '-' .. label
            end
            filename = filename .. '.txt'
            local path = windower.addon_path .. filename

            local lines = {}
            local function recur_dump(val, prefix, depth)
                if depth > 4 then
                    lines[#lines + 1] = prefix .. ' = <max depth>'
                    return
                end
                if type(val) == 'table' then
                    for k, v in pairs(val) do
                        local key = prefix .. '.' .. tostring(k)
                        if type(v) == 'table' then
                            lines[#lines + 1] = key .. ' = {table}'
                            recur_dump(v, key, depth + 1)
                        else
                            lines[#lines + 1] = key .. ' = ' .. tostring(v) .. ' (' .. type(v) .. ')'
                        end
                    end
                else
                    lines[#lines + 1] = prefix .. ' = ' .. tostring(val) .. ' (' .. type(val) .. ')'
                end
            end

            lines[#lines + 1] = '=== Vanalytics Hunt Probe #' .. hunt_probe_counter .. ' ==='
            lines[#lines + 1] = 'Timestamp: ' .. os.date('%Y-%m-%d %H:%M:%S')
            if label then lines[#lines + 1] = 'Label: ' .. label end
            local info = windower.ffxi.get_info()
            local zone_name = (info and info.zone and res.zones[info.zone] and res.zones[info.zone].en) or 'Unknown'
            lines[#lines + 1] = 'Zone: ' .. zone_name .. ' (id=' .. tostring(info and info.zone) .. ')'
            lines[#lines + 1] = ''

            -- Every target slot string we can think of. pcall guards against
            -- "invalid target type" errors from slots the API doesn't accept.
            lines[#lines + 1] = '=== get_mob_by_target(slot) ==='
            local slots = {
                't', 'st', 'lastst', 'me', 'tt', 'bt', 'lt',
                'scan', 'wsm', 'wsl', 'cursor', 'menu', 'lst', 'next', 'lock',
                'p0', 'p1', 'p2', 'p3', 'p4', 'p5',
            }
            for _, slot in ipairs(slots) do
                local ok, m = pcall(windower.ffxi.get_mob_by_target, slot)
                if ok and m then
                    lines[#lines + 1] = string.format("  %-8s -> idx=%-4d name=%-24s id=%d",
                        slot, m.index or -1, tostring(m.name or '?'), m.id or -1)
                elseif ok then
                    lines[#lines + 1] = string.format("  %-8s -> nil", slot)
                else
                    lines[#lines + 1] = string.format("  %-8s -> <invalid slot>", slot)
                end
            end
            lines[#lines + 1] = ''

            -- Probe every windower.ffxi function name that could plausibly
            -- expose menu/cursor state. Most will be nil — we want to see
            -- which (if any) exist on this Windower build.
            lines[#lines + 1] = '=== windower.ffxi.* function probe ==='
            local probe_fns = {
                'get_menu_id', 'get_menu_data', 'get_menu_name',
                'get_widescan_data', 'get_widescan_mob', 'get_widescan_target',
                'get_scan_data', 'get_scan_target', 'get_scan_index',
                'get_cursor', 'get_cursor_index', 'get_selection',
                'get_locked_target', 'get_target', 'get_subtarget',
            }
            for _, fname in ipairs(probe_fns) do
                local fn = windower.ffxi[fname]
                if type(fn) == 'function' then
                    local ok, result = pcall(fn)
                    if ok then
                        lines[#lines + 1] = string.format("  %-26s = %s", fname .. '()', tostring(result))
                        if type(result) == 'table' then
                            for k, v in pairs(result) do
                                lines[#lines + 1] = string.format("      .%s = %s (%s)", tostring(k), tostring(v), type(v))
                            end
                        end
                    else
                        lines[#lines + 1] = string.format("  %-26s = <call failed: %s>", fname .. '()', tostring(result))
                    end
                else
                    lines[#lines + 1] = string.format("  %-26s = <not a function>", fname)
                end
            end
            lines[#lines + 1] = ''

            lines[#lines + 1] = '=== get_info() (full) ==='
            recur_dump(info or {}, 'info', 0)
            lines[#lines + 1] = ''

            local player = windower.ffxi.get_player()
            lines[#lines + 1] = '=== get_player() — index/cursor candidate fields ==='
            if player then
                for k, v in pairs(player) do
                    local kl = tostring(k):lower()
                    if kl:find('target') or kl:find('index') or kl:find('cursor')
                        or kl:find('menu') or kl:find('select') or kl:find('scan') then
                        lines[#lines + 1] = string.format('  player.%s = %s (%s)', tostring(k), tostring(v), type(v))
                    end
                end
            end
            lines[#lines + 1] = ''

            -- One mob entry from get_mob_array() chosen at random as a baseline,
            -- so we can compare field shapes across probes (catches if mobs
            -- gain/lose a "is_selected"-type flag when hovered in widescan).
            lines[#lines + 1] = '=== sample mob from get_mob_array() ==='
            local mob_array = windower.ffxi.get_mob_array()
            if mob_array then
                for _, m in pairs(mob_array) do
                    if m and m.id and m.id ~= 0 then
                        recur_dump(m, 'mob[' .. tostring(m.index) .. ']', 0)
                        break
                    end
                end
            end

            local f = io.open(path, 'w')
            if f then
                f:write(table.concat(lines, '\n'))
                f:close()
                log_success('Probe #' .. hunt_probe_counter .. ' written: ' .. path)
            else
                log_error('Failed to write probe file: ' .. path)
            end
        elseif arg == 'on' then
            settings.HuntEnabled = true
            config.save(settings)
            log('Hunt overlays: ON')
            -- Fetch NM list for the current zone (otherwise classifier would
            -- silently default everything to standard until next zone-in).
            local info = windower.ffxi.get_info()
            if info and info.zone and info.zone ~= 0 then
                table.insert(work_queue, function() fetch_zone_nms(info.zone) end)
            end
            start_nm_cache_browse()
        elseif arg == 'off' then
            settings.HuntEnabled = false
            hide_hunt_target_panel()
            hide_hunt_widescan_panel()
            hide_hunt_watch_panel()  -- also hides nested tracking
            hide_hunt_nm_panel()
            clear_watch_list()
            config.save(settings)
            log('Hunt overlays: OFF (watch list cleared)')
        elseif arg == 'toggle' then
            settings.HuntEnabled = not settings.HuntEnabled
            if not settings.HuntEnabled then
                hide_hunt_target_panel()
                hide_hunt_widescan_panel()
                hide_hunt_watch_panel()  -- also hides nested tracking
                hide_hunt_nm_panel()
                clear_watch_list()
            else
                start_nm_cache_browse()
            end
            config.save(settings)
            log('Hunt overlays: ' .. (settings.HuntEnabled and 'ON' or 'OFF'))
        elseif arg == 'watch' then
            -- //va hunt watch                         -> list watched entries
            -- //va hunt watch list                    -> same as above
            -- //va hunt watch remove <idx|hex>        -> remove one watched mob
            -- //va hunt watch clear                   -> drop all watched mobs
            local sub = args[2] and args[2]:lower() or 'list'
            if sub == 'list' then
                if #watch_list == 0 then
                    log('Watch list is empty. Use in-game Track on a Wide Scan entry to add.')
                    return
                end
                log('--- Watch list (' .. #watch_list .. ') ---')
                for _, e in ipairs(watch_list) do
                    local current = windower.ffxi.get_mob_by_index(e.idx)
                    local cur_name = (current and current.name) or e.last_name or e.added_name or '?'
                    local eff_status = (current and current.status) or e.last_status
                    local eff_hpp = (current and current.hpp) or e.last_hpp
                    local state
                    if eff_status ~= nil and eff_hpp ~= nil then
                        if is_status_alive(eff_status, eff_hpp) then
                            state = string.format('alive %d%%', eff_hpp)
                        elseif eff_hpp == 0 then
                            state = 'dead'
                        else
                            state = 'st=' .. tostring(eff_status)
                        end
                    else
                        state = 'out of range'
                    end
                    local nm_marker = classify_as_nm(cur_name) and ' [NM]' or ''
                    log(string.format('  %s (idx %d / 0x%03X) — %s%s',
                        cur_name, e.idx, e.idx, state, nm_marker))
                end
            elseif sub == 'remove' then
                local idx = parse_mob_idx(args[3])
                if not idx then
                    log_error('Usage: //va hunt watch remove <idx|hex>  (e.g. 343 or 0x157)')
                    return
                end
                if remove_from_watch(idx) then
                    log(string.format('Removed idx %d (0x%03X) from watch list.', idx, idx))
                else
                    log('Index ' .. idx .. ' is not on the watch list.')
                end
            elseif sub == 'clear' then
                local n = #watch_list
                clear_watch_list()
                log('Watch list cleared (' .. n .. ' entries removed).')
                -- Back to Browse — player just dropped their hunt, re-show
                -- NM Cache so they can pick the next one without typing.
                start_nm_cache_browse()
            elseif sub == 'nm' then
                -- //va hunt watch nm <name>  -> pre-emptively watch every slot
                -- this NM could occupy. Pulls indices from the curated NM cache:
                -- mob_info[name].mobIndices[] (NM's own spawn-point indices) and
                -- placeholder.mobIndex (the PH it shares a slot with). Solves
                -- the classic PH-vs-NM drift (Cactuar Cantautor PH at 0x157,
                -- NM pops at 0x158 — watching either alone misses pops).
                local name = table.concat(args, ' ', 3)
                name = name:gsub('^%s*"?(.-)"?%s*$', '%1')
                if name == '' then
                    log_error('Usage: //va hunt watch nm <name>  (e.g. //va hunt watch nm Valkurm Emperor)')
                    return
                end
                -- Case-insensitive lookup against mob_info keys.
                local info, canonical_name
                local lower = name:lower()
                for k, v in pairs(mob_info) do
                    if k:lower() == lower then
                        info = v
                        canonical_name = k
                        break
                    end
                end
                if not info then
                    log_error(string.format("No NM named '%s' in cache for current zone. Use //va hunt nm list to see what's loaded.", name))
                    return
                end
                -- Track (idx, name_hint) per slot so the watch list shows the
                -- right baseline name for each row — NM name for NM-slot
                -- indices (where we're hoping the NM pops) and PH name for
                -- the PH slot (where the actual current occupant is the PH).
                local entries = {}
                local seen = {}
                local function add_hex(s, hint)
                    if type(s) ~= 'string' or s == '' then return end
                    local n = tonumber(s, 16) or tonumber(s:gsub('^0[xX]', ''), 16)
                    if n and not seen[n] then
                        seen[n] = true
                        entries[#entries + 1] = { idx = n, hint = hint }
                    end
                end
                for _, ix in ipairs(info.mobIndices or {}) do
                    add_hex(ix, canonical_name)
                end
                if info.placeholder then
                    add_hex(info.placeholder.mobIndex,
                        info.placeholder.name or canonical_name)
                end
                if #entries == 0 then
                    log_error(string.format("'%s' has no curated indices and no placeholder. Re-sync zones to backfill MobIndex, or add a placeholder.mobIndex to the curated NM file.", canonical_name))
                    return
                end
                local added, dup = 0, 0
                for _, ent in ipairs(entries) do
                    if add_index_to_watch(ent.idx, ent.hint) then
                        added = added + 1
                    else
                        dup = dup + 1
                    end
                end
                log(string.format("Watching %d slot(s) for '%s' (%d new, %d already-watched).",
                    #entries, canonical_name, added, dup))
                -- Trigger a fresh wide scan so the panel has up-to-date offsets
                -- for compass direction. Safe to issue even if no widescan job
                -- is sub'd — game just prints an error and the existing data
                -- (if any) is preserved.
                windower.send_command('input /widescan')
            else
                log_error('Usage: //va hunt watch [list|remove <idx|hex>|clear|nm <name>]')
            end
        elseif arg == 'nm' then
            -- //va hunt nm           -> re-trigger the Browse preview window
            -- //va hunt nm pin       -> toggle persistent pin (overrides workflow)
            -- //va hunt nm list      -> dump the cache to chat
            local sub = args[2] and args[2]:lower() or ''
            if sub == '' then
                start_nm_cache_browse()
                log(string.format('NM cache: shown for %ds.', NM_BROWSE_SECONDS))
            elseif sub == 'pin' then
                settings.HuntNmPinned = not settings.HuntNmPinned
                config.save(settings)
                log('NM cache pin: ' .. (settings.HuntNmPinned and 'ON (always visible)' or 'OFF'))
            elseif sub == 'list' then
                local names = {}
                for name, info in pairs(mob_info) do
                    if info.isNm then names[#names + 1] = name end
                end
                table.sort(names)
                if #names == 0 then
                    log('NM cache is empty for zone ' .. tostring(mob_info_zone or '?') .. '.')
                    return
                end
                log(string.format('--- NM cache (%d names, zone %s) ---',
                    #names, tostring(mob_info_zone or '?')))
                for _, n in ipairs(names) do
                    log(string.format('  %s  [respawn %s]', n, format_respawn(mob_info[n].respawn)))
                end
            else
                log_error(string.format('Usage: //va hunt nm [pin|list]  (no args = show for %ds)', NM_BROWSE_SECONDS))
            end
        elseif arg == 'sound' then
            local s = args[2] and args[2]:lower() or nil
            if s == 'on' then
                settings.HuntSoundEnabled = true
            elseif s == 'off' then
                settings.HuntSoundEnabled = false
            elseif s == 'test' then
                -- Quick way to verify the wav files load and audio is routed properly.
                play_alert(true)
                log('Played NM test sound (notify_NM.wav).')
                return
            else
                log_error('Usage: //va hunt sound on|off|test')
                return
            end
            config.save(settings)
            log('Hunt sound: ' .. (settings.HuntSoundEnabled and 'ON' or 'OFF'))
        else
            log_error('Usage: //va hunt [on|off|toggle|pos|watch|sound|nm|probe]  (no args shows status)')
        end

    elseif command == 'widescan' then
        -- Recon command: dump the current widescan tracker results with mob index + id + name.
        -- BG-wiki and LSB pool data publish zone-local mob indexes (e.g. "ID 157"),
        -- which match windower's mob.index, NOT the full 32-bit mob.id.
        if not windower.ffxi.get_mob_list then
            log_error('windower.ffxi.get_mob_list not available in this Windower version.')
            return
        end

        local mob_list = windower.ffxi.get_mob_list()
        if not mob_list then
            log('No widescan data. Use widescan in-game first (RNG/BST or pet variant).')
            return
        end

        local count = 0
        for _ in pairs(mob_list) do count = count + 1 end
        if count == 0 then
            log('Widescan list is empty. Refresh widescan in-game.')
            return
        end

        local player = windower.ffxi.get_player()
        local self_mob = player and windower.ffxi.get_mob_by_id(player.id)
        local filter = args[1] and args[1]:lower() or nil

        local entries = {}
        for index, value in pairs(mob_list) do
            local name = type(value) == 'string' and value
                or (type(value) == 'table' and value.name)
                or '?'
            local entry = { index = index, name = name, raw_type = type(value) }
            if windower.ffxi.get_mob_by_index then
                local mob = windower.ffxi.get_mob_by_index(index)
                if mob then
                    entry.id = mob.id
                    entry.x, entry.y, entry.z = mob.x, mob.y, mob.z
                    entry.hpp = mob.hpp
                    entry.spawn_type = mob.spawn_type
                    entry.valid_target = mob.valid_target
                    entry.status = mob.status
                    entry.claim_id = mob.claim_id
                    entry.is_npc = mob.is_npc
                    if self_mob and mob.x and self_mob.x then
                        local dx = mob.x - self_mob.x
                        local dy = mob.y - self_mob.y
                        entry.distance = math.sqrt(dx*dx + dy*dy)
                    end
                end
            end
            table.insert(entries, entry)
        end

        table.sort(entries, function(a, b)
            if a.name == b.name then return a.index < b.index end
            return (a.name or '') < (b.name or '')
        end)

        log('--- Widescan (' .. count .. ' entries' ..
            (filter and (', filter="' .. filter .. '"') or '') .. ') ---')
        local shown = 0
        local CHAT_LIMIT = 30
        for _, e in ipairs(entries) do
            if not filter or e.name:lower():find(filter, 1, true) then
                local dist_str = e.distance and string.format(' %.1fy', e.distance) or ''
                local live_str = ''
                if e.status ~= nil or e.valid_target ~= nil then
                    live_str = string.format(' [vt=%s st=%s hpp=%s]',
                        tostring(e.valid_target),
                        tostring(e.status),
                        e.hpp and (e.hpp .. '%') or '-')
                end
                log(string.format('  idx %4d  %s%s%s', e.index, e.name, dist_str, live_str))
                shown = shown + 1
                if shown >= CHAT_LIMIT then
                    log('  ... (truncated; full list in widescan.txt)')
                    break
                end
            end
        end
        if filter and shown == 0 then
            log('  (no matches)')
        end

        local info = windower.ffxi.get_info()
        local zone_name = (info and res.zones[info.zone] and res.zones[info.zone].en) or 'Unknown'
        local file_path = windower.addon_path .. 'widescan.txt'
        local f = io.open(file_path, 'w')
        if f then
            local first_key, first_val = next(mob_list)
            f:write('=== Widescan dump ===\n')
            f:write('Zone: ' .. zone_name .. ' (id=' .. tostring(info and info.zone) .. ')\n')
            f:write('Total entries: ' .. count .. '\n')
            f:write('Raw value type from get_mob_list(): ' .. type(first_val) ..
                ' (sample: key=' .. tostring(first_key) .. ' val=' .. tostring(first_val) .. ')\n\n')
            f:write(string.format('%-6s  %-32s  %-10s  %-8s  %-18s  %-5s  %-5s  %-7s  %-9s  %s\n',
                'INDEX', 'NAME', 'ID', 'DIST', 'POS(x,y,z)', 'HPP', 'VTGT', 'STATUS', 'CLAIM_ID', 'NPC?'))
            for _, e in ipairs(entries) do
                local pos = (e.x and e.y and e.z) and string.format('(%.0f,%.0f,%.0f)', e.x, e.y, e.z) or ''
                local dist = e.distance and string.format('%.1fy', e.distance) or ''
                local id_str = e.id and tostring(e.id) or ''
                local hpp = e.hpp and (e.hpp .. '%') or ''
                local vtgt = (e.valid_target ~= nil) and tostring(e.valid_target) or ''
                local status = (e.status ~= nil) and tostring(e.status) or ''
                local claim = (e.claim_id ~= nil and e.claim_id ~= 0) and tostring(e.claim_id) or ''
                local npc = (e.is_npc ~= nil) and tostring(e.is_npc) or ''
                f:write(string.format('%-6d  %-32s  %-10s  %-8s  %-18s  %-5s  %-5s  %-7s  %-9s  %s\n',
                    e.index, e.name, id_str, dist, pos, hpp, vtgt, status, claim, npc))
            end
            f:close()
            log_success('Full dump: ' .. file_path)
        end

    elseif command == 'url' then
        local url = args[1]
        if not url or url == '' then
            log('Current API URL: ' .. settings.ApiUrl)
            return
        end
        if url == 'local' then
            url = 'http://localhost:5000'
        elseif url == 'prod' then
            url = 'https://vanalytics.soverance.com'
        end
        settings.ApiUrl = url
        config.save(settings)
        log_success('API URL set to: ' .. url)

    elseif command == 'macros' then
        local macro_path = find_macro_path()
        if not macro_path then
            windower.add_to_chat(207, '[Vanalytics] Could not find macro directory.')
            return
        end

        local sub = args[1] and args[1]:lower() or ''
        local flag = args[2] and args[2]:lower() or ''
        local force = (flag == '--force')

        local log_fn = function(msg)
            windower.add_to_chat(207, '[Vanalytics] ' .. msg)
        end

        if sub == 'push' then
            macro_lib.push(macro_path, settings, http_request, json_encode, json_decode, settings.ApiUrl, settings.ApiKey, force, log_fn, function(_)
                config.save(settings)
            end)

        elseif sub == 'pull' then
            -- Determine the player's currently active macro book so pull can avoid
            -- writing DATs that FFXI would immediately overwrite from memory.
            local active_book = nil
            local info = windower.ffxi.get_info()
            if info and info.macro_book then
                active_book = info.macro_book
            end

            macro_lib.pull(macro_path, settings, http_request, json_encode, json_decode, settings.ApiUrl, settings.ApiKey, force, log_fn, active_book, function(pulled)
                config.save(settings)
                if pulled and #pulled > 0 then
                    windower.send_command('input /reloadmacros')
                    windower.add_to_chat(207, '[Vanalytics] DAT files updated. Zone or relogin to load the new macros in-game.')
                    windower.add_to_chat(207, '[Vanalytics] Tip: do NOT switch to the pulled book(s) until after you zone/relogin, or FFXI will overwrite the DAT with its cached copy.')
                end
            end)

        elseif sub == 'status' then
            local count = 0
            if settings.macro_hashes then
                for _ in pairs(settings.macro_hashes) do count = count + 1 end
            end
            windower.add_to_chat(207, '[Vanalytics] Tracking ' .. count .. ' macro book(s).')

        elseif sub == 'diag' then
            macro_lib.diag(macro_path, settings, log_fn)

        elseif sub == 'dump' then
            local mcr0 = macro_path .. '/' .. macro_lib.dat_filename(0)
            local mcr1 = macro_path .. '/' .. macro_lib.dat_filename(1)
            local dump_path = windower.addon_path .. 'data/'
            macro_lib.dump_dat(mcr0, dump_path .. 'mcr0_dump.txt')
            macro_lib.dump_dat(mcr1, dump_path .. 'mcr1_dump.txt')
            windower.add_to_chat(207, '[Vanalytics] Macro DAT dumps saved to addon data folder.')

        else
            windower.add_to_chat(207, '[Vanalytics] Usage: //va macros <push|pull|status|diag|dump> [--force]')
        end

    elseif command == 'moves' then
        local subcommand = args[1] and args[1]:lower() or 'help'
        if subcommand == 'execute' then
            moves_lib.execute()
        elseif subcommand == 'status' then
            moves_lib.status()
        else
            log('Move commands: execute | status')
        end

    elseif command == 'help' then
        log('--- Vanalytics Commands ---')
        log('//va apikey <key> - Set your API key')
        log('//va url <url>    - Set API URL (or: local / prod)')
        log('//va sync         - Sync now')
        log('//va status       - Show status')
        log('//va version      - Check addon version against the server')
        log('//va interval N   - Set sync interval in minutes (min: ' .. MIN_INTERVAL .. ')')
        log('//va notify on|off - Toggle in-game chat notifications on successful sync')
        log('//va dump         - Dump player data to file')
        log('//va widescan [filter] - List widescan results with mob indexes (BG-wiki "ID" matches mob.index)')
        log('//va hunt                       - Show hunt status (overlays, positions, scan state)')
        log('//va hunt on|off|toggle         - Toggle hunt overlays (target info + wide scan tracker)')
        log('//va hunt pos                   - Show current overlay positions')
        log('//va hunt pos target <x> <y>    - Move target overlay (no mouse needed)')
        log('//va hunt pos widescan <x> <y>  - Move wide scan tracker panel')
        log('//va hunt pos watch <x> <y>     - Move watch list panel')
        log('//va hunt pos save              - Persist current dragged positions')
        log('//va hunt watch                 - List watched mobs (auto-populated by in-game Track)')
        log('//va hunt watch nm <name>       - Pre-watch all curated slots (NM + PH) for an NM by name')
        log('//va hunt watch remove <idx>    - Stop watching a mob (decimal or 0x-hex)')
        log('//va hunt watch clear           - Clear all watched mobs')
        log('//va hunt sound on|off|test     - Toggle pop alert sounds (or test playback)')
        log('//va hunt nm                    - Show NM cache for ' .. NM_BROWSE_SECONDS .. 's (auto-hides on commit)')
        log('//va hunt nm pin                - Toggle persistent pin (always visible)')
        log('//va hunt nm list               - Dump the cached NM name list to chat')
        log('//va hunt probe [label]         - Recon: dump cursor-candidate state to hunt-probe-N.txt')
        log('//va session start   - Start a performance tracking session')
        log('//va session stop    - Stop the active session and upload data')
        log('//va session status  - Show current session info')
        log('//va session flush   - Manually upload buffered events')
        log('//va session cleanup - Delete old session files')
        log('//va session debug   - Toggle debug mode (logs unmatched chat lines)')
        log('//va macros push [--force]  - Upload changed macro books (zone first to flush edits)')
        log('//va macros pull [--force]  - Download pending macro updates (zone to apply in-game)')
        log('//va macros status         - Show tracked macro book count')
        log('//va macros diag           - Show per-book change-detection state')
        log('//va moves execute   - Execute pending inventory move orders')
        log('//va moves status    - Show pending move order details')
        log('//va help         - Show this help')

    else
        log_error('Unknown command: ' .. command .. '. Type //vanalytics help')
    end
end)

-----------------------------------------------------------------------
-- Addon lifecycle events
-----------------------------------------------------------------------
windower.register_event('login', function(name)
    if settings.ApiKey == '' then
        log('Logged in as ' .. name .. '.')
        log_error('No API key configured. Run: //vanalytics apikey <your-key>')
    else
        log('Logged in as ' .. name .. '. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
        start_timer()
    end
    -- Quietly warn if this addon is older than the deployed server version.
    check_version(false)
end)

windower.register_event('logout', function()
    stop_timer()
    last_sync_time = nil
    last_sync_status = 'Never synced'

    -- Cancel in-flight HTTP requests and reset per-character module state
    -- so the next login (which may be a different character on the same
    -- account) doesn't diff against the previous character's data.
    async_http.cancel_all()
    sync_in_progress = false
    inventory.reset()
    progression.reset()
    missions_lib.reset()
    collection_lib.reset()
    moves_lib.reset()
end)

windower.register_event('load', function()
    -- One-time inventory backfill for the augment-capture feature. Existing
    -- characters already have inventory rows on the server with no augment data,
    -- and a normal diff sync won't re-send unchanged items. Forcing the next
    -- inventory sync to be a full re-sync re-sends every item WITH augments.
    -- Gated by a persisted flag so it runs only once per install.
    if not settings.AugmentBackfillDone then
        inventory.reset()
        settings.AugmentBackfillDone = true
        config.save(settings)
        log('Augment backfill: next sync will be a full inventory re-sync.')
    end

    -- If already logged in when addon loads, start timer
    local player = windower.ffxi.get_player()
    if player then
        if settings.ApiKey == '' then
            log('Loaded.')
            log_error('No API key configured. Run: //vanalytics apikey <your-key>')
        else
            log('Loaded. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
            start_timer()
        end
        -- Already logged in at load (e.g. //lua reload): run the same
        -- quiet out-of-date check the login event would have done.
        check_version(false)
    else
        log('Loaded. Waiting for login...')
    end
end)

windower.register_event('incoming text', function(original, modified, original_mode, modified_mode, blocked)
    session.on_text(original, modified, original_mode, modified_mode, blocked)
end)

windower.register_event('zone change', function()
    -- Wide Scan results and watch list are both zone-scoped; flush on every transition.
    widescan_entries = {}
    widescan_index_map = {}
    last_widescan_packet = 0
    widescan_dirty = true
    widescan_active = false
    hide_hunt_widescan_panel()

    clear_watch_list()
    hide_hunt_watch_panel()
    last_scan_target_idx = nil

    -- Refresh the authoritative NM name set for the new zone. Deferred onto the
    -- work queue so the synchronous HTTP call doesn't stutter the zone-in frame.
    if settings.HuntEnabled then
        local info = windower.ffxi.get_info()
        local new_zone = info and info.zone
        if new_zone and new_zone ~= 0 then
            table.insert(work_queue, function() fetch_zone_nms(new_zone) end)
        end
        -- Start the Browse preview window so the player can see what's curated
        -- for this zone without typing anything. Auto-hides on commit (watch
        -- entry added) or after NM_BROWSE_SECONDS, whichever comes first.
        start_nm_cache_browse()
    end
end)

windower.register_event('unload', function()
    stop_timer()
    if session.is_active() then
        session.stop()
    end
    -- Drop any in-flight HTTP coroutines so their sockets/closures don't
    -- outlive the addon and try to fire callbacks against torn-down state.
    async_http.cancel_all()
end)
