-- addon-ashita/vanalytics/compat/packets.lua
-- Windower `packets` library shim — only `packets.parse('incoming', data)` is
-- used by the addon, for exactly two packets:
--   0x0F4  Widescan Mob   -> Index, Name, 'X Offset', 'Y Offset'
--   0x056  Quest/Mission  -> Type + type-specific mission fields
--
-- Field offsets/layouts are transcribed verbatim from Windower's authoritative
-- definitions (Windower/Lua addons/libs/packets/fields.lua):
--   * 0x0F4: Index u16@0x04, Type u8@0x07, X Offset s16@0x08, Y Offset s16@0x0A,
--            Name char[16]@0x0C.
--   * 0x056: discriminator Type = u16@0x24; per-Type overlays start at 0x04:
--       0x00D0: Completed {San d'Oria@0x04, Bastok@0x0C, Windurst@0x14,
--               Zilart@0x1C} Missions, each data[8].
--       0x00D8: Completed {TOAU@0x04, WOTG@0x0C} Missions, each data[8].
--       0x00C0: Completed TOAU Quests data[16]@0x04, Completed Assaults
--               data[16]@0x14.
--       0xFFFE: Current TVR Mission int@0x04.
--       0xFFFF: Current COP Mission int@0x10, Current ACP Mission bit[4]@0x18lo,
--               Current MKD Mission bit[4]@0x18hi, Current ASA Mission
--               bit[4]@0x19lo, Current SOA Mission int@0x1C,
--               Current ROV Mission int@0x20.
--
-- `data` is the raw packet string including the 4-byte header, byte offset O ==
-- Lua string index O+1. Matches how Ashita's packet_in e.data is laid out.

local packets = {}

local function u8(data, off)
    return string.byte(data, off + 1) or 0
end

local function u16(data, off)
    local a = string.byte(data, off + 1) or 0
    local b = string.byte(data, off + 2) or 0
    return a + b * 256
end

local function i16(data, off)
    local v = u16(data, off)
    if v >= 0x8000 then v = v - 0x10000 end
    return v
end

local function u32(data, off)
    local a = string.byte(data, off + 1) or 0
    local b = string.byte(data, off + 2) or 0
    local c = string.byte(data, off + 3) or 0
    local d = string.byte(data, off + 4) or 0
    return a + b * 256 + c * 65536 + d * 16777216
end

-- Raw byte substring of length n at packet offset off (data[n] ctype).
local function bytes(data, off, n)
    return string.sub(data, off + 1, off + n)
end

-- Null-terminated string at offset off, max length n (char[n] ctype).
local function cstr(data, off, n)
    local s = string.sub(data, off + 1, off + n)
    local z = s:find('\0', 1, true)
    if z then s = s:sub(1, z - 1) end
    return s
end

-- Packet id from the FFXI header word: lower 9 bits of the first uint16.
local function packet_id(data)
    return u16(data, 0) % 0x200
end

-----------------------------------------------------------------------
-- 0x0F4 Widescan Mob
-----------------------------------------------------------------------
local function parse_0F4(data)
    return {
        Index = u16(data, 0x04),
        Type = u8(data, 0x07),
        ['X Offset'] = i16(data, 0x08),
        ['Y Offset'] = i16(data, 0x0A),
        Name = cstr(data, 0x0C, 16),
    }
end

-----------------------------------------------------------------------
-- 0x056 Quest/Mission (Type-discriminated)
-----------------------------------------------------------------------
local function parse_056(data)
    local t = u16(data, 0x24)
    local p = { Type = t }

    if t == 0x00D0 then
        p["Completed San d'Oria Missions"] = bytes(data, 0x04, 8)
        p['Completed Bastok Missions'] = bytes(data, 0x0C, 8)
        p['Completed Windurst Missions'] = bytes(data, 0x14, 8)
        p['Completed Zilart Missions'] = bytes(data, 0x1C, 8)

    elseif t == 0x00D8 then
        p['Completed TOAU Missions'] = bytes(data, 0x04, 8)
        p['Completed WOTG Missions'] = bytes(data, 0x0C, 8)

    elseif t == 0x00C0 then
        p['Completed TOAU Quests'] = bytes(data, 0x04, 16)
        p['Completed Assaults'] = bytes(data, 0x14, 16)

    elseif t == 0xFFFE then
        p['Current TVR Mission'] = u32(data, 0x04)

    elseif t == 0xFFFF then
        p['Nation'] = u32(data, 0x04)
        p['Current Nation Mission'] = u32(data, 0x08)
        p['Current ROZ Mission'] = u32(data, 0x0C)
        p['Current COP Mission'] = u32(data, 0x10)
        local b18 = u8(data, 0x18)
        local b19 = u8(data, 0x19)
        p['Current ACP Mission'] = b18 % 0x10          -- lower 4 bits
        p['Current MKD Mission'] = math.floor(b18 / 0x10) -- upper 4 bits
        p['Current ASA Mission'] = b19 % 0x10          -- lower 4 bits
        p['Current SOA Mission'] = u32(data, 0x1C)
        p['Current ROV Mission'] = u32(data, 0x20)
    end

    return p
end

-----------------------------------------------------------------------
-- Public API: packets.parse(direction, data)
-----------------------------------------------------------------------
function packets.parse(_direction, data)
    if type(data) ~= 'string' or #data < 4 then return nil end
    local id = packet_id(data)
    if id == 0x0F4 then
        return parse_0F4(data)
    elseif id == 0x056 then
        return parse_056(data)
    end
    -- Other packets aren't parsed by the addon; return id-only for safety.
    return { id = id }
end

return packets
