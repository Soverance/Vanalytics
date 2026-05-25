-- addon/vanalytics/missions.lua
-- Captures FFXI server packet 0x056 sub-types that carry mission state:
--   Type 0x00D0  Nation + Zilart completed missions (bitfield)
--   Type 0x00D8  ToAU + WotG completed missions (bitfield)
--   Type 0x00C0  Assault completed missions (bitfield) — co-packet with ToAU quests
--   Type 0xFFFE  Current TVR mission (pointer)
--   Type 0xFFFF  Current CoP/ACP/MKD/ASA/SoA/RoV missions (pointers)
--
-- Trigger: zoning. Same as packet 0x063 — per XIchecklist:
--   "Require zoning to update Quests / Warps / Monstrosity / MMM"
--
-- Bitfield decoding: each completion field is 8 bytes (64 bits). We use the
-- same u32le + bit_test helpers from progression.lua's pattern. Pointer
-- fields are 4-byte ints unpacked via Windower's packets.parse, which has
-- named field definitions for all 0x056 sub-types (verified in
-- Windower/Lua addons/libs/packets/fields.lua).
--
-- Mission catalog and packet-handler logic adapted from XIchecklist
-- (github.com/HiPotionQ8/XIchecklist) with author's permission.

local packets = require('packets')

local missions = {}

-- Windower's JSON lib (used for disk cache read-back)
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

-- Module state: per-line { completed = {...} } for bitfield lines,
-- { current = N } for pointer lines. Mirrors the API DTO shape.
local state = {}

local dirty = false
local loaded_for = nil
local last_payload_hash = nil

function missions.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-----------------------------------------------------------------------
-- Bit decoding helpers — same approach as progression.lua. Avoid
-- `data:unpack(...)` since Windower's pack lib is unreliable.
-----------------------------------------------------------------------
local function bit_test(val, bit)
    return (math.floor(val / (2 ^ bit)) % 2) >= 1
end

-- Decode an 8-byte (64-bit) string into an array of set bit indices.
-- `s` is the raw byte string (e.g. p['Completed San d\'Oria Missions']).
local function bitstring_to_ids(s)
    local ids = {}
    if not s then return ids end
    local len = #s
    for byte_idx = 1, math.min(len, 8) do
        local b = s:byte(byte_idx) or 0
        for bit = 0, 7 do
            if bit_test(b, bit) then
                table.insert(ids, (byte_idx - 1) * 8 + bit)
            end
        end
    end
    return ids
end

-----------------------------------------------------------------------
-- Disk persistence (per character)
-----------------------------------------------------------------------
local function cache_path(character_name, server)
    if not character_name or not server then return nil end
    local dir = windower.addon_path .. 'missions/'
    os.execute('mkdir "' .. dir:gsub('/', '\\') .. '" 2>NUL')
    return dir .. character_name:lower() .. '_' .. server:lower() .. '.json'
end

local function load_from_disk(character_name, server)
    local key = (character_name or '') .. '@' .. (server or '')
    if loaded_for == key then return end
    loaded_for = key

    local path = cache_path(character_name, server)
    if not path then return end

    local f = io.open(path, 'r')
    if not f then return end

    local body = f:read('*a')
    f:close()
    if not body or body == '' then return end

    local json = get_json()
    if not json or not json.parse then return end

    local ok, decoded = pcall(json.parse, body)
    if not ok or type(decoded) ~= 'table' then return end

    -- Fill only lines not yet captured this session.
    for line_key, line_state in pairs(decoded) do
        if state[line_key] == nil then
            state[line_key] = line_state
            dirty = true
        end
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
-- Packet handler
-----------------------------------------------------------------------
local function set_completed(line_key, raw_bytes)
    state[line_key] = { completed = bitstring_to_ids(raw_bytes) }
    dirty = true
end

local function set_current(line_key, current_int)
    if not current_int then return end
    state[line_key] = { current = current_int }
    dirty = true
end

