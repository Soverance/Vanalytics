-- addon/vanalytics/macros.lua
-- FFXI Macro DAT file parser and writer
--
-- Each DAT file (mcr.dat, mcr1.dat, ...) contains ONE page (one "set"):
--   24-byte header: 4 version + 4 flags + 16 MD5
--   20 macros (10 Ctrl + 10 Alt), each 380 bytes:
--     4 bytes: unknown (skip)
--     6 x 61 bytes: command lines (null-terminated)
--     10 bytes: macro name (null-terminated)
--
-- File naming: mcr.dat = index 0, mcr1.dat = index 1, etc.
-- Book/page mapping: file_index = (book * 10) + page
--   So Book 1 = files 0-9 (mcr.dat through mcr9.dat)
--      Book 2 = files 10-19 (mcr10.dat through mcr19.dat)

local macros = {}

local HEADER_SIZE = 24
local MACRO_SIZE = 380
local SKIP_SIZE = 4
local LINE_SIZE = 61
local LINE_COUNT = 6
local NAME_SIZE = 10
local MACROS_PER_SET = 10
local MACROS_PER_PAGE = 20  -- 10 Ctrl + 10 Alt
local PAGES_PER_BOOK = 10
local BOOKS_COUNT = 20

local EXPECTED_FILE_SIZE = HEADER_SIZE + (MACROS_PER_PAGE * MACRO_SIZE)  -- 7624

