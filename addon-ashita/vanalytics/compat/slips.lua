-- addon-ashita/vanalytics/compat/slips.lua
-- Windower `slips` library shim.
--
-- Reimplements the porter-slip decode from Windower/Lua addons/libs/slips.lua in
-- plain Lua (no L{}/T{} list helpers). The slip catalog (which item ids each of
-- the 26 Porter Moogle "Storage Slip" items can hold, in bit order) is the
-- factual, auto-generated resource table from Windower/Resources, embedded here
-- as compat/slips_data.lua (BSD-licensed; see that file's header).
--
-- porter.lua only calls:
--   slips.get_player_items()          -> { [slip_item_id] = { stored_item_id, ... }, ... }
--   slips.get_slip_number_by_id(id)   -> 1-based ordinal of the slip, or nil
--
-- The bit-unpacking of each carried slip's extdata bitmap is identical to
-- Windower's implementation.

local slips = {}

-- Bags Windower's slips lib scans (note: no 'temporary'). compat/ffxi.lua's
-- get_items() returns bags under these same keys.
local DEFAULT_STORAGES = {
    'inventory', 'safe', 'storage', 'locker', 'satchel', 'sack', 'case',
    'wardrobe', 'safe2', 'wardrobe2', 'wardrobe3', 'wardrobe4', 'wardrobe5',
    'wardrobe6', 'wardrobe7', 'wardrobe8',
}

-- Load the slip catalog. Degrade to an empty catalog (porter no-ops) if missing.
local catalog = nil
do
    local ok, data = pcall(require, 'compat.slips_data')
    if ok and type(data) == 'table' then catalog = data end
end

-- slips.storages: ordered list of slip item ids.
-- slips.items:    slip_item_id -> ordered array of stored item ids (bit order).
slips.storages = {}
slips.items = {}
if catalog then
    for _, slip in ipairs(catalog) do
        if type(slip) == 'table' and slip.item_id and type(slip.items) == 'table' then
            slips.storages[#slips.storages + 1] = slip.item_id
            slips.items[slip.item_id] = slip.items
        end
    end
end

-- 1-based ordinal of a slip item id within slips.storages, or nil.
function slips.get_slip_number_by_id(id)
    if slips.items[id] == nil then return nil end
    for i, sid in ipairs(slips.storages) do
        if sid == id then return i end
    end
    return nil
end

function slips.get_slip_id(n)
    return slips.storages[n]
end

function slips.get_slip_by_id(id)
    return slips.items[id]
end

-- Walk the player's bags, find carried slip items, and unpack each slip's
-- extdata bitmap into the list of stored item ids. Mirrors Windower's
-- slips.get_player_items().
function slips.get_player_items()
    local out = {}
    for _, sid in ipairs(slips.storages) do
        out[sid] = {}
    end

    local win = _G.windower
    if not win or not win.ffxi or not win.ffxi.get_items then return out end
    local items = win.ffxi.get_items()
    if type(items) ~= 'table' then return out end

    for _, storage in ipairs(DEFAULT_STORAGES) do
        local bag = items[storage]
        if type(bag) == 'table' then
            for _, item in ipairs(bag) do
                if item and item.id and slips.items[item.id]
                    and type(item.extdata) == 'string' then
                    local slip_catalog = slips.items[item.id]
                    local ext = item.extdata
                    local nbits = #ext * 8 - 1
                    for bit_position = 0, nbits do
                        local bitmask = ext:byte(math.floor(bit_position / 8) + 1) or 0
                        if bitmask < 0 then bitmask = bitmask + 256 end
                        local set = math.floor((bitmask / 2 ^ (bit_position % 8)) % 2)
                        if set ~= 0 and slip_catalog[bit_position + 1] then
                            local dst = out[item.id]
                            dst[#dst + 1] = slip_catalog[bit_position + 1]
                        end
                    end
                end
            end
        end
    end

    return out
end

return slips
