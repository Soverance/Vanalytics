-- addon/vanalytics/moves.lua
-- Inventory move order polling, validation, and execution module

local moves = {}

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local json_decode_fn = nil
local log_fn = nil
local log_error_fn = nil
local log_success_fn = nil
local enqueue_fn = nil -- function to add work to the main work queue

-- Pending moves from last poll
local pending_moves = nil

-----------------------------------------------------------------------
-- API bag name -> Windower bag ID mapping
-- Used for packet injection (outgoing 0x029)
-----------------------------------------------------------------------
-- Matches Windower's bag_ids from the Organizer addon
-- Note: bag 3 is "temporary" (not a user bag), bag 4 is Locker
local api_to_bag_id = {
    Inventory = 0,
    Safe      = 1,
    Storage   = 2,
    Locker    = 4,
    Satchel   = 5,
    Sack      = 6,
    Case      = 7,
    Wardrobe  = 8,
    Safe2     = 9,
    Wardrobe2 = 10,
    Wardrobe3 = 11,
    Wardrobe4 = 12,
    Wardrobe5 = 13,
    Wardrobe6 = 14,
    Wardrobe7 = 15,
    Wardrobe8 = 16,
}

-- API bag name -> Windower bag key (for get_items() access check)
local api_to_bag_key = {
    Inventory = 'inventory',
    Safe      = 'safe',
    Storage   = 'storage',
    Locker    = 'locker',
    Satchel   = 'satchel',
    Sack      = 'sack',
    Case      = 'case',
    Wardrobe  = 'wardrobe',
    Safe2     = 'safe2',
    Wardrobe2 = 'wardrobe2',
    Wardrobe3 = 'wardrobe3',
    Wardrobe4 = 'wardrobe4',
    Wardrobe5 = 'wardrobe5',
    Wardrobe6 = 'wardrobe6',
    Wardrobe7 = 'wardrobe7',
    Wardrobe8 = 'wardrobe8',
}

-----------------------------------------------------------------------
-- Initialize with dependencies from the main addon
-----------------------------------------------------------------------
function moves.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    json_decode_fn = deps.json_decode
    log_fn = deps.log
    log_error_fn = deps.log_error
    log_success_fn = deps.log_success
    enqueue_fn = deps.enqueue
end

