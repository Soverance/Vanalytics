-- addon/vanalytics/inventory.lua
-- Inventory snapshot capture and diff-based upload module

local inventory = {}
local res = require('resources')
local extdata_util = require('extdata_util')

-- State
local previous_snapshot = nil

-- Drop the cached snapshot so the next sync runs as a full sync. Called on
-- logout to prevent diffing the new character's inventory against the
-- previous character's snapshot.
function inventory.reset()
    previous_snapshot = nil
end

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil
local flog_fn = function() end  -- file-only breadcrumb; no-op until init

-----------------------------------------------------------------------
-- Bag mapping: Windower bag keys -> API bag names
-----------------------------------------------------------------------
local bag_keys = {
    {key = 'inventory', name = 'Inventory', id = 0},
    {key = 'safe', name = 'Safe', id = 1},
    {key = 'safe2', name = 'Safe2', id = 9},
    {key = 'storage', name = 'Storage', id = 2},
    {key = 'locker', name = 'Locker', id = 4},
    {key = 'satchel', name = 'Satchel', id = 5},
    {key = 'sack', name = 'Sack', id = 6},
    {key = 'case', name = 'Case', id = 7},
    {key = 'wardrobe', name = 'Wardrobe', id = 8},
    {key = 'wardrobe2', name = 'Wardrobe2', id = 10},
    {key = 'wardrobe3', name = 'Wardrobe3', id = 11},
    {key = 'wardrobe4', name = 'Wardrobe4', id = 12},
    {key = 'wardrobe5', name = 'Wardrobe5', id = 13},
    {key = 'wardrobe6', name = 'Wardrobe6', id = 14},
    {key = 'wardrobe7', name = 'Wardrobe7', id = 15},
    {key = 'wardrobe8', name = 'Wardrobe8', id = 16},
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
    flog_fn = deps.flog or function() end
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
                        augments = extdata_util.decode_augments(item),
                    }
                end
            end
        end
    end

    return snapshot
end

-----------------------------------------------------------------------
-- Read each bag's unlocked capacity via get_bag_info.
-- Returns a table keyed by API bag name -> max slots. Only includes
-- bags the character has actually unlocked (max > 0); locked bags are
-- omitted so the UI can hide them.
-----------------------------------------------------------------------
function inventory.read_capacities()
    local capacities = {}
    for _, bag_entry in ipairs(bag_keys) do
        local info = windower.ffxi.get_bag_info(bag_entry.id)
        if info and type(info.max) == 'number' and info.max > 0 then
            capacities[bag_entry.name] = info.max
        end
    end
    return capacities
end

-- Order-sensitive equality for two augment arrays (either may be nil).
local function augments_equal(a, b)
    if a == nil and b == nil then return true end
    if a == nil or b == nil then return false end
    if #a ~= #b then return false end
    for i = 1, #a do
        if a[i] ~= b[i] then return false end
    end
    return true
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
                augments = new_item.augments,
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
                    augments = new_item.augments,
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
            -- Augment-only change. This is an elseif after the quantity check, so a
            -- simultaneous quantity+augment change would report only QuantityChanged.
            -- Safe in practice: augmented gear is non-stackable (count always 1), so an
            -- augmented item's quantity never changes.
            elseif not augments_equal(old_item.augments, new_item.augments) then
                -- Same item and quantity, augments re-rolled in place
                table.insert(changes, {
                    changeType = 'AugmentsChanged',
                    item_id = new_item.item_id,
                    bag = new_item.bag,
                    slot_index = new_item.slot_index,
                    quantityBefore = old_item.quantity,
                    quantityAfter = new_item.quantity,
                    augments = new_item.augments,
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
-- Sync inventory changes to the API (async). on_complete() fires when the
-- request resolves (or immediately if there's nothing to send).
-----------------------------------------------------------------------
function inventory.sync(character_name, server, on_complete)
    on_complete = on_complete or function() end

    local current_snapshot = inventory.read_snapshot()

    -- First run: treat entire inventory as "Added" so the server gets the full state.
    -- Also flag as fullSync so the backend clears stale records first.
    local is_full_sync = previous_snapshot == nil
    if is_full_sync then
        previous_snapshot = {}
    end

    local changes = inventory.compute_diff(previous_snapshot, current_snapshot)
    flog_fn('inventory: fullSync=' .. tostring(is_full_sync) .. ' changes=' .. #changes)

    -- No changes and not a full sync, return silently
    if #changes == 0 and not is_full_sync then
        flog_fn('inventory: no changes, skipping')
        on_complete()
        return
    end

    local api_changes = {}
    for _, change in ipairs(changes) do
        table.insert(api_changes, {
            itemId = change.item_id,
            bag = change.bag,
            slotIndex = change.slot_index,
            changeType = change.changeType,
            quantityBefore = change.quantityBefore,
            quantityAfter = change.quantityAfter,
            augments = change.augments,
        })
    end

    local payload = json_encode_fn({
        characterName = character_name,
        server = server,
        changes = api_changes,
        fullSync = is_full_sync,
        bagCapacities = inventory.read_capacities(),
    })

    http_request_fn({
        url = settings.ApiUrl .. '/api/sync/inventory',
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'inventory-sync',
        -- A first-run full sync ships the entire inventory and the backend
        -- clears stale rows + bulk-inserts, which can run well past the 30s
        -- default deadline and spuriously time out. Give it a generous window;
        -- incremental diffs are small and keep the default.
        timeout = is_full_sync and 120 or nil,
    }, function(result, status_code, _, _)
        if not result then
            log_error_fn('Inventory sync connection failed: ' .. tostring(status_code))
            flog_fn('inventory: POST connection failed')
            -- A failed full sync must re-run as a full sync next time; resetting
            -- to nil (not {}) forces that. A failed diff leaves the snapshot
            -- untouched so the same diff is retried.
            if is_full_sync then previous_snapshot = nil end
            on_complete(false)
            return
        end

        flog_fn('inventory: POST status=' .. tostring(status_code))
        local ok = status_code == 200
        if ok then
            -- Advance only on success so a failed sync never loses its diff.
            previous_snapshot = current_snapshot
        else
            log_error_fn('Inventory sync failed with status ' .. tostring(status_code))
            if is_full_sync then previous_snapshot = nil end
        end
        on_complete(ok)
    end)
end

return inventory
