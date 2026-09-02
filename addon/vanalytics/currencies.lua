-- addon/vanalytics/currencies.lua
-- Captures FFXI currency balances from incoming packets 0x113 (Currencies I)
-- and 0x118 (Currencies II). Both are flat fixed-offset scalar layouts. The
-- latest payload is cached per-character to disk and synced to the API, so a
-- complete view ships even on the first sync after a re-install. Mirrors
-- progression.lua's cache/dirty/sync structure.

local currencies = {}

-- Windower's bundled JSON lib (addons/libs/json.lua) — used for disk cache
-- read-back. Lazy-loaded so a missing lib doesn't break the whole module.
local json_lib = nil
local function get_json()
    if json_lib then return json_lib end
    local ok, lib = pcall(require, 'json')
    if ok then json_lib = lib end
    return json_lib
end

-----------------------------------------------------------------------
-- Field map: key -> { packet, offset (0-based, per fields.lua/XiPackets),
-- ctype }. ctype: 's32' signed int32, 'u16' unsigned short, 'u8' unsigned
-- char. Offsets verified vs local Windower fields.lua + XiPackets (see
-- Master Currency Table in the SDD plan). Keys MUST exactly match
-- src/Vanalytics.Web/src/lib/currencies.ts's CURRENCIES keys — that TS
-- catalog and this map are both transcribed from the same Master Table and
-- form the addon<->catalog contract (lookupCurrency is the raw-key
-- fallback if they ever drift).
-----------------------------------------------------------------------
local FIELDS = {
    -- packet 0x113 (Currencies I)
    conquestSandoria       = { packet = 0x113, offset = 0x04, ctype = 's32' },
    conquestBastok         = { packet = 0x113, offset = 0x08, ctype = 's32' },
    conquestWindurst       = { packet = 0x113, offset = 0x0C, ctype = 's32' },
    beastmanSeals          = { packet = 0x113, offset = 0x10, ctype = 'u16' },
    kindredSeals           = { packet = 0x113, offset = 0x12, ctype = 'u16' },
    kindredCrests          = { packet = 0x113, offset = 0x14, ctype = 'u16' },
    highKindredCrests      = { packet = 0x113, offset = 0x16, ctype = 'u16' },
    sacredKindredCrests    = { packet = 0x113, offset = 0x18, ctype = 'u16' },
    ancientBeastcoins      = { packet = 0x113, offset = 0x1A, ctype = 'u16' },
    valorPoints            = { packet = 0x113, offset = 0x1C, ctype = 'u16' },
    scylds                 = { packet = 0x113, offset = 0x1E, ctype = 'u16' },
    guildFishing           = { packet = 0x113, offset = 0x20, ctype = 's32' },
    guildWoodworking       = { packet = 0x113, offset = 0x24, ctype = 's32' },
    guildSmithing          = { packet = 0x113, offset = 0x28, ctype = 's32' },
    guildGoldsmithing      = { packet = 0x113, offset = 0x2C, ctype = 's32' },
    guildWeaving           = { packet = 0x113, offset = 0x30, ctype = 's32' },
    guildLeathercraft      = { packet = 0x113, offset = 0x34, ctype = 's32' },
    guildBonecraft          = { packet = 0x113, offset = 0x38, ctype = 's32' },
    guildAlchemy            = { packet = 0x113, offset = 0x3C, ctype = 's32' },
    guildCooking            = { packet = 0x113, offset = 0x40, ctype = 's32' },
    cinders                 = { packet = 0x113, offset = 0x44, ctype = 's32' },
    ballistaPoints          = { packet = 0x113, offset = 0x50, ctype = 's32' },
    fellowPoints            = { packet = 0x113, offset = 0x54, ctype = 's32' },
    chocobucksSandoria      = { packet = 0x113, offset = 0x58, ctype = 'u16' },
    chocobucksBastok        = { packet = 0x113, offset = 0x5A, ctype = 'u16' },
    chocobucksWindurst      = { packet = 0x113, offset = 0x5C, ctype = 'u16' },
    dailyTally              = { packet = 0x113, offset = 0x5E, ctype = 'u16' },
    researchMarks           = { packet = 0x113, offset = 0x60, ctype = 's32' },
    moblinMarbles           = { packet = 0x113, offset = 0x68, ctype = 's32' },
    infamy                  = { packet = 0x113, offset = 0x6C, ctype = 'u16' },
    prestige                = { packet = 0x113, offset = 0x6E, ctype = 'u16' },
    legionPoints            = { packet = 0x113, offset = 0x70, ctype = 's32' },
    sparksOfEminence        = { packet = 0x113, offset = 0x74, ctype = 's32' },
    shiningStars            = { packet = 0x113, offset = 0x78, ctype = 's32' },
    imperialStanding        = { packet = 0x113, offset = 0x7C, ctype = 's32' },
    assaultLeujaoam         = { packet = 0x113, offset = 0x80, ctype = 's32' },
    assaultMamook           = { packet = 0x113, offset = 0x84, ctype = 's32' },
    assaultLebros           = { packet = 0x113, offset = 0x88, ctype = 's32' },
    assaultPeriqia          = { packet = 0x113, offset = 0x8C, ctype = 's32' },
    assaultIlrusi           = { packet = 0x113, offset = 0x90, ctype = 's32' },
    nyzulTokens             = { packet = 0x113, offset = 0x94, ctype = 's32' },
    zeni                    = { packet = 0x113, offset = 0x98, ctype = 's32' },
    jettons                 = { packet = 0x113, offset = 0x9C, ctype = 's32' },
    therionIchor            = { packet = 0x113, offset = 0xA0, ctype = 's32' },
    alliedNotes             = { packet = 0x113, offset = 0xA4, ctype = 's32' },
    amanVouchers            = { packet = 0x113, offset = 0xA8, ctype = 'u16' },
    loginPoints             = { packet = 0x113, offset = 0xAA, ctype = 'u16' },
    cruor                   = { packet = 0x113, offset = 0xAC, ctype = 's32' },
    resistanceCredits       = { packet = 0x113, offset = 0xB0, ctype = 's32' },
    dominionNotes           = { packet = 0x113, offset = 0xB4, ctype = 's32' },
    caveConservationPoints  = { packet = 0x113, offset = 0xBD, ctype = 'u8' },
    imperialArmyIdTags      = { packet = 0x113, offset = 0xBE, ctype = 'u8' },
    opCredits               = { packet = 0x113, offset = 0xBF, ctype = 'u8' },
    traverserStones         = { packet = 0x113, offset = 0xC0, ctype = 's32' },
    voidstones              = { packet = 0x113, offset = 0xC4, ctype = 's32' },
    kupofriedsCorundums     = { packet = 0x113, offset = 0xC8, ctype = 's32' },
    reclamationMarks        = { packet = 0x113, offset = 0xE0, ctype = 's32' },
    unityAccolades          = { packet = 0x113, offset = 0xE4, ctype = 's32' },
    deeds                   = { packet = 0x113, offset = 0xF8, ctype = 's32' },

    -- packet 0x118 (Currencies II)
    bayld                      = { packet = 0x118, offset = 0x04, ctype = 's32' },
    kineticUnits               = { packet = 0x118, offset = 0x08, ctype = 'u16' },
    coalitionImprimaturs       = { packet = 0x118, offset = 0x0A, ctype = 'u8' },
    mysticalCanteens           = { packet = 0x118, offset = 0x0B, ctype = 'u8' },
    obsidianFragments          = { packet = 0x118, offset = 0x0C, ctype = 's32' },
    mweyaPlasmCorpuscles       = { packet = 0x118, offset = 0x14, ctype = 's32' },
    eschaBeads                 = { packet = 0x118, offset = 0x4A, ctype = 'u16' },
    eschaSilt                  = { packet = 0x118, offset = 0x4C, ctype = 's32' },
    potpourri                  = { packet = 0x118, offset = 0x50, ctype = 's32' },
    hallmarks                  = { packet = 0x118, offset = 0x54, ctype = 's32' },
    totalHallmarks             = { packet = 0x118, offset = 0x58, ctype = 's32' },
    badgesOfGallantry           = { packet = 0x118, offset = 0x5C, ctype = 's32' },
    crafterPoints               = { packet = 0x118, offset = 0x60, ctype = 's32' },
    silverAmanVouchers          = { packet = 0x118, offset = 0x80, ctype = 's32' },
    domainPoints                = { packet = 0x118, offset = 0x84, ctype = 's32' },
    domainPointsToday           = { packet = 0x118, offset = 0x88, ctype = 's32' },
    mogSegments                 = { packet = 0x118, offset = 0x8C, ctype = 's32' },
    gallimaufry                 = { packet = 0x118, offset = 0x90, ctype = 's32' },
    imperialStandingAccolades   = { packet = 0x118, offset = 0x94, ctype = 's32' },
    temenosUnits                = { packet = 0x118, offset = 0x98, ctype = 's32' },
    apollyonUnits                = { packet = 0x118, offset = 0x9C, ctype = 's32' },
}