-----------------------------------------------------------------------
-- Poll for pending moves (called during sync cycle)
-- Does NOT execute — just checks and notifies the user.
-----------------------------------------------------------------------
function moves.check_pending(silent)
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local ltn12 = require('ltn12')
    local response_body = {}

    local url = settings.ApiUrl .. '/api/sync/inventory/moves/pending'
    local result, status_code = http_request_fn({
        url = url,
        method = 'GET',
        headers = {
            ['X-Api-Key'] = settings.ApiKey,
        },
        sink = ltn12.sink.table(response_body),
    })

    if not result then
        log_error_fn('Moves check: connection failed (' .. tostring(status_code) .. ')')
        return
    end

    if status_code ~= 200 then
        log_error_fn('Moves check: HTTP ' .. tostring(status_code))
        return
    end

    local body = table.concat(response_body)
    local data = json_decode_fn(body)
    if not data or not data.moves or #data.moves == 0 then
        pending_moves = nil
        return
    end

    pending_moves = data.moves
    if not silent then
        log_fn(#pending_moves .. ' pending inventory move(s). Type //va moves execute to run them.')
    end
end

-----------------------------------------------------------------------
-- Show status of pending moves (polls fresh from server)
-----------------------------------------------------------------------
function moves.status()
    moves.check_pending(true)
    if not pending_moves or #pending_moves == 0 then
        log_fn('No pending inventory moves.')
        return
    end

    log_fn(#pending_moves .. ' pending move(s):')
    for _, m in ipairs(pending_moves) do
        log_fn('  ' .. m.quantity .. 'x ' .. m.itemName .. ': ' .. m.fromBag .. ' -> ' .. m.toBag)
    end
end

-----------------------------------------------------------------------
-- Check which bags are currently accessible
-- Returns a set of API bag names that are accessible
-----------------------------------------------------------------------
local function get_accessible_bags()
    local items = windower.ffxi.get_items()
    if not items then return {} end

    local accessible = {}
    for api_name, bag_key in pairs(api_to_bag_key) do
        if items[bag_key] then
            accessible[api_name] = true
        end
    end
    return accessible
end

-----------------------------------------------------------------------
-- Inject an item move packet using Windower's packets library.
-- This lets Windower handle the packet structure/field layout
-- rather than guessing at raw byte offsets.
-----------------------------------------------------------------------
-- Find the target slot in the destination bag for a given item.
-- Prefers an existing stack of the same item (for consolidation).
-- Falls back to the first empty slot.
-- Returns the 1-based slot index, or nil if no room.
-----------------------------------------------------------------------
local function find_target_slot(to_bag_key, item_id)
    local items = windower.ffxi.get_items()
    if not items then return nil end
    local bag = items[to_bag_key]
    if not bag then return nil end

    -- First pass: find an existing stack of the same item
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            return slot_index
        end
    end

    -- Second pass: find the first empty slot
    -- Windower bag tables only contain occupied slots, so we
    -- need to find a gap. Bag max is typically 80.
    local max_slots = bag.max or 80
    for i = 1, max_slots do
        if not bag[i] or type(bag[i]) ~= 'table' or bag[i].id == 0 then
            return i
        end
    end

    return nil
end

-----------------------------------------------------------------------
-- Inject an item move packet using raw byte construction +
-- windower.packets.inject_outgoing (which handles the sequence number).
--
-- Packet 0x029 layout (12 bytes):
--   0x00: packet ID (0x29)
--   0x01: size in 4-byte words (0x06)
--   0x02-0x03: sequence (filled by Windower)
--   0x04-0x07: count (uint32 LE)
--   0x08: source bag ID (Bag)
--   0x09: destination bag ID (Target Bag)
--   0x0A: source slot index (Current Index, 1-based)
--   0x0B: unknown (0x52 in all captured real packets)
-----------------------------------------------------------------------
-----------------------------------------------------------------------
-- Find an existing partial stack of an item in a destination bag.
-- Returns the slot index if found, or 0x52 (auto-place) if no
-- existing stack exists.
-----------------------------------------------------------------------
local function find_stack_slot(to_bag_key, item_id)
    if not to_bag_key then return 0x52 end
    local items = windower.ffxi.get_items()
    if not items then return 0x52 end
    local bag = items[to_bag_key]
    if not bag then return 0x52 end
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            return slot_index
        end
    end
    return 0x52
end

-----------------------------------------------------------------------
-- Inject a move packet matching Organizer's proven approach.
-- dest_slot targets a specific slot (for stacking) or 0x52 for auto-place.
-----------------------------------------------------------------------
local function inject_move(quantity, from_bag_id, from_slot, to_bag_id, dest_slot)
    dest_slot = dest_slot or 0x52

    local packet = string.char(0x29, 6, 0, 0)
        .. ('I'):pack(quantity)
        .. string.char(from_bag_id, to_bag_id, from_slot, dest_slot)

    windower.packets.inject_outgoing(0x29, packet)
    return true
end

-----------------------------------------------------------------------
-- Find the CURRENT slot of an item in a bag by reading live game data.
-- The database slot index may be stale if inventory changed since sync.
-- Returns the 1-based slot index, or nil if not found.
-----------------------------------------------------------------------
local function find_current_slot(bag_key, item_id)
    local items = windower.ffxi.get_items()
    if not items then return nil end
    local bag = items[bag_key]
    if not bag then return nil end
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            return slot_index
        end
    end
    return nil
end

function moves.on_outgoing_packet(id, data)
end

-----------------------------------------------------------------------
-- Check if an item is still in the expected source slot
-- Returns true if the item is still there (move failed), false if gone
-----------------------------------------------------------------------
local function item_still_in_slot(from_bag_key, from_slot, item_id)
    local items = windower.ffxi.get_items()
    if not items then return true end  -- assume failure if can't read
    local bag = items[from_bag_key]
    if not bag then return true end
    local slot = bag[from_slot]
    if not slot or type(slot) ~= 'table' then return false end  -- slot empty = moved
    return slot.id == item_id
end

-----------------------------------------------------------------------
-- Find the slot an item landed in after a move to a bag
-- Returns the slot index (1-based) or nil if not found
-----------------------------------------------------------------------
local function find_item_in_bag(bag_key, item_id)
    local items = windower.ffxi.get_items()
    if not items then return nil end
    local bag = items[bag_key]
    if not bag then return nil end
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            return slot_index
        end
    end
    return nil
end

-----------------------------------------------------------------------
-- Enqueue a single direct move (fromBag -> toBag) with verification.
-- Calls on_result(true) or on_result(false) after verification.
-----------------------------------------------------------------------
-----------------------------------------------------------------------
-- on_error: optional callback for detailed failure reason.
-- If nil, failures are silent (the caller handles reporting).
-----------------------------------------------------------------------
local function enqueue_direct_move(m, from_bag, from_slot_hint, to_bag, on_result, on_error)
    local from_bag_id = api_to_bag_id[from_bag]
    local to_bag_id = api_to_bag_id[to_bag]
    local from_bag_key = api_to_bag_key[from_bag]

    local injected_slot = nil

    -- Frame 1: find current slot and inject packet
    enqueue_fn(function()
        if not from_bag_id or not to_bag_id then
            if on_error then on_error('unknown bag: ' .. tostring(from_bag) .. ' / ' .. tostring(to_bag)) end
            on_result(false)
            return
        end

        local actual_slot = find_current_slot(from_bag_key, m.itemId)
        if not actual_slot then
            if on_error then on_error('item not found in ' .. from_bag) end
            on_result(false)
            return
        end

        injected_slot = actual_slot
        local to_bag_key = api_to_bag_key[to_bag]
        local dest_slot = find_stack_slot(to_bag_key, m.itemId)
        inject_move(m.quantity, from_bag_id, actual_slot, to_bag_id, dest_slot)
    end)

    -- Wait ~1 second for game to process
    for _ = 1, 60 do
        enqueue_fn(function() end)
    end

    -- Verify the specific slot we moved from is now empty
    enqueue_fn(function()
        if not injected_slot then
            on_result(false)
            return
        end

        if not item_still_in_slot(from_bag_key, injected_slot, m.itemId) then
            on_result(true)
        else
            if on_error then on_error('item did not leave ' .. from_bag .. ' slot ' .. injected_slot) end
            on_result(false)
        end
    end)
end

-----------------------------------------------------------------------
-- Execute all pending moves (called by //va moves execute)
--
-- FFXI quirk: items can only be moved to/from Inventory directly.
-- Moving between two non-Inventory bags (e.g., Satchel -> Locker)
-- requires a two-step process: Source -> Inventory -> Destination.
-----------------------------------------------------------------------
function moves.execute()
    if not pending_moves or #pending_moves == 0 then
        log_fn('No pending inventory moves.')
        return
    end

    local accessible = get_accessible_bags()

    -- Partition into executable and skipped
    local executable = {}
    local skipped = {}
    local missing_bags = {}

    for _, m in ipairs(pending_moves) do
        local from_ok = accessible[m.fromBag]
        local to_ok = accessible[m.toBag]
        -- Two-step moves also need Inventory to be accessible
        local needs_inventory = m.fromBag ~= 'Inventory' and m.toBag ~= 'Inventory'
        local inv_ok = not needs_inventory or accessible['Inventory']

        if from_ok and to_ok and inv_ok then
            table.insert(executable, m)
        else
            table.insert(skipped, m)
            if not from_ok then missing_bags[m.fromBag] = true end
            if not to_ok then missing_bags[m.toBag] = true end
            if needs_inventory and not inv_ok then missing_bags['Inventory'] = true end
        end
    end

    if #executable == 0 then
        local bag_list = {}
        for bag in pairs(missing_bags) do table.insert(bag_list, bag) end
        log_error_fn('Cannot execute — requires access to: ' .. table.concat(bag_list, ', ') .. '. Try from your Mog House.')
        return
    end

    if #skipped > 0 then
        local bag_list = {}
        for bag in pairs(missing_bags) do table.insert(bag_list, bag) end
        log_fn('Skipped ' .. #skipped .. ' move(s) — requires access to: ' .. table.concat(bag_list, ', '))
    end

    local succeeded_ids = {}
    local failed_count = 0

    for _, m in ipairs(executable) do
        local is_direct = m.fromBag == 'Inventory' or m.toBag == 'Inventory'

        local desc = m.quantity .. 'x ' .. m.itemName .. ': ' .. m.fromBag .. ' -> ' .. m.toBag

        if is_direct then
            -- Direct move: one packet, one verification
            enqueue_direct_move(m, m.fromBag, m.fromSlot, m.toBag,
                function(ok)
                    if ok then
                        log_success_fn('Moved ' .. desc)
                        table.insert(succeeded_ids, m.id)
                    else
                        failed_count = failed_count + 1
                    end
                end,
                function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason) end)
        else
            -- Two-step move: Source -> Inventory -> Destination
            local step1_ok = false

            enqueue_direct_move(m, m.fromBag, m.fromSlot, 'Inventory',
                function(ok)
                    step1_ok = ok
                    if not ok then failed_count = failed_count + 1 end
                end,
                function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason) end)

            -- Wait for game to process before looking up the item in Inventory
            for _ = 1, 60 do
                enqueue_fn(function() end)
            end

            enqueue_fn(function()
                if not step1_ok then return end

                local inv_slot = find_current_slot('inventory', m.itemId)
                if not inv_slot then
                    log_error_fn('Failed to move ' .. desc .. ' — item not found in Inventory after step 1')
                    failed_count = failed_count + 1
                    return
                end

                enqueue_direct_move(m, 'Inventory', inv_slot, m.toBag,
                    function(ok)
                        if ok then
                            log_success_fn('Moved ' .. desc)
                            table.insert(succeeded_ids, m.id)
                        else
                            failed_count = failed_count + 1
                        end
                    end,
                    function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason .. ' (item may be in Inventory)') end)
            end)
        end
    end

    -- Enqueue the acknowledge call after all moves
    enqueue_fn(function()
        if #succeeded_ids > 0 then
            local ltn12 = require('ltn12')
            local payload = json_encode_fn({ moveIds = succeeded_ids })
            local response_body = {}

            local result, status_code = http_request_fn({
                url = settings.ApiUrl .. '/api/sync/inventory/moves/acknowledge',
                method = 'POST',
                headers = {
                    ['Content-Type'] = 'application/json',
                    ['Content-Length'] = tostring(#payload),
                    ['X-Api-Key'] = settings.ApiKey,
                },
                source = ltn12.source.string(payload),
                sink = ltn12.sink.table(response_body),
            })

            if not result or status_code ~= 200 then
                log_error_fn('Failed to sync move results with server. Moves may re-appear on next sync.')
            end
        end

        pending_moves = nil
    end)
end

return moves
