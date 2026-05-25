-- addon/vanalytics/collection.lua
-- Reads the player's known spells and unlocked key items from Windower's
-- runtime APIs and ships them to /api/sync/collection. No packet parsing
-- needed — both APIs return the current state on demand.
--
--   windower.ffxi.get_spells()    -> { [id] = true } for known spells.
--                                    Includes trusts (Trust is a spell type).
--   windower.ffxi.get_key_items() -> array of unlocked key item IDs.

local collection = {}

-- Windower's bundled JSON lib (for disk cache read-back).
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

local state = {
    spellIds = nil,    -- sorted int array
    keyItemIds = nil,  -- sorted int array
}

local dirty = false
local loaded_for = nil
local last_payload_hash = nil

function collection.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-----------------------------------------------------------------------
-- Disk persistence (per character)
-----------------------------------------------------------------------
local function cache_path(character_name, server)
    if not character_name or not server then return nil end
    local dir = windower.addon_path .. 'collection/'
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

    -- Only fill if not already captured this session (Windower API on next
    -- sync will overwrite anyway, but this keeps the first post non-empty).
    if state.spellIds == nil and decoded.spellIds then
        state.spellIds = decoded.spellIds
        dirty = true
    end
    if state.keyItemIds == nil and decoded.keyItemIds then
        state.keyItemIds = decoded.keyItemIds
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
-- Read player state from Windower runtime
-----------------------------------------------------------------------
local function read_player_state()
    local spells_table = windower.ffxi.get_spells()
    if spells_table then
        local ids = {}
        for id, known in pairs(spells_table) do
            if known then table.insert(ids, id) end
        end
        table.sort(ids)
        state.spellIds = ids
        dirty = true
    end

    local key_items_array = windower.ffxi.get_key_items()
    if key_items_array then
        -- get_key_items returns an array of IDs; sort for stable comparisons.
        local copy = {}
        for _, id in ipairs(key_items_array) do
            table.insert(copy, id)
        end
        table.sort(copy)
        state.keyItemIds = copy
        dirty = true
    end
end

-----------------------------------------------------------------------
-- Sync to API
-----------------------------------------------------------------------
function collection.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end

    load_from_disk(character_name, server)
    read_player_state()

    if state.spellIds == nil and state.keyItemIds == nil then
        on_complete()
        return
    end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        spellIds = state.spellIds,
        keyItemIds = state.keyItemIds,
    })

    if not dirty and payload == last_payload_hash then
        on_complete()
        return
    end

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/collection',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'collection-sync',
    }, function(result, status_code, _, _)
        if not result then
            log_error_fn('Collection sync connection failed: ' .. tostring(status_code))
        elseif status_code == 200 then
            dirty = false
            last_payload_hash = payload
            save_to_disk(character_name, server)
        else
            log_error_fn('Collection sync failed with status ' .. tostring(status_code))
        end
        on_complete()
    end)
end

return collection
