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

-- Maps the extdata linkshell status_id (pearl tier) to a Vanalytics rank string.
-- 1 = Linkshell (leader), 2 = Pearlsack (sackholder), 3 = Linkpearl (member).
-- 0 (Unopened) and 4 (Broken) have no membership meaning.
local LS_RANK_BY_STATUS = { [1] = 'leader', [2] = 'sackholder', [3] = 'member' }

-- Decodes a linkshell item into { linkshellId, name, colorRgb, rank }, or nil
-- if the item is not a usable linkshell (unopened/broken/unreadable).
-- pcall-guards extdata.decode so a malformed blob can never break a sync.
function extdata_util.decode_linkshell(item)
    if type(item) ~= 'table' or not item.id or item.id == 0 then
        return nil
    end

    local extdata = get_extdata()
    if not extdata then return nil end

    local ok, decoded = pcall(extdata.decode, item)
    if not ok or type(decoded) ~= 'table' or decoded.type ~= 'Linkshell' then
        return nil
    end

    local rank = LS_RANK_BY_STATUS[decoded.status_id]
    if not rank then return nil end
    if type(decoded.name) ~= 'string' or decoded.name == '' then return nil end

    local r = decoded.r or 0
    local g = decoded.g or 0
    local b = decoded.b or 0

    return {
        linkshellId = decoded.linkshell_id,
        name = decoded.name,
        colorRgb = (r * 65536) + (g * 256) + b,
        rank = rank,
    }
end

return extdata_util
