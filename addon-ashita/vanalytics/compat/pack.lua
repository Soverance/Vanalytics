-- addon-ashita/vanalytics/compat/pack.lua
-- Windower `pack` library shim.
--
-- Windower's pack lib augments the string type with :pack()/:unpack() methods
-- using its own single-character format codes. The Vanalytics addon only uses a
-- small subset, all little-endian:
--   unpack: 'H' u16, 'h' i16, 'I' u32, 'i' i32, 'B' u8, 'b' i8
--   pack:   'I' u32   (moves.lua: ('I'):pack(quantity))
--
-- Signature matches Windower:
--   value            = str:unpack(fmt, pos)   -- pos is 1-based
--   packed_string    = fmt_string:pack(...)   -- e.g. ('I'):pack(n)
--
-- Ashita's LuaJIT (5.1) has no native string.pack/unpack, so installing these
-- onto the string metatable is safe.

local function read_uint(s, pos, nbytes)
    pos = pos or 1
    local v = 0
    for i = 0, nbytes - 1 do
        local b = string.byte(s, pos + i) or 0
        v = v + b * (256 ^ i)
    end
    return v
end

local function to_signed(v, nbytes)
    local half = 256 ^ nbytes / 2
    if v >= half then v = v - 256 ^ nbytes end
    return v
end

-- string:unpack(fmt, pos)
local function str_unpack(s, fmt, pos)
    pos = pos or 1
    local code = fmt:sub(1, 1)
    if code == 'B' then
        return read_uint(s, pos, 1)
    elseif code == 'b' then
        return to_signed(read_uint(s, pos, 1), 1)
    elseif code == 'H' then
        return read_uint(s, pos, 2)
    elseif code == 'h' then
        return to_signed(read_uint(s, pos, 2), 2)
    elseif code == 'I' then
        return read_uint(s, pos, 4)
    elseif code == 'i' then
        return to_signed(read_uint(s, pos, 4), 4)
    else
        error('pack shim: unsupported unpack format ' .. tostring(fmt))
    end
end

local function write_uint(v, nbytes)
    v = math.floor(v)
    local out = {}
    for i = 1, nbytes do
        out[i] = string.char(v % 256)
        v = math.floor(v / 256)
    end
    return table.concat(out)
end

-- fmt:pack(...) -- only the codes the addon uses.
local function str_pack(fmt, ...)
    local args = { ... }
    local out = {}
    local ai = 1
    for i = 1, #fmt do
        local code = fmt:sub(i, i)
        if code == 'B' or code == 'b' then
            out[#out + 1] = write_uint(args[ai] or 0, 1); ai = ai + 1
        elseif code == 'H' or code == 'h' then
            out[#out + 1] = write_uint(args[ai] or 0, 2); ai = ai + 1
        elseif code == 'I' or code == 'i' then
            out[#out + 1] = write_uint(args[ai] or 0, 4); ai = ai + 1
        else
            error('pack shim: unsupported pack format ' .. tostring(code))
        end
    end
    return table.concat(out)
end

-- Install onto the string metatable so `data:unpack(...)` / `('I'):pack(...)`
-- work exactly like Windower.
string.unpack = str_unpack
string.pack = str_pack

return { unpack = str_unpack, pack = str_pack }
