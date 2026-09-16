-- addon-ashita/vanalytics/compat/config.lua
-- Windower `config` shim.
--
-- core.lua uses:
--   local settings = config.load(defaults)   -- returns a live settings table
--   config.save(settings)                     -- persists it
--
-- Windower merges settings.xml over the Lua `defaults`. Here we persist the
-- settings table as a Lua file under <addon>\config\settings.lua and deep-merge
-- saved values over the defaults on load. Keys (ApiUrl, ApiKey, SyncInterval,
-- NotifyOnSync, macro_hashes, Hunt*, AugmentBackfillDone, ...) are preserved
-- exactly so the addon and web contract are unchanged.

local config = {}

local function addon_dir()
    local ap = (type(addon) == 'table' and addon.path) or '.\\'
    ap = ap:gsub('/', '\\')
    if ap:sub(-1) ~= '\\' then ap = ap .. '\\' end
    return ap
end

local function config_path()
    return addon_dir() .. 'config\\settings.lua'
end

local function ensure_dir()
    local dir = addon_dir() .. 'config'
    if type(ashita) == 'table' and ashita.fs and ashita.fs.create_directory then
        pcall(ashita.fs.create_directory, dir)
    else
        pcall(os.execute, 'mkdir "' .. dir .. '" 2>NUL')
    end
end

local function deep_copy(v)
    if type(v) ~= 'table' then return v end
    local out = {}
    for k, val in pairs(v) do out[k] = deep_copy(val) end
    return out
end

-- Merge src over dst in place (src wins for scalars; tables merged recursively).
local function deep_merge(dst, src)
    for k, v in pairs(src) do
        if type(v) == 'table' and type(dst[k]) == 'table' then
            deep_merge(dst[k], v)
        else
            dst[k] = deep_copy(v)
        end
    end
    return dst
end

-----------------------------------------------------------------------
-- Serialization to a Lua source file that returns the table.
-----------------------------------------------------------------------
local function serialize(v, indent)
    indent = indent or ''
    local t = type(v)
    if t == 'string' then
        return string.format('%q', v)
    elseif t == 'number' or t == 'boolean' then
        return tostring(v)
    elseif t == 'table' then
        local lines = { '{' }
        local next_indent = indent .. '  '
        -- Deterministic order: array part then sorted string keys.
        local array_keys = {}
        for i = 1, #v do array_keys[i] = true end
        for i = 1, #v do
            lines[#lines + 1] = next_indent .. serialize(v[i], next_indent) .. ','
        end
        local skeys = {}
        for k in pairs(v) do
            if not (type(k) == 'number' and array_keys[k]) then skeys[#skeys + 1] = k end
        end
        table.sort(skeys, function(a, b) return tostring(a) < tostring(b) end)
        for _, k in ipairs(skeys) do
            local key
            if type(k) == 'string' and k:match('^[%a_][%w_]*$') then
                key = k
            else
                key = '[' .. serialize(k, next_indent) .. ']'
            end
            lines[#lines + 1] = next_indent .. key .. ' = ' ..
                serialize(v[k], next_indent) .. ','
        end
        lines[#lines + 1] = indent .. '}'
        return table.concat(lines, '\n')
    end
    return 'nil'
end

local function load_saved()
    local path = config_path()
    local f = io.open(path, 'r')
    if not f then return nil end
    local src = f:read('*a')
    f:close()
    if not src or src == '' then return nil end
    -- Support both `return { ... }` and a bare table literal.
    if not src:match('^%s*return') then src = 'return ' .. src end
    local chunk = loadstring and loadstring(src) or load(src)
    if not chunk then return nil end
    local ok, tbl = pcall(chunk)
    if ok and type(tbl) == 'table' then return tbl end
    return nil
end

-----------------------------------------------------------------------
-- Public API
-----------------------------------------------------------------------
function config.load(defaults)
    local settings = deep_copy(defaults or {})
    local saved = load_saved()
    if saved then deep_merge(settings, saved) end
    return settings
end

function config.save(settings)
    ensure_dir()
    local path = config_path()
    local f = io.open(path, 'w')
    if not f then return false end
    f:write('return ' .. serialize(settings, '') .. '\n')
    f:close()
    return true
end

return config