-- Read a null-terminated string, keeping only printable ASCII
local function read_string(data, offset, maxlen)
    local s = data:sub(offset + 1, offset + maxlen)
    local null_pos = s:find('\0')
    if null_pos then
        s = s:sub(1, null_pos - 1)
    end
    local clean = {}
    for i = 1, #s do
        local b = s:byte(i)
        if b >= 0x20 and b <= 0x7E then
            clean[#clean+1] = s:sub(i, i)
        end
    end
    return table.concat(clean)
end

-- Pad a string to fixed length with null bytes
local function pad_string(s, len)
    if #s >= len then
        return s:sub(1, len)
    end
    return s .. string.rep('\0', len - #s)
end

-- Parse a single macro from binary data at the given byte offset
-- Layout: 4 skip + 6x61 lines + 10 name = 380 bytes
local function parse_macro(data, offset)
    local lines = {}
    local line_start = offset + SKIP_SIZE
    for i = 0, LINE_COUNT - 1 do
        lines[i + 1] = read_string(data, line_start + (i * LINE_SIZE), LINE_SIZE)
    end

    local name_start = line_start + (LINE_COUNT * LINE_SIZE)
    local name = read_string(data, name_start, NAME_SIZE)

    return {
        name = name,
        line1 = lines[1],
        line2 = lines[2],
        line3 = lines[3],
        line4 = lines[4],
        line5 = lines[5],
        line6 = lines[6],
    }
end

-- Write a single macro to binary (380 bytes)
local function write_macro(m)
    local skip = '\0\0\0\0'
    local lines = ''
    for i = 1, LINE_COUNT do
        local key = 'line' .. i
        lines = lines .. pad_string(m[key] or '', LINE_SIZE)
    end
    local name = pad_string(m.name or '', NAME_SIZE)
    return skip .. lines .. name
end

-- Get the DAT filename for a given file index
-- index 0 = "mcr.dat", index N = "mcrN.dat"
function macros.dat_filename(file_index)
    if file_index == 0 then
        return 'mcr.dat'
    end
    return 'mcr' .. file_index .. '.dat'
end

-- Get the file index for a given book and page (both 1-based)
function macros.file_index(book, page)
    return ((book - 1) * PAGES_PER_BOOK) + (page - 1)
end

-- Parse a single DAT file (one page: 10 Ctrl + 10 Alt macros)
-- Returns { ctrl = {[1..10]}, alt = {[1..10]} } or nil
function macros.parse_page(filepath)
    local f = io.open(filepath, 'rb')
    if not f then return nil end
    local data = f:read('*a')
    f:close()

    if #data ~= EXPECTED_FILE_SIZE then return nil end

    local page = { ctrl = {}, alt = {} }

    -- First 10 macros = Ctrl, next 10 = Alt
    for i = 0, MACROS_PER_SET - 1 do
        local ctrl_offset = HEADER_SIZE + (i * MACRO_SIZE)
        page.ctrl[i + 1] = parse_macro(data, ctrl_offset)
        page.ctrl[i + 1].set = 'Ctrl'
        page.ctrl[i + 1].position = i + 1

        local alt_offset = HEADER_SIZE + ((MACROS_PER_SET + i) * MACRO_SIZE)
        page.alt[i + 1] = parse_macro(data, alt_offset)
        page.alt[i + 1].set = 'Alt'
        page.alt[i + 1].position = i + 1
    end

    return page
end

-- Parse all pages for a single book (1-based book number)
-- Returns { pages = {[1..10] = page} } or nil
function macros.parse_book(macro_path, book_number)
    local book = { pages = {} }
    local found_any = false

    for page = 1, PAGES_PER_BOOK do
        local idx = macros.file_index(book_number, page)
        local filename = macros.dat_filename(idx)
        local filepath = macro_path .. '\\' .. filename
        local page_data = macros.parse_page(filepath)
        if page_data then
            book.pages[page] = page_data
            found_any = true
        end
    end

    if not found_any then return nil end
    return book
end

-- Write a single page to a DAT file
function macros.write_page(filepath, page)
    local md5_lib = nil  -- MD5 recalculation is optional; game recalculates on load
    local parts = {}

    -- Header: version 1, flags 0, placeholder MD5 (16 zero bytes)
    local header = string.char(1, 0, 0, 0)  -- version = 1
        .. string.char(0, 0, 0, 0)          -- flags
        .. string.rep('\0', 16)             -- MD5 placeholder

    -- Write 10 Ctrl macros, then 10 Alt macros
    for i = 1, MACROS_PER_SET do
        table.insert(parts, write_macro(page.ctrl[i] or {}))
    end
    for i = 1, MACROS_PER_SET do
        table.insert(parts, write_macro(page.alt[i] or {}))
    end

    local macro_data = table.concat(parts)

    local f = io.open(filepath, 'wb')
    if not f then return false end
    f:write(header .. macro_data)
    f:close()
    return true
end

-- Convert a parsed book to the API JSON structure
function macros.book_to_api(book, book_number, content_hash, title)
    local api_book = {
        bookNumber = book_number,
        contentHash = content_hash,
        bookTitle = title or ('Book' .. string.format('%02d', book_number)),
        pages = {}
    }

    for page_idx = 1, PAGES_PER_BOOK do
        local page = book.pages[page_idx]
        local api_page = { pageNumber = page_idx, macros = {} }

        if page then
            for _, m in ipairs(page.ctrl) do
                table.insert(api_page.macros, {
                    set = 'Ctrl', position = m.position,
                    name = m.name, icon = 0,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
            for _, m in ipairs(page.alt) do
                table.insert(api_page.macros, {
                    set = 'Alt', position = m.position,
                    name = m.name, icon = 0,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
        end

        table.insert(api_book.pages, api_page)
    end

    return api_book
end

-- Convert API JSON structure back to internal page format
function macros.api_to_book(api_book)
    local book = { pages = {} }

    for _, api_page in ipairs(api_book.pages) do
        local page = { ctrl = {}, alt = {} }

        for i = 1, MACROS_PER_SET do
            page.ctrl[i] = { set = 'Ctrl', position = i, name = '',
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            page.alt[i] = { set = 'Alt', position = i, name = '',
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
        end

        for _, m in ipairs(api_page.macros) do
            local target = m.set == 'Ctrl' and page.ctrl or page.alt
            target[m.position] = {
                set = m.set, position = m.position,
                name = m.name or '',
                line1 = m.line1 or '', line2 = m.line2 or '',
                line3 = m.line3 or '', line4 = m.line4 or '',
                line5 = m.line5 or '', line6 = m.line6 or '',
            }
        end

        book.pages[api_page.pageNumber] = page
    end

    -- Fill missing pages
    for i = 1, PAGES_PER_BOOK do
        if not book.pages[i] then
            book.pages[i] = { ctrl = {}, alt = {} }
            for j = 1, MACROS_PER_SET do
                book.pages[i].ctrl[j] = { set = 'Ctrl', position = j, name = '',
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
                book.pages[i].alt[j] = { set = 'Alt', position = j, name = '',
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            end
        end
    end

    return book
end

-- Hash all DAT files for a book (concatenate file contents, then hash)
function macros.hash_book(macro_path, book_number)
    local hash = 5381
    local found_any = false

    for page = 1, PAGES_PER_BOOK do
        local idx = macros.file_index(book_number, page)
        local filename = macros.dat_filename(idx)
        local filepath = macro_path .. '\\' .. filename
        local f = io.open(filepath, 'rb')
        if f then
            found_any = true
            local data = f:read('*a')
            f:close()
            for i = 1, #data do
                hash = ((hash * 33) + data:byte(i)) % 0xFFFFFFFF
            end
        end
    end

    if not found_any then return nil end
    return string.format('%08x', hash)
end

-- Debug: dump raw hex of a DAT file
function macros.dump_dat(filepath, output_path)
    local f = io.open(filepath, 'rb')
    if not f then return false end
    local data = f:read('*a')
    f:close()

    local out = io.open(output_path, 'w')
    if not out then return false end

    out:write('File: ' .. filepath .. '\n')
    out:write('Size: ' .. #data .. ' bytes\n\n')

    local limit = math.min(#data, 2000)
    for offset = 0, limit - 1, 16 do
        local hex = {}
        local ascii = {}
        for i = 0, 15 do
            local pos = offset + i + 1
            if pos <= #data then
                local b = data:byte(pos)
                hex[#hex+1] = string.format('%02X', b)
                if b >= 0x20 and b <= 0x7E then
                    ascii[#ascii+1] = string.char(b)
                else
                    ascii[#ascii+1] = '.'
                end
            end
        end
        out:write(string.format('%08X  %-48s  %s\n', offset, table.concat(hex, ' '), table.concat(ascii)))
    end

    out:write('\n=== Printable strings found ===\n')
    local str_start = nil
    local current = {}
    for i = 1, #data do
        local b = data:byte(i)
        if b >= 0x20 and b <= 0x7E then
            if not str_start then str_start = i end
            current[#current+1] = string.char(b)
        else
            if str_start and #current >= 3 then
                out:write(string.format('  offset 0x%04X (%d): "%s"\n', str_start - 1, str_start - 1, table.concat(current)))
            end
            str_start = nil
            current = {}
        end
    end

    out:close()
    return true
end

-- Parse book titles from mcr.ttl file
-- Format: 24-byte header, then 16-byte null-padded title per book
local TTL_HEADER_SIZE = 24
local TTL_ENTRY_SIZE = 16

function macros.parse_titles(macro_path)
    local titles = {}

    -- mcr.ttl has books 1-20, mcr_2.ttl may have books 21-40
    local ttl_files = { 'mcr.ttl', 'mcr_2.ttl' }
    local book_offset = 0

    for _, ttl_name in ipairs(ttl_files) do
        local filepath = macro_path .. '\\' .. ttl_name
        local f = io.open(filepath, 'rb')
        if f then
            local data = f:read('*a')
            f:close()

            local num_entries = math.floor((#data - TTL_HEADER_SIZE) / TTL_ENTRY_SIZE)
            for i = 0, num_entries - 1 do
                local offset = TTL_HEADER_SIZE + (i * TTL_ENTRY_SIZE)
                local title = read_string(data, offset, TTL_ENTRY_SIZE)
                -- Trim trailing spaces
                title = title:match('^(.-)%s*$') or title
                titles[book_offset + i + 1] = title
            end
            book_offset = book_offset + num_entries
        end
    end

    return titles
end

macros.PAGES_PER_BOOK = PAGES_PER_BOOK
macros.BOOKS_COUNT = BOOKS_COUNT

return macros
