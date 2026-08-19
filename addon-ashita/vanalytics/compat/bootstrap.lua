-- addon-ashita/vanalytics/compat/bootstrap.lua
-- Installs the Windower-compatibility environment so the verbatim Windower
-- modules (core.lua + the 11 helpers) load and run unchanged on Ashita v4.
--
-- Responsibilities:
--   1. Provide the global `windower` table (Ashita-backed).
--   2. Provide the global `_addon` table that core.lua populates.
--   3. Preload package.loaded for every Windower stdlib the modules require()
--      ('config', 'resources', 'pack', 'packets', 'texts', 'images', 'extdata',
--      'slips') so our compat shims win over anything Ashita might ship.
--   4. Install string:pack/:unpack (via compat.pack).
--
-- Note: 'socket'/'ssl' are intentionally NOT preloaded — async_http.lua probes
-- for a real luasocket/luasec and falls back to WinHTTP when they're absent.

-- 1 + 2: globals.
_G._addon = _G._addon or {}
_G.windower = require('compat.windower')

-- 4 + 3: string pack methods and the require() shims.
local M = {}
M.pack = require('compat.pack')

local function preload(name, mod)
    package.loaded[name] = mod
end

preload('config', require('compat.config'))
preload('resources', require('compat.resources'))
preload('pack', M.pack)
preload('packets', require('compat.packets'))
preload('texts', require('compat.texts'))
preload('images', require('compat.images'))
preload('extdata', require('compat.extdata'))
preload('slips', require('compat.slips'))

return M
