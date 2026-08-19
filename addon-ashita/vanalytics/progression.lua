-- addon/vanalytics/progression.lua
-- Captures FFXI server packet 0x063 sub-types (Orders 0x02/0x05/0x06) that
-- carry progression data: limit/merit points, per-job points/capacity, and
-- the warp/teleport unlock bitmasks. These packets are event-driven (sent
-- when the player visits a homepoint NPC, opens the merit menu, etc.) so
-- the most recent payload of each Order is cached to disk per character,
-- letting the satellite sync ship a complete view even on the first sync
-- after a re-install.

local progression = {}

-- Windower's bundled JSON lib (addons/libs/json.lua) — used for disk cache
-- read-back. Lazy-loaded so a missing lib doesn't break the whole module.
local json_lib = nil
local function get_json()
    if json_lib then return json_lib end
    local ok, lib = pcall(require, 'json')
    if ok then json_lib = lib end
    return json_lib
end

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil

-- Module state — populated by handle_packet, persisted to disk per character.
local state = {
    limitPoints = nil,
    meritPoints = nil,         -- currently held unspent merits (0..meritPointsMax)
    meritPointsMax = nil,
    jobPointsUnlocked = nil,
    jobPoints = nil,   -- array of 24 { jobId, capacityPoints, points, pointsSpent }
    warps = nil,       -- { homePoints, survivalGuides, waypoints, telepoints, cavernousMaws, lycopodium, eschanPortals }
}

local dirty = false           -- has anything changed since the last successful sync?
local loaded_for = nil        -- 'name@server' the on-disk state was loaded for
local last_payload_hash = nil -- avoid POSTing identical bodies repeatedly

-- Drop cached state so the next sync reloads from disk for the new character.
-- Called on logout to prevent the previous character's hash/state from
-- bleeding into the new character's sync flow.
function progression.reset()
    state = {
        limitPoints = nil,
        meritPoints = nil,
        meritPointsMax = nil,
        jobPointsUnlocked = nil,
        jobPoints = nil,
        warps = nil,
    }
    dirty = false
    loaded_for = nil
    last_payload_hash = nil
end

