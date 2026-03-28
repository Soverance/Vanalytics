-- addon/vanalytics/inventory.lua
-- Inventory snapshot capture and diff-based upload module

local inventory = {}
local res = require('resources')

-- State
local previous_snapshot = nil

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil

-----------------------------------------------------------------------
-- Bag mapping: Windower bag keys -> API bag names
-----------------------------------------------------------------------
local bag_keys = {
    {key = 'inventory', name = 'Inventory'},
    {key = 'safe', name = 'Safe'},
    {key = 'safe2', name = 'Safe2'},
    {key = 'storage', name = 'Storage'},
    {key = 'locker', name = 'Locker'},
    {key = 'satchel', name = 'Satchel'},
    {key = 'sack', name = 'Sack'},
    {key = 'case', name = 'Case'},
    {key = 'wardrobe', name = 'Wardrobe'},
    {key = 'wardrobe2', name = 'Wardrobe2'},
    {key = 'wardrobe3', name = 'Wardrobe3'},
    {key = 'wardrobe4', name = 'Wardrobe4'},
    {key = 'wardrobe5', name = 'Wardrobe5'},
    {key = 'wardrobe6', name = 'Wardrobe6'},
    {key = 'wardrobe7', name = 'Wardrobe7'},
    {key = 'wardrobe8', name = 'Wardrobe8'},
}

-----------------------------------------------------------------------
-- Initialize with dependencies from the main addon
-----------------------------------------------------------------------
function inventory.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
end

-----------------------------------------------------------------------
-- Read a full inventory snapshot from Windower
-- Returns a table keyed by "BagName:SlotIndex"
-----------------------------------------------------------------------
function inventory.read_snapshot()
    local items = windower.ffxi.get_items()
    if not items then return {} end

    local snapshot = {}

    for _, bag_entry in ipairs(bag_keys) do
        local bag = items[bag_entry.key]
        if bag then
            for slot_index, item in pairs(bag) do
                if type(item) == 'table' and item.id and item.id ~= 0 then
                    local key = bag_entry.name .. ':' .. slot_index
                    snapshot[key] = {
                        item_id = item.id,
                        quantity = item.count,
                        bag = bag_entry.name,
                        slot_index = slot_index,
                    }
                end
            end
        end
    end

    return snapshot
end

-----------------------------------------------------------------------
-- Compute diff between old and new snapshots
-- Returns a list of change entries
-----------------------------------------------------------------------
function inventory.compute_diff(old_snap, new_snap)
    local changes = {}

    -- Check new keys: added or changed
    for key, new_item in pairs(new_snap) do
        local old_item = old_snap[key]
        if not old_item then
            -- Item added to this slot
            table.insert(changes, {
                changeType = 'Added',
                item_id = new_item.item_id,
                bag = new_item.bag,
                slot_index = new_item.slot_index,
                quantityBefore = 0,
                quantityAfter = new_item.quantity,
            })
        else
            -- Slot exists in both snapshots
            if old_item.item_id ~= new_item.item_id then
                -- Different item in same slot: removed old, added new
                table.insert(changes, {
                    changeType = 'Removed',
                    item_id = old_item.item_id,
                    bag = old_item.bag,
                    slot_index = old_item.slot_index,
                    quantityBefore = old_item.quantity,
                    quantityAfter = 0,
                })
                table.insert(changes, {
                    changeType = 'Added',
                    item_id = new_item.item_id,
                    bag = new_item.bag,
                    slot_index = new_item.slot_index,
                    quantityBefore = 0,
                    quantityAfter = new_item.quantity,
                })
            elseif old_item.quantity ~= new_item.quantity then
                -- Same item, quantity changed
                table.insert(changes, {
                    changeType = 'QuantityChanged',
                    item_id = new_item.item_id,
                    bag = new_item.bag,
                    slot_index = new_item.slot_index,
                    quantityBefore = old_item.quantity,
                    quantityAfter = new_item.quantity,
                })
            end
        end
    end

    -- Check old keys not in new: removed
    for key, old_item in pairs(old_snap) do
        if not new_snap[key] then
            table.insert(changes, {
                changeType = 'Removed',
                item_id = old_item.item_id,
                bag = old_item.bag,
                slot_index = old_item.slot_index,
                quantityBefore = old_item.quantity,
                quantityAfter = 0,
            })
        end
    end

    return changes
end

-----------------------------------------------------------------------
-- Sync inventory changes to the API
-----------------------------------------------------------------------
function inventory.sync(character_name, server)
    local current_snapshot = inventory.read_snapshot()

    -- First run: treat entire inventory as "Added" so the server gets the full state
    if previous_snapshot == nil then
        previous_snapshot = {}
    end

    -- Compute diff (on first run, everything in current is "new" vs empty previous)
    local changes = inventory.compute_diff(previous_snapshot, current_snapshot)

    -- No changes, return silently
    if #changes == 0 then
        return
    end

    -- Build API-shaped change entries
    local api_changes = {}
    for _, change in ipairs(changes) do
        table.insert(api_changes, {
            itemId = change.item_id,
            bag = change.bag,
            slotIndex = change.slot_index,
            changeType = change.changeType,
            quantityBefore = change.quantityBefore,
            quantityAfter = change.quantityAfter,
        })
    end

    local body = {
        characterName = character_name,
        server = server,
        changes = api_changes,
    }

    local payload = json_encode_fn(body)
    local url = settings.ApiUrl .. '/api/sync/inventory'
    local ltn12 = require('ltn12')

    local response_body = {}
    local result, status_code, headers = http_request_fn({
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
        log_error_fn('Inventory sync connection failed: ' .. tostring(status_code))
        return
    end

    -- Update snapshot regardless of status so we don't re-send same diff
    previous_snapshot = current_snapshot

    if status_code == 200 then
        log_fn('Inventory synced: ' .. #changes .. ' change(s)')
    else
        log_error_fn('Inventory sync failed with status ' .. tostring(status_code))
    end
end

return inventory