-- Debug dump: log the first time each Type arrives (and the first time the
-- packet arrives at all if Type can't be extracted). Once per addon load.
local debug_dumped = {}
local function debug_dump(label, data)
    if debug_dumped[label] then return end
    debug_dumped[label] = true
    local dir = windower.addon_path .. 'missions/'
    os.execute('mkdir "' .. dir:gsub('/', '\\') .. '" 2>NUL')
    local f = io.open(dir .. 'debug.log', 'a')
    if not f then return end
    local hex = {}
    local total = #data
    for i = 1, math.min(80, total) do
        hex[#hex + 1] = string.format('%02X', data:byte(i))
    end
    f:write(string.format(
        '[%s] 0x056 %s len=%d bytes=%s\n',
        os.date('%H:%M:%S'), label, total, table.concat(hex, ' ')
    ))
    f:close()
end

function missions.handle_packet(data)
    -- Packets.parse handles the Type extraction — different incoming packets
    -- locate Type at different offsets, so trust Windower's parser rather
    -- than reading bytes manually (the approach XIchecklist takes).
    local ok, p = pcall(packets.parse, 'incoming', data)
    if not ok or not p then
        debug_dump('parse-failed', data)
        return
    end

    local pkt_type = p.Type
    if not pkt_type then
        debug_dump('no-type-field', data)
        return
    end

    debug_dump(string.format('Type=0x%04X', pkt_type), data)

    if pkt_type == 0x00D0 then
        -- Sandy + Bastok + Windurst + Zilart completed
        set_completed('sandoriaMissions', p["Completed San d'Oria Missions"])
        set_completed('bastokMissions', p['Completed Bastok Missions'])
        set_completed('windurstMissions', p['Completed Windurst Missions'])
        set_completed('zilartMissions', p['Completed Zilart Missions'])

    elseif pkt_type == 0x00D8 then
        -- ToAU + WotG completed
        set_completed('ahturhganMissions', p['Completed TOAU Missions'])
        set_completed('wotgMissions', p['Completed WOTG Missions'])

    elseif pkt_type == 0x00C0 then
        -- Co-packet with ToAU current quests; we only want the Assault bitfield
        if p['Completed Assaults'] then
            set_completed('assaults', p['Completed Assaults'])
        end

    elseif pkt_type == 0xFFFE then
        -- TVR current mission (single pointer)
        set_current('tvrMissions', p['Current TVR Mission'])

    elseif pkt_type == 0xFFFF then
        -- Multiple pointer-style lines in one packet
        set_current('copMissions', p['Current COP Mission'])
        set_current('acpMissions', p['Current ACP Mission'])
        set_current('mkdMissions', p['Current MKD Mission'])
        set_current('asaMissions', p['Current ASA Mission'])
        set_current('soaMissions', p['Current SOA Mission'])
        set_current('rovMissions', p['Current ROV Mission'])
    end
end

-----------------------------------------------------------------------
-- Sync to API
-----------------------------------------------------------------------
function missions.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end

    load_from_disk(character_name, server)

    if next(state) == nil then
        on_complete()
        return
    end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        sandoriaMissions  = state.sandoriaMissions,
        bastokMissions    = state.bastokMissions,
        windurstMissions  = state.windurstMissions,
        zilartMissions    = state.zilartMissions,
        ahturhganMissions = state.ahturhganMissions,
        wotgMissions      = state.wotgMissions,
        assaults          = state.assaults,
        copMissions       = state.copMissions,
        acpMissions       = state.acpMissions,
        mkdMissions       = state.mkdMissions,
        asaMissions       = state.asaMissions,
        soaMissions       = state.soaMissions,
        rovMissions       = state.rovMissions,
        tvrMissions       = state.tvrMissions,
    })

    if not dirty and payload == last_payload_hash then
        on_complete()
        return
    end

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/missions',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'missions-sync',
    }, function(result, status_code, _, _)
        if not result then
            log_error_fn('Missions sync connection failed: ' .. tostring(status_code))
        elseif status_code == 200 then
            dirty = false
            last_payload_hash = payload
            save_to_disk(character_name, server)
        else
            log_error_fn('Missions sync failed with status ' .. tostring(status_code))
        end
        on_complete()
    end)
end

return missions
