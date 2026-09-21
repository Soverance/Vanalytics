-- addon-ashita/vanalytics/compat/windower.lua
-- Windower -> Ashita v4 compatibility core.
--
-- Builds a global `windower` table whose surface matches the parts of the
-- Windower API the Vanalytics addon uses, backed by Ashita v4's AshitaCore /
-- ashita.* APIs. Downstream module code (core.lua and the 11 helper modules)
-- is kept VERBATIM from the Windower original and talks only to this surface.
--
-- IMPORTANT (needs in-game verification): the exact Ashita method names and the
-- field layout of some objects (player skills/merits/job-points/master-levels,
-- entity flags) vary by Ashita build. Every such access is centralized here and
-- pcall-guarded so a wrong method name degrades a single field instead of
-- crashing the addon. Items flagged `VERIFY:` in comments below are the places
-- an Ashita dev should confirm against a live client. See PORTING.md.

local M = {}

-----------------------------------------------------------------------
-- Small helpers
-----------------------------------------------------------------------
local function safe(fn, ...)
    local ok, a, b, c, d = pcall(fn, ...)
    if ok then return a, b, c, d end
    return nil
end

local function core()
    return AshitaCore
end

-----------------------------------------------------------------------
-- Event dispatcher
-- core.lua calls windower.register_event('load'|'unload'|'prerender'|
-- 'incoming chunk'|'incoming text'|'addon command'|'login'|'logout'|
-- 'zone change', fn). We store handlers per name; the Ashita entry
-- (vanalytics.lua) fires them by translating real Ashita events.
-----------------------------------------------------------------------
local handlers = {}

function M.register_event(name, fn)
    handlers[name] = handlers[name] or {}
    table.insert(handlers[name], fn)
    return #handlers[name]
end

