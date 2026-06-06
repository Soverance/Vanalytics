-- addon/vanalytics/extdata_util.lua
-- Decodes item augments from Windower's extdata library into a clean,
-- ordered array of augment strings (the same strings GearSwap uses).

local extdata = require('extdata')

local extdata_util = {}

-- Returns an ordered array of augment strings, or nil when the item has none.
-- pcall-guards extdata.decode so a malformed blob can never break a sync.
function extdata_util.decode_augments(item)
    if type(item) ~= 'table' or not item.id or item.id == 0 then
        return nil
    end

    local ok, decoded = pcall(extdata.decode, item)
    if not ok or type(decoded) ~= 'table' or type(decoded.augments) ~= 'table' then
        return nil
    end

    local result = {}
    for _, aug in ipairs(decoded.augments) do
        if type(aug) == 'string' and aug ~= '' and aug ~= 'none' then
            result[#result + 1] = aug
        end
    end

    if #result == 0 then
        return nil
    end
    return result
end

return extdata_util
