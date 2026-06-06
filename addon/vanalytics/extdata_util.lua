-- addon/vanalytics/extdata_util.lua
-- Decodes item augments from Windower's extdata library into a clean,
-- ordered array of augment strings (the same strings GearSwap uses).

local extdata_util = {}

-- extdata lib is lazy-loaded so a missing extdata.lua doesn't break the whole
-- Vanalytics addon — it just disables augment decoding.
local extdata_lib = nil
local extdata_load_failed = false
local function get_extdata()
    if extdata_lib or extdata_load_failed then return extdata_lib end
    local ok, lib = pcall(require, 'extdata')
    if ok then extdata_lib = lib else extdata_load_failed = true end
    return extdata_lib
end

-- Returns an ordered array of augment strings, or nil when the item has none.
-- pcall-guards extdata.decode so a malformed blob can never break a sync.
function extdata_util.decode_augments(item)
    if type(item) ~= 'table' or not item.id or item.id == 0 then
        return nil
    end

    local extdata = get_extdata()
    if not extdata then return nil end

    local ok, decoded = pcall(extdata.decode, item)
    if not ok or type(decoded) ~= 'table' or type(decoded.augments) ~= 'table' then
        return nil
    end

    local result = {}
    for _, aug in ipairs(decoded.augments) do
        if type(aug) == 'string' and aug ~= '' and aug ~= 'none' then -- extdata emits 'none' for empty augment slots
            result[#result + 1] = aug
        end
    end

    if #result == 0 then
        return nil
    end
    return result
end

return extdata_util
