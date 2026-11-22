-- addon-ashita/vanalytics/compat/extdata.lua
-- Windower `extdata` library shim (partial).
--
-- The Vanalytics addon (via extdata_util.lua) only needs two things from the
-- Windower extdata lib:
--   1. extdata.decode(item).augments  -> ordered array of augment strings
--   2. extdata.decode(item)           -> { type='Linkshell', linkshell_id,
--                                           r, g, b, status_id, name } for LS items
--
-- LINKSHELL decode is ported faithfully from Windower/Lua addons/libs/extdata.lua
-- (decode.Linkshell + tools.bit.*). The byte layout is stable game data.
--
-- AUGMENT decode is STUBBED: Windower's augment decoder depends on ~2,000 lines
-- of lookup tables (augment_values / potencies) plus per-system unpacking logic.
-- Reproducing that offline, untested, would be error-prone, so decode() returns
-- no augments. Equipped gear still syncs; only the augment strings are absent.
-- To restore augments, drop in Windower's real extdata.lua (its require('pack'),
-- require('resources') and list helpers resolve through this compat layer).
-- See PORTING.md.

require('compat.pack') -- ensure string:unpack('I') is installed

local res = require('compat.resources')

local extdata = {}
local decode = {}

-- Windower item.type == 6 means Linkshell (same underlying game value Ashita
-- exposes as item.Type). See compat/resources.lua.
local LINKSHELL_TYPE = 6

-----------------------------------------------------------------------
-- Bit helpers (ported verbatim from Windower extdata.lua tools.bit.*)
-----------------------------------------------------------------------
local bit = {}

function bit.l_to_r_bit_packed(dat_string, start, stop)
    local newval = 0
    local c_count = math.ceil(stop / 8)
    while c_count >= math.ceil((start + 1) / 8) do
        local cur_val = dat_string:byte(c_count) or 0
        local scal = 1
        if c_count == math.ceil(stop / 8) then
            cur_val = math.floor(cur_val / (2 ^ (8 - ((stop - 1) % 8 + 1))))
        end
        if c_count == math.ceil((start + 1) / 8) then
            cur_val = cur_val % (2 ^ (8 - start % 8))
        end
        if c_count == math.ceil(stop / 8) - 1 then
            scal = 2 ^ (((stop - 1) % 8 + 1))
        end
        newval = newval + cur_val * scal
        c_count = c_count - 1
    end
    return newval
end

function bit.bit_string(bits, str, map)
    local i, sig = 0, ''
    while map[bit.l_to_r_bit_packed(str, i, i + bits)] do
        sig = sig .. map[bit.l_to_r_bit_packed(str, i, i + bits)]
        i = i + bits
    end
    return sig
end

-----------------------------------------------------------------------
-- Linkshell decode (ported verbatim from Windower extdata.lua)
-----------------------------------------------------------------------
local LS_STATUS_MAP = { [0] = 'Unopened', [1] = 'Linkshell', [2] = 'Pearlsack', [3] = 'Linkpearl', [4] = 'Broken' }
local LS_NAME_MAP = {
    [0] = "'", [1] = 'a', [2] = 'b', [3] = 'c', [4] = 'd', [5] = 'e', [6] = 'f', [7] = 'g', [8] = 'h', [9] = 'i', [10] = 'j',
    [11] = 'k', [12] = 'l', [13] = 'm', [14] = 'n', [15] = 'o', [16] = 'p', [17] = 'q', [18] = 'r', [19] = 's', [20] = 't',
    [21] = 'u', [22] = 'v', [23] = 'w', [24] = 'x', [25] = 'y', [26] = 'z', [27] = 'A', [28] = 'B', [29] = 'C', [30] = 'D',
    [31] = 'E', [32] = 'F', [33] = 'G', [34] = 'H', [35] = 'I', [36] = 'J', [37] = 'K', [38] = 'L', [39] = 'M', [40] = 'N',
    [41] = 'O', [42] = 'P', [43] = 'Q', [44] = 'R', [45] = 'S', [46] = 'T', [47] = 'U', [48] = 'V', [49] = 'W', [50] = 'X',
    [51] = 'Y', [52] = 'Z',
}

function decode.Linkshell(str)
    local name_end = #str
    while (str:byte(name_end) == 0 or str:byte(name_end) == nil) and name_end > 10 do
        name_end = name_end - 1
    end
    local rettab = {
        type = 'Linkshell',
        linkshell_id = str:unpack('I'),
        r = 17 * (str:byte(7) % 16),
        g = 17 * math.floor(str:byte(7) / 16),
        b = 17 * (str:byte(8) % 16),
        status_id = str:byte(9),
        status = LS_STATUS_MAP[str:byte(9)],
    }
    if rettab.status_id and rettab.status_id ~= 0 then
        rettab.name = bit.bit_string(6, str:sub(10, name_end), LS_NAME_MAP)
    end
    return rettab
end

-----------------------------------------------------------------------
-- Public: extdata.decode(item)
-----------------------------------------------------------------------
function extdata.decode(item)
    if type(item) ~= 'table' then return {} end
    local str = item.extdata
    if type(str) ~= 'string' or #str == 0 then return {} end

    local res_item = res.items[item.id]
    local itype = res_item and res_item.type or nil

    if itype == LINKSHELL_TYPE and #str >= 9 then
        return decode.Linkshell(str)
    end

    -- Augment decode is stubbed (see header). No augments emitted.
    return { augments = nil }
end

return extdata