function progression.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-----------------------------------------------------------------------
-- Bit helpers (pure Lua — addon doesn't already require a bit library)
-----------------------------------------------------------------------
local function bit_test(val, bit)
    -- True if bit-N is set in `val`. Safe for uint32 since Lua numbers
    -- are doubles and represent all int32s exactly.
    return (math.floor(val / (2 ^ bit)) % 2) >= 1
end

-- Byte-level reads. We avoid `data:unpack(...)` because Windower's pack
-- library uses non-standard format chars (e.g. 'B' = boolean, not uint8)
-- and isn't documented anywhere accessible. Manual byte composition is
-- bulletproof regardless of what the pack lib does.
local function u16le(data, offset)  -- offset is 1-indexed
    local b0 = data:byte(offset) or 0
    local b1 = data:byte(offset + 1) or 0
    return b0 + b1 * 256
end

local function u32le(data, offset)  -- offset is 1-indexed
    local b0 = data:byte(offset) or 0
    local b1 = data:byte(offset + 1) or 0
    local b2 = data:byte(offset + 2) or 0
    local b3 = data:byte(offset + 3) or 0
    return b0 + b1 * 256 + b2 * 65536 + b3 * 16777216
end

local function bitfield_to_ids(data, byte_offset, num_uint32s, id_base)
    -- Decode `num_uint32s` consecutive uint32s starting at `byte_offset`
    -- (1-indexed) into an array of bit indices. `id_base` is added to
    -- every emitted ID — most categories use 0 here.
    local ids = {}
    for word = 0, num_uint32s - 1 do
        local val = u32le(data, byte_offset + word * 4)
        for bit = 0, 31 do
            if bit_test(val, bit) then
                table.insert(ids, (id_base or 0) + word * 32 + bit)
            end
        end
    end
    return ids
end

-----------------------------------------------------------------------
-- Disk persistence: one JSON file per character at
-- <addon>/progression/<name>_<server>.json. Loaded the first time
-- handle_packet or sync sees this character, written on every change.
-----------------------------------------------------------------------
local function cache_path(character_name, server)
    if not character_name or not server then return nil end
    local dir = windower.addon_path .. 'progression/'
    windower.create_dir(dir)
    return dir .. character_name:lower() .. '_' .. server:lower() .. '.json'
end

local function load_from_disk(character_name, server)
    -- One-shot per character per addon-load. Restores cached state from disk
    -- so users don't have to re-trigger every packet after an addon reload.
    -- Current-session packet data takes priority: we only fill fields the
    -- in-memory state hasn't already received this session.
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

    -- Merge: only fill fields not already populated by packets this session.
    if state.limitPoints == nil then state.limitPoints = decoded.limitPoints end
    if state.meritPoints == nil then state.meritPoints = decoded.meritPoints end
    if state.meritPointsMax == nil then state.meritPointsMax = decoded.meritPointsMax end
    if state.jobPointsUnlocked == nil then state.jobPointsUnlocked = decoded.jobPointsUnlocked end
    if state.jobPoints == nil then state.jobPoints = decoded.jobPoints end
    if state.warps == nil then state.warps = decoded.warps end

    -- If we restored anything, mark dirty so the first sync ships it.
    if decoded.limitPoints or decoded.jobPoints or decoded.warps then
        dirty = true
    end
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
-- Packet parsing: called from vanalytics.lua's incoming-chunk handler
-- whenever id == 0x063. `data` is the full chunk including the 8-byte
-- packet header; Order is the uint16 at offset 0x04.
function progression.handle_packet(data)
    local order = u16le(data, 0x04 + 1)

    if order == 0x02 then
        -- Order 0x02: Merit/Limit Points (packet len=16 confirmed in-game)
        --   0x08 uint16 LimitPoints           (gauge, 0–9999)
        --   0x0A uint8  MeritPoints           (currently held unspent merits)
        --   0x0B uint8  ???                   (still unknown — varies, ~96)
        --   0x0C uint8  MeritPointsMax        (merit cap)
        --   0x0D-0F                           (unknown — varies between packets)
        -- XiPackets claims LP and MeritPointsMax are both uint32; in practice
        -- they're packed 16-bit/8-bit fields. Reading them as uint32 mixes in
        -- adjacent bytes and produces wildly out-of-range numbers.
        state.limitPoints = u16le(data, 0x08 + 1)
        state.meritPoints = data:byte(0x0A + 1)
        state.meritPointsMax = data:byte(0x0C + 1)
        dirty = true

    elseif order == 0x05 then
        -- Order 0x05: Job Points + Capacity Points
        --   0x08 uint8  flags (bit 0 = job points unlocked)
        --   0x09..0x0B  padding
        --   0x0C jobpointentry_t[24] (6 bytes each: u16 capacity, u16 points, u16 spent)
        local flags = data:byte(0x08 + 1) or 0
        state.jobPointsUnlocked = (flags % 2) == 1

        local jobs = {}
        for i = 0, 23 do
            local base = 0x0C + i * 6
            table.insert(jobs, {
                jobId = i,
                capacityPoints = u16le(data, base + 1),
                points = u16le(data, base + 1 + 2),
                pointsSpent = u16le(data, base + 1 + 4),
            })
        end
        state.jobPoints = jobs
        dirty = true

    elseif order == 0x06 then
        -- Order 0x06: Warps / Teleports bitmasks. Byte ranges and category
        -- meanings sourced from XIchecklist (util/warps.lua + maps/warps.lua):
        --   0x08..0x17 home points       (4 uint32, 128 bits)
        --   0x18..0x27 survival guides   (4 uint32, 128 bits)
        --   0x28..0x37 waypoints         (4 uint32, 128 bits)
        --   0x38..0x3B telepoints        (1 uint32, 32 bits)
        --   0x3C..0x3F cavernous maws + lycopodium (shared uint32 —
        --              bits 0..8 are maws, bits 13..15 are lycopodium)
        --   0x40..0x43 eschan portals    (1 uint32, 32 bits)
        --   NOTE: XiPackets calls the 0x3C field "atmos" but per XIchecklist's
        --   in-game decoding, it's actually maws+lycopodium. Atmas (Abyssea)
        --   are tracked via key items, not warps.

        local maw_lyco = bitfield_to_ids(data, 0x3C + 1, 1, 0)
        local maws, lyco = {}, {}
        for _, bit in ipairs(maw_lyco) do
            if bit <= 8 then
                table.insert(maws, bit)
            elseif bit >= 13 and bit <= 15 then
                table.insert(lyco, bit)
            end
        end

        state.warps = {
            homePoints     = bitfield_to_ids(data, 0x08 + 1, 4, 0),
            survivalGuides = bitfield_to_ids(data, 0x18 + 1, 4, 0),
            waypoints      = bitfield_to_ids(data, 0x28 + 1, 4, 0),
            telepoints     = bitfield_to_ids(data, 0x38 + 1, 1, 0),
            cavernousMaws  = maws,
            lycopodium     = lyco,
            eschanPortals  = bitfield_to_ids(data, 0x40 + 1, 1, 0),
        }
        dirty = true
    end
end

-----------------------------------------------------------------------
-- Sync to API. Called from do_sync() alongside inventory.sync /
-- porter.sync. No-op if nothing has been captured yet, or if state
-- is unchanged since the last successful POST.
-----------------------------------------------------------------------
function progression.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end

    load_from_disk(character_name, server)

    if not state.limitPoints and not state.jobPoints and not state.warps then
        on_complete()
        return
    end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        limitPoints = state.limitPoints,
        meritPoints = state.meritPoints,
        meritPointsMax = state.meritPointsMax,
        jobPointsUnlocked = state.jobPointsUnlocked,
        jobPoints = state.jobPoints,
        warps = state.warps,
    })

    -- Skip redundant POSTs — server-side data is keyed by character and
    -- only changes when packets actually deliver new state.
    if not dirty and payload == last_payload_hash then
        on_complete()
        return
    end

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/progression',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'progression-sync',
    }, function(result, status_code, _, _)
        local ok = false
        if not result then
            log_error_fn('Progression sync connection failed: ' .. tostring(status_code))
        elseif status_code == 200 then
            ok = true
            dirty = false
            last_payload_hash = payload
            save_to_disk(character_name, server)
        else
            log_error_fn('Progression sync failed with status ' .. tostring(status_code))
        end
        on_complete(ok)
    end)
end

return progression