-- Fire all handlers for an event name. Guarded so one bad handler doesn't
-- abort the rest (mirrors Windower's per-handler isolation).
function M.fire(name, ...)
    local list = handlers[name]
    if not list then return end
    for _, fn in ipairs(list) do
        local ok, err = pcall(fn, ...)
        if not ok then
            M.add_to_chat(167, '[Vanalytics] event ' .. tostring(name) ..
                ' handler error: ' .. tostring(err))
        end
    end
end

function M.has_handlers(name)
    return handlers[name] ~= nil and #handlers[name] > 0
end

-----------------------------------------------------------------------
-- Chat output
-- Windower: windower.add_to_chat(color, text)
-----------------------------------------------------------------------
function M.add_to_chat(color, text)
    if text == nil then text = color; color = 1 end
    local ok = pcall(function()
        core():GetChatManager():AddChatMessage(tonumber(color) or 1, false, tostring(text))
    end)
    if not ok then print(tostring(text)) end
end

-----------------------------------------------------------------------
-- send_command
-- Windower runs its own console commands. Translate the ones the addon uses:
--   'input /foo ...'          -> game command '/foo ...'
--   'lua reload vanalytics'   -> '/addon reload vanalytics'
--   'lua unload vanalytics'   -> '/addon unload vanalytics'
-- Anything else is queued verbatim (prefixed with '/').
-----------------------------------------------------------------------
function M.send_command(cmd)
    if not cmd then return end
    local queued = cmd
    local rest = cmd:match('^input%s+(.*)$')
    if rest then
        queued = rest
    else
        local target = cmd:match('^lua%s+reload%s+(.+)$')
        if target then
            queued = '/addon reload ' .. target
        else
            target = cmd:match('^lua%s+unload%s+(.+)$')
            if target then
                queued = '/addon unload ' .. target
            elseif cmd:sub(1, 1) ~= '/' then
                queued = '/' .. cmd
            end
        end
    end
    pcall(function()
        core():GetChatManager():QueueCommand(-1, queued)
    end)
end

-----------------------------------------------------------------------
-- Sound
-- Windower: windower.play_sound(absolute_wav_path)
-- Ashita has no built-in sound API; use Win32 PlaySound via FFI (async).
-----------------------------------------------------------------------
local _winmm
local function winmm()
    if _winmm ~= nil then return _winmm end
    local ok, ffi = pcall(require, 'ffi')
    if not ok then _winmm = false; return false end
    pcall(ffi.cdef, [[
        int PlaySoundA(const char* pszSound, void* hmod, unsigned int fdwSound);
    ]])
    local okl, lib = pcall(ffi.load, 'winmm')
    _winmm = okl and lib or false
    return _winmm
end

function M.play_sound(path)
    local lib = winmm()
    if not lib then return end
    -- SND_FILENAME (0x00020000) | SND_ASYNC (0x0001) | SND_NODEFAULT (0x0002)
    pcall(function() lib.PlaySoundA(path, nil, 0x00020003) end)
end

-----------------------------------------------------------------------
-- Paths
-- Windower globals used by the addon:
--   windower.addon_path  -> this addon's folder (trailing slash)
--   windower.ffxi_path   -> FFXI install dir (trailing slash), holds USER\ macros
-- plus diagnostic-only: windower_path/pol_path/script_path/appdata_path.
-----------------------------------------------------------------------
local function norm_dir(p)
    if not p or p == '' then return p end
    p = p:gsub('/', '\\')
    if p:sub(-1) ~= '\\' then p = p .. '\\' end
    return p
end

do
    -- addon.path is set by Ashita to the addon's directory.
    local ap = (type(addon) == 'table' and addon.path) or '.\\'
    M.addon_path = norm_dir(ap)

    local install = safe(function() return core():GetInstallPath() end)
    M.ffxi_path = norm_dir(install or '')
    M.pol_path = M.ffxi_path
    M.windower_path = M.ffxi_path
    M.script_path = M.addon_path
    M.appdata_path = norm_dir(os.getenv('APPDATA') or '')
end

-----------------------------------------------------------------------
-- Filesystem
-- Windower: windower.dir_exists(p), windower.create_dir(p), windower.get_dir(p)
-- Ashita: ashita.fs.* (create_directory, exists, get_directory_entries).
-----------------------------------------------------------------------
local function fs()
    return (type(ashita) == 'table') and ashita.fs or nil
end

function M.dir_exists(path)
    local f = fs()
    if f and f.exists then
        local ok, r = pcall(f.exists, path)
        if ok then return r end
    end
    -- Fallback: try to enumerate.
    local ok = pcall(function()
        local h = io.popen('if exist "' .. path .. '\\*" (echo 1) else (echo 0)')
        local out = h:read('*a'); h:close(); return out
    end)
    return ok and true or false
end

function M.create_dir(path)
    local f = fs()
    if f and f.create_directory then
        pcall(f.create_directory, path)
        return
    end
    pcall(os.execute, 'mkdir "' .. path .. '" 2>NUL')
end

-- Returns an array of entry names in a directory (files + subdirs), matching
-- Windower's get_dir(). Used by macros.lua timestamps and core USER-dir scan.
function M.get_dir(path)
    local f = fs()
    if f then
        local getter = f.get_directory_entries or f.get_dir or f.get_directory
        if getter then
            local ok, entries = pcall(getter, path, '*')
            if ok and type(entries) == 'table' then return entries end
            ok, entries = pcall(getter, path)
            if ok and type(entries) == 'table' then return entries end
        end
    end
    -- Fallback: shell dir listing (names only).
    local out = {}
    local ok, handle = pcall(io.popen, 'dir /B "' .. path .. '" 2>NUL')
    if ok and handle then
        for line in handle:lines() do
            if line and line ~= '' then out[#out + 1] = line end
        end
        handle:close()
    end
    return out
end

-----------------------------------------------------------------------
-- Packets
-- Windower: windower.packets.inject_outgoing(id, data_string)
-- Ashita: AshitaCore:GetPacketManager():AddOutgoingPacket(id, data_string)
-----------------------------------------------------------------------
M.packets = {}
function M.packets.inject_outgoing(id, data)
    pcall(function()
        core():GetPacketManager():AddOutgoingPacket(id, data)
    end)
end

-----------------------------------------------------------------------
-- windower.ffxi.* adapters live in a separate file for readability.
-----------------------------------------------------------------------
M.ffxi = require('compat.ffxi')

return M
