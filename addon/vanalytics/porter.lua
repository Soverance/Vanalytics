-- addon/vanalytics/porter.lua
-- Reads Porter Moogle storage slip contents from carried slip items' extdata
-- and uploads them to the Vanalytics API. Decoding is delegated to the
-- official Windower 'slips' library (addons/libs/slips.lua), which walks the
-- player's bags, identifies slip items, and unpacks each slip's 16-byte
-- bitmap against its catalog of possible items.

local porter = {}

-- Slips lib is lazy-loaded so a missing slips.lua doesn't break the whole
-- Vanalytics addon — it just disables porter sync.
local slips_lib = nil
local slips_load_failed = false
local function get_slips()
    if slips_lib or slips_load_failed then return slips_lib end
    local ok, lib = pcall(require, 'slips')
    if ok then slips_lib = lib else slips_load_failed = true end
    return slips_lib
end

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil

function porter.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-----------------------------------------------------------------------
-- Read a snapshot of all slips the player currently carries and the items
-- stored on each. Returns a list of { slipItemId, slipNumber, itemIds }.
-----------------------------------------------------------------------
function porter.read_snapshot()
    local lib = get_slips()
    if not lib then return {} end

    local player_items = lib.get_player_items()
    if not player_items then return {} end

    local out = {}
    for slip_item_id, item_list in pairs(player_items) do
        local slip_number = 0
        if lib.get_slip_number_by_id then
            slip_number = lib.get_slip_number_by_id(slip_item_id) or 0
        end

        local item_ids = {}
        for _, item_id in ipairs(item_list) do
            if item_id and item_id ~= 0 then
                table.insert(item_ids, item_id)
            end
        end

        table.insert(out, {
            slipItemId = slip_item_id,
            slipNumber = slip_number,
            itemIds = item_ids,
        })
    end
    return out
end

-----------------------------------------------------------------------
-- Sync porter contents to the API. No-op if no slips are carried this
-- session — server-side state is authoritative-by-slip and untouched slips
-- keep their last known contents.
-----------------------------------------------------------------------
function porter.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end

    local slips_payload = porter.read_snapshot()
    if #slips_payload == 0 then on_complete() return end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        slips = slips_payload,
    })

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/porter',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'porter-sync',
    }, function(result, status_code, _, _)
        if not result then
            log_error_fn('Porter sync connection failed: ' .. tostring(status_code))
        elseif status_code ~= 200 then
            log_error_fn('Porter sync failed with status ' .. tostring(status_code))
        end
        on_complete()
    end)
end

return porter
