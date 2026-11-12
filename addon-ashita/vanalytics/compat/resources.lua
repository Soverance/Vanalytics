-- addon-ashita/vanalytics/compat/resources.lua
-- Windower `resources` (res) shim backed by Ashita's ResourceManager.
--
-- The addon only reads:
--   res.items[id]   -> { en, type, stack }
--   res.servers[id] -> { en }
--   res.zones[id]   -> { en }
--   res.titles[id]  -> { en }
--
-- Each table is a lazy, cached view: indexing by id calls the ResourceManager
-- once and memoizes the result. VERIFY notes mark lookups whose Ashita string-
-- table names / field layouts should be confirmed on a live client.

local res = {}

local function rm()
    return AshitaCore and AshitaCore:GetResourceManager() or nil
end

local function try(fn, ...)
    local ok, a = pcall(fn, ...)
    if ok then return a end
    return nil
end

-- Ashita resource objects expose localized names as an array; the English
-- client (HorizonXI) uses index 1 (some builds 0). Try a few.
local function name_of(obj)
    if obj == nil then return nil end
    if type(obj) == 'string' then return obj end
    for _, key in ipairs({ 'Name', 'name' }) do
        local v = try(function() return obj[key] end)
        if type(v) == 'string' and v ~= '' then return v end
        if type(v) == 'table' then
            for _, i in ipairs({ 1, 0, 2, 3 }) do
                if type(v[i]) == 'string' and v[i] ~= '' then return v[i] end
            end
        end
    end
    -- Method-style accessors on some builds.
    for _, m in ipairs({ 'GetName', 'GetNameEn' }) do
        local f = obj[m]
        if f then
            local v = try(f, obj)
            if type(v) == 'string' and v ~= '' then return v end
        end
    end
    return nil
end

-- Build a lazy, cached id->entry table using the supplied loader(id)->entry.
local function lazy(loader)
    local cache = {}
    return setmetatable({}, {
        __index = function(_, id)
            if id == nil then return nil end
            local hit = cache[id]
            if hit ~= nil then
                if hit == false then return nil end
                return hit
            end
            local entry = loader(id)
            cache[id] = entry or false
            return entry
        end,
    })
end

-----------------------------------------------------------------------
-- items
-----------------------------------------------------------------------
res.items = lazy(function(id)
    local mgr = rm(); if not mgr then return nil end
    local it = try(function() return mgr:GetItemById(id) end)
    if not it then return nil end
    return {
        en = name_of(it) or ('Item ' .. tostring(id)),
        -- VERIFY: Windower item.type == 6 means Linkshell. Ashita item.Type
        -- numbering may differ; only affects equipped-LS detection in core.lua.
        type = tonumber(try(function() return it.Type end)) or 0,
        stack = tonumber(try(function() return it.StackSize end)) or 99,
    }
end)

-----------------------------------------------------------------------
-- zones / titles via ResourceManager:GetString(table, id)
-----------------------------------------------------------------------
local function string_entry(tables, id)
    local mgr = rm(); if not mgr then return nil end
    for _, tbl in ipairs(tables) do
        local s = try(function() return mgr:GetString(tbl, id) end)
        if type(s) == 'string' and s ~= '' then return { en = s } end
    end
    return nil
end

res.zones = lazy(function(id)
    return string_entry({ 'zones', 'zones.names' }, id)
end)

res.titles = lazy(function(id)
    return string_entry({ 'titles', 'titles.names' }, id)
end)

-----------------------------------------------------------------------
-- servers (world names). Ashita may not ship a server-name string table, and
-- the world id is the addon's most important identity field (characters are
-- keyed by name + server). Try the ResourceManager, then fall back to the
-- known retail world-id map. VERIFY on the target server (e.g. HorizonXI).
-----------------------------------------------------------------------
local RETAIL_WORLDS = {
    [0] = 'Undefined', [1] = 'Bahamut', [2] = 'Shiva', [3] = 'Titan',
    [4] = 'Ramuh', [5] = 'Phoenix', [6] = 'Carbuncle', [7] = 'Fenrir',
    [8] = 'Sylph', [9] = 'Valefor', [10] = 'Alexander', [11] = 'Leviathan',
    [12] = 'Odin', [13] = 'Ifrit', [14] = 'Diabolos', [15] = 'Caitsith',
    [16] = 'Quetzalcoatl', [17] = 'Siren', [18] = 'Unicorn', [19] = 'Gilgamesh',
    [20] = 'Ragnarok', [21] = 'Pandemonium', [22] = 'Garuda', [23] = 'Cerberus',
    [24] = 'Kujata', [25] = 'Bismarck', [26] = 'Seraph', [27] = 'Lakshmi',
    [28] = 'Asura', [29] = 'Midgardsormr', [30] = 'Fairy', [31] = 'Remora',
}

res.servers = lazy(function(id)
    local e = string_entry({ 'servers', 'servers.names' }, id)
    if e then return e end
    local name = RETAIL_WORLDS[id]
    if name then return { en = name } end
    return nil
end)

return res
