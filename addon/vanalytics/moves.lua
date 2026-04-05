-- addon/vanalytics/moves.lua
-- Inventory move order polling, validation, and execution module

local moves = {}
local res = require('resources')

-- Dependencies (set via init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local json_decode_fn = nil
local log_fn = nil
local log_error_fn = nil
local log_success_fn = nil
local enqueue_fn = nil -- function to add work to the main work queue
local inventory_sync_fn = nil -- function to trigger inventory re-sync

-- Pending moves from last poll
local pending_moves = nil

-----------------------------------------------------------------------
-- File logger: writes detailed move execution logs to moves.log
-- in the addon directory. Each execution session is timestamped.
-----------------------------------------------------------------------
local log_file = nil

local function mlog(msg)
    if not log_file then
        local path = windower.addon_path .. 'moves.log'
        log_file = io.open(path, 'a')
        if not log_file then return end
    end
    log_file:write(os.date('[%Y-%m-%d %H:%M:%S] ') .. msg .. '\n')
    log_file:flush()
end

local function mlog_move_order(m)
    mlog('  Move order: id=' .. tostring(m.id)
        .. ' itemId=' .. tostring(m.itemId)
        .. ' item="' .. tostring(m.itemName) .. '"'
        .. ' qty=' .. tostring(m.quantity)
        .. ' from=' .. tostring(m.fromBag) .. ':' .. tostring(m.fromSlot)
        .. ' to=' .. tostring(m.toBag))
end

local function mlog_bag_contents(bag_key, item_id)
    local items = windower.ffxi.get_items()
    if not items then mlog('    (cannot read items)'); return end
    local bag = items[bag_key]
    if not bag then mlog('    bag "' .. bag_key .. '" not accessible'); return end
    local found = false
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            mlog('    found itemId=' .. item.id .. ' qty=' .. tostring(item.count) .. ' at ' .. bag_key .. ':' .. slot_index)
            found = true
        end
    end
    if not found then
        mlog('    itemId=' .. item_id .. ' NOT found in ' .. bag_key)
    end
end

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
    inventory_sync_fn = deps.inventory_sync
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
-- Find an existing partial stack of an item in a destination bag
-- that has room for the given quantity.
-- Returns the slot index if found, or 0x52 (auto-place) if no
-- existing stack has room.
-----------------------------------------------------------------------
local function find_stack_slot(to_bag_key, item_id, quantity)
    if not to_bag_key then return 0x52 end
    local items = windower.ffxi.get_items()
    if not items then return 0x52 end
    local bag = items[to_bag_key]
    if not bag then return 0x52 end

    -- Look up the item's max stack size from game resources
    local item_res = res.items[item_id]
    local stack_max = item_res and item_res.stack or 99

    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            local available = stack_max - (item.count or 0)
            if available >= quantity then
                return slot_index
            end
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
-- Prefers the slot matching hint_slot if provided, otherwise picks
-- the slot with the smallest quantity (to free slots by emptying
-- the smallest stacks first during consolidation).
-- Returns the 1-based slot index, or nil if not found.
-----------------------------------------------------------------------
local function find_current_slot(bag_key, item_id, hint_slot)
    local items = windower.ffxi.get_items()
    if not items then return nil end
    local bag = items[bag_key]
    if not bag then return nil end

    -- If the hint slot still has the right item, use it
    if hint_slot then
        local hint_item = bag[hint_slot]
        if hint_item and type(hint_item) == 'table' and hint_item.id == item_id then
            return hint_slot
        end
    end

    -- Otherwise find the slot with the smallest quantity (best for freeing slots)
    local best_slot = nil
    local best_qty = math.huge
    for slot_index, item in pairs(bag) do
        if type(item) == 'table' and item.id == item_id then
            local qty = item.count or 0
            if qty < best_qty then
                best_qty = qty
                best_slot = slot_index
            end
        end
    end
    return best_slot
end

function moves.on_outgoing_packet(id, data)
end

-----------------------------------------------------------------------
-- Read the current quantity of an item in a specific slot.
-- Returns the count if the item is there, 0 if the slot is empty
-- or has a different item, nil if the bag is unreadable.
-----------------------------------------------------------------------
local function get_slot_quantity(bag_key, slot_index, item_id)
    local items = windower.ffxi.get_items()
    if not items then return nil end
    local bag = items[bag_key]
    if not bag then return nil end
    local slot = bag[slot_index]
    if not slot or type(slot) ~= 'table' or slot.id ~= item_id then return 0 end
    return slot.count or 0
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
-- Enqueue a single logical move with stack-aware splitting.
-- Fills existing partial stacks in the destination first, then
-- auto-places remainder. Each partial fill is a separate packet
-- with its own verify cycle.
-----------------------------------------------------------------------
local function enqueue_direct_move(m, from_bag, from_slot_hint, to_bag, on_result, on_error)
    local from_bag_id = api_to_bag_id[from_bag]
    local to_bag_id = api_to_bag_id[to_bag]
    local from_bag_key = api_to_bag_key[from_bag]
    local to_bag_key = api_to_bag_key[to_bag]

    -- Plan and execute on the first frame
    enqueue_fn(function()
        mlog('MOVE: ' .. tostring(m.itemName) .. ' qty=' .. m.quantity .. ' ' .. from_bag .. ' -> ' .. to_bag)

        if not from_bag_id or not to_bag_id then
            mlog('  ABORT: unknown bag ID')
            if on_error then on_error('unknown bag: ' .. tostring(from_bag) .. ' / ' .. tostring(to_bag)) end
            on_result(false)
            return
        end

        -- Find the source slot
        local source_slot = find_current_slot(from_bag_key, m.itemId, from_slot_hint)
        if not source_slot then
            mlog('  ABORT: item not found in source bag')
            if on_error then on_error('item not found in ' .. from_bag) end
            on_result(false)
            return
        end

        local source_qty = get_slot_quantity(from_bag_key, source_slot, m.itemId) or 0
        local qty_to_move = math.min(m.quantity, source_qty)
        mlog('  source_slot=' .. source_slot .. ' source_qty=' .. source_qty .. ' qty_to_move=' .. qty_to_move)
        mlog_bag_contents(from_bag_key, m.itemId)

        if qty_to_move <= 0 then
            mlog('  ABORT: nothing to move')
            if on_error then on_error('no quantity to move from ' .. from_bag) end
            on_result(false)
            return
        end

        -- Build a list of sub-moves: fill partial stacks first, then auto-place
        local sub_moves = {}
        local remaining = qty_to_move

        -- Look up stack max from game resources
        local item_res = res.items[m.itemId]
        local stack_max = item_res and item_res.stack or 99

        -- Find destination stacks with room (exclude source slot if same bag)
        local same_bag = from_bag_key == to_bag_key
        if to_bag_key then
            local items = windower.ffxi.get_items()
            if items and items[to_bag_key] then
                local dest_bag = items[to_bag_key]
                local partials = {}
                for slot_idx, item in pairs(dest_bag) do
                    if type(item) == 'table' and item.id == m.itemId then
                        -- Skip the source slot if source and destination are the same bag
                        if not (same_bag and slot_idx == source_slot) then
                            local avail = stack_max - (item.count or 0)
                            if avail > 0 then
                                table.insert(partials, { slot = slot_idx, available = avail })
                            end
                        end
                    end
                end
                table.sort(partials, function(a, b) return a.available < b.available end)

                for _, p in ipairs(partials) do
                    if remaining <= 0 then break end
                    local fill = math.min(remaining, p.available)
                    table.insert(sub_moves, { qty = fill, dest_slot = p.slot })
                    remaining = remaining - fill
                    mlog('  plan: fill dest slot ' .. p.slot .. ' with ' .. fill .. ' (available=' .. p.available .. ')')
                end
            end
        end

        -- Any remaining goes to auto-place
        if remaining > 0 then
            table.insert(sub_moves, { qty = remaining, dest_slot = 0x52 })
            mlog('  plan: auto-place remaining ' .. remaining)
        end

        mlog('  total sub-moves: ' .. #sub_moves)

        -- Track overall success across sub-moves
        local sub_total = #sub_moves
        local sub_done = 0
        local any_moved = false

        local function on_sub_complete(ok)
            if ok then any_moved = true end
            sub_done = sub_done + 1
            if sub_done >= sub_total then
                if any_moved then
                    on_result(true)
                else
                    if on_error then on_error('no items moved from ' .. from_bag .. ' slot ' .. source_slot) end
                    on_result(false)
                end
            end
        end

        -- Enqueue each sub-move with its own inject + wait + verify cycle
        for _, sub in ipairs(sub_moves) do
            local sub_source_slot = source_slot -- always from the same source slot

            enqueue_fn(function()
                -- Re-read source quantity (may have decreased from prior sub-move)
                local current_qty = get_slot_quantity(from_bag_key, sub_source_slot, m.itemId) or 0
                local actual_qty = math.min(sub.qty, current_qty)
                mlog('  SUB-INJECT: ' .. actual_qty .. ' from ' .. from_bag .. ':' .. sub_source_slot .. ' to destSlot=' .. sub.dest_slot)

                if actual_qty <= 0 then
                    mlog('  SUB-SKIP: source slot empty')
                    on_sub_complete(true) -- source already empty = success
                    return
                end

                local qty_before_sub = current_qty
                inject_move(actual_qty, from_bag_id, sub_source_slot, to_bag_id, sub.dest_slot)

                -- Store for verification closure
                sub._qty_before = qty_before_sub
            end)

            -- Wait for game
            for _ = 1, 60 do
                enqueue_fn(function() end)
            end

            -- Verify
            enqueue_fn(function()
                local qty_after = get_slot_quantity(from_bag_key, sub_source_slot, m.itemId) or 0
                local qty_before_sub = sub._qty_before or 0
                mlog('  SUB-VERIFY: slot ' .. sub_source_slot .. ' qty_before=' .. qty_before_sub .. ' qty_after=' .. qty_after)

                if qty_after < qty_before_sub then
                    mlog('  SUB-PASS: decreased by ' .. (qty_before_sub - qty_after))
                    on_sub_complete(true)
                else
                    mlog('  SUB-FAIL: unchanged')
                    on_sub_complete(false)
                end
            end)
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

    mlog('========================================')
    mlog('EXECUTE: ' .. #pending_moves .. ' pending move(s)')
    mlog('========================================')

    local accessible = get_accessible_bags()
    mlog('Accessible bags:')
    for bag_name, _ in pairs(accessible) do mlog('  ' .. bag_name) end

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
    local total_expected = #executable
    local completed_count = 0

    -- Called after each move finishes (success or failure).
    -- When all moves are done, acknowledges and triggers inventory sync.
    local function on_move_complete()
        completed_count = completed_count + 1
        if completed_count < total_expected then return end

        -- All moves finished — enqueue the acknowledge + sync
        mlog('ALL COMPLETE: succeeded=' .. #succeeded_ids .. ' failed=' .. failed_count)
        enqueue_fn(function()
            if #succeeded_ids > 0 then
                mlog('ACKNOWLEDGE: posting ' .. #succeeded_ids .. ' move IDs')
                local ltn12 = require('ltn12')
                local payload = json_encode_fn({ moveIds = succeeded_ids })
                local response_body = {}

                http_request_fn({
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
            end

            if inventory_sync_fn then
                enqueue_fn(function() inventory_sync_fn() end)
            end

            pending_moves = nil
        end)
    end

    mlog('Executable: ' .. #executable .. ', Skipped: ' .. #skipped)

    -- Process moves one-by-one: complete the full round-trip (step 1 + step 2)
    -- for each item before starting the next. This avoids piling all items into
    -- Inventory simultaneously and gives the player timely chat feedback.
    local function process_move(index)
        if index > #executable then return end

        local m = executable[index]
        local is_direct = m.fromBag == 'Inventory' or m.toBag == 'Inventory'
        local desc = m.quantity .. 'x ' .. m.itemName .. ': ' .. m.fromBag .. ' -> ' .. m.toBag

        mlog('--- Move ' .. index .. '/' .. #executable .. ': ' .. desc .. ' (direct=' .. tostring(is_direct) .. ') ---')
        mlog_move_order(m)

        if is_direct then
            enqueue_direct_move(m, m.fromBag, m.fromSlot, m.toBag,
                function(ok)
                    if ok then
                        log_success_fn('Moved ' .. desc)
                        table.insert(succeeded_ids, m.id)
                    else
                        failed_count = failed_count + 1
                    end
                    on_move_complete()
                    process_move(index + 1)
                end,
                function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason) end)
        else
            -- Two-step: complete step 1 + step 2 before starting next move.
            enqueue_direct_move(m, m.fromBag, m.fromSlot, 'Inventory',
                function(ok)
                    if not ok then
                        failed_count = failed_count + 1
                        on_move_complete()
                        process_move(index + 1)
                        return
                    end

                    -- Step 1 succeeded — wait, then find item in Inventory and do step 2
                    for _ = 1, 60 do
                        enqueue_fn(function() end)
                    end

                    enqueue_fn(function()
                        mlog('STEP2 LOOKUP: searching Inventory for itemId=' .. tostring(m.itemId))
                        mlog_bag_contents('inventory', m.itemId)

                        local inv_slot = find_current_slot('inventory', m.itemId)
                        if not inv_slot then
                            mlog('STEP2 ABORT: item not found in Inventory')
                            log_error_fn('Failed to move ' .. desc .. ' — item not found in Inventory after step 1')
                            failed_count = failed_count + 1
                            on_move_complete()
                            process_move(index + 1)
                            return
                        end

                        mlog('STEP2: found at Inventory slot ' .. inv_slot .. ', moving to ' .. m.toBag)

                        enqueue_direct_move(m, 'Inventory', inv_slot, m.toBag,
                            function(ok2)
                                if ok2 then
                                    log_success_fn('Moved ' .. desc)
                                    table.insert(succeeded_ids, m.id)
                                else
                                    failed_count = failed_count + 1
                                end
                                on_move_complete()
                                process_move(index + 1)
                            end,
                            function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason .. ' (item may be in Inventory)') end)
                    end)
                end,
                function(reason) log_error_fn('Failed to move ' .. desc .. ' — ' .. reason) end)
        end
    end

    process_move(1)
end

return moves