-----------------------------------------------------------------------
-- Byte-level reads. offset args are 1-indexed (fields.lua offset 0xNN ->
-- addon byte position 0xNN+1). We avoid `data:unpack(...)` because
-- Windower's pack library uses non-standard format chars (e.g. 'B' =
-- boolean, not uint8) — manual byte composition is bulletproof regardless.
-----------------------------------------------------------------------
local function u16le(data, offset)
    local b0 = data:byte(offset) or 0
    local b1 = data:byte(offset + 1) or 0
    return b0 + b1 * 256
end

local function u32le(data, offset)
    local b0 = data:byte(offset) or 0
    local b1 = data:byte(offset + 1) or 0
    local b2 = data:byte(offset + 2) or 0
    local b3 = data:byte(offset + 3) or 0
    return b0 + b1 * 256 + b2 * 65536 + b3 * 16777216
end

-- Signed int32: reinterpret the top bit as sign (two's complement).
-- Several currencies (Conquest Points, Imperial Standing, etc.) can go
-- negative; reading them as unsigned would show huge positive numbers.
local function s32le(data, offset)
    local v = u32le(data, offset)
    if v >= 2147483648 then v = v - 4294967296 end
    return v
end

local function read_field(data, field)
    local pos = field.offset + 1  -- fields.lua 0xNN -> addon byte position 0xNN+1
    if field.ctype == 's32' then return s32le(data, pos)
    elseif field.ctype == 'u16' then return u16le(data, pos)
    elseif field.ctype == 'u8' then return data:byte(pos) or 0
    end
    return 0
end

-----------------------------------------------------------------------
-- Dependencies (set via init) and module state.
-----------------------------------------------------------------------
local settings, http_request_fn, json_encode_fn, log_fn, log_error_fn

local state = {}            -- key -> value, merged across both packets
local dirty = false
local loaded_for = nil
local last_payload = nil

function currencies.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-- Drop cached state so the next sync reloads from disk for the new
-- character. Called on logout to prevent the previous character's state
-- from bleeding into the new character's sync flow.
function currencies.reset()
    state = {}
    dirty = false
    loaded_for = nil
    last_payload = nil
end

-- Decode every FIELDS entry belonging to this packet id into `state`.
-- Called from vanalytics.lua's incoming-chunk handler whenever
-- id == 0x113 or id == 0x118.
function currencies.handle_packet(packet_id, data)
    for key, field in pairs(FIELDS) do
        if field.packet == packet_id then
            state[key] = read_field(data, field)
        end
    end
    dirty = true
end

-----------------------------------------------------------------------
-- Disk persistence: one JSON file per character at
-- <addon>/currencies/<name>_<server>.json. Loaded the first time
-- handle_packet or sync sees this character, written on every change.
-----------------------------------------------------------------------
local function cache_path(character_name, server)
    if not character_name or not server then return nil end
    local dir = windower.addon_path .. 'currencies/'
    windower.create_dir(dir)
    return dir .. character_name:lower() .. '_' .. server:lower() .. '.json'
end

local function load_from_disk(character_name, server)
    -- One-shot per character per addon-load. Restores cached state from disk
    -- so users don't have to re-open every currency menu after an addon
    -- reload. Current-session packet data takes priority: we only fill keys
    -- the in-memory state hasn't already received this session.
    local key = (character_name or '') .. '@' .. (server or '')
    if loaded_for == key then return end
    loaded_for = key

    local path = cache_path(character_name, server)
    if not path then return end

    local f = io.open(path, 'r')
    if not f then return end  -- no prior cache; in-memory state stands

    local body = f:read('*a')
    f:close()
    if not body or body == '' then return end

    local json = get_json()
    if not json or not json.parse then return end

    local ok, decoded = pcall(json.parse, body)
    if not ok or type(decoded) ~= 'table' then return end

    -- Merge: only fill keys not already populated by packets this session.
    -- If we restored anything, mark dirty so the first sync ships it.
    local restored = false
    for k, v in pairs(decoded) do
        if state[k] == nil then
            state[k] = v
            restored = true
        end
    end
    if restored then dirty = true end
end

local function save_to_disk(character_name, server)
    local path = cache_path(character_name, server)
    if not path then return end

    local body = json_encode_fn(state)
    local f = io.open(path, 'w')
    if not f then return end
    f:write(body)
    f:close()
end

-----------------------------------------------------------------------
-- Sync to API. Called from do_sync() alongside inventory.sync /
-- progression.sync. No-op if nothing has been captured yet, or if state
-- is unchanged since the last successful POST.
-----------------------------------------------------------------------
function currencies.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end
    load_from_disk(character_name, server)

    if next(state) == nil then on_complete(); return end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        currencies = state,
    })

    if not dirty and payload == last_payload then on_complete(); return end

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/currencies',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'currencies-sync',
    }, function(result, status_code, _, _)
        local ok = false
        if not result then
            log_error_fn('Currencies sync connection failed: ' .. tostring(status_code))
        elseif status_code == 200 then
            ok = true
            dirty = false
            last_payload = payload
            save_to_disk(character_name, server)
        else
            log_error_fn('Currencies sync failed with status ' .. tostring(status_code))
        end
        on_complete(ok)
    end)
end

return currencies
