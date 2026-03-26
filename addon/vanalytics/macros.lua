-- addon/vanalytics/macros.lua
-- FFXI Macro DAT file parser and writer

local macros = {}

-- Macro DAT format (per macro entry):
-- 4 bytes: header/padding
-- 8 bytes: macro name (null-padded)
-- 1 byte:  icon id
-- 6 x 61 bytes: command lines (null-padded)
-- Total per macro: 4 + 8 + 1 + 366 = 379 bytes
-- Per page: 20 macros (10 Ctrl + 10 Alt) = 7580 bytes
-- Per book (10 pages): 75800 bytes

local MACRO_SIZE = 379
local NAME_OFFSET = 4
local NAME_SIZE = 8
local ICON_OFFSET = 12
local LINE_SIZE = 61
local LINE_OFFSET = 13
local MACROS_PER_SET = 10
local SETS_PER_PAGE = 2
local MACROS_PER_PAGE = MACROS_PER_SET * SETS_PER_PAGE
local PAGES_PER_BOOK = 10

local function read_string(data, offset, maxlen)
    local s = data:sub(offset + 1, offset + maxlen)
    local null_pos = s:find('\0')
    if null_pos then
        s = s:sub(1, null_pos - 1)
    end
    return s
end

local function pad_string(s, len)
    if #s >= len then
        return s:sub(1, len)
    end
    return s .. string.rep('\0', len - #s)
end

local function parse_macro(data, offset)
    local name = read_string(data, offset + NAME_OFFSET, NAME_SIZE)
    local icon = data:byte(offset + ICON_OFFSET + 1) or 0

    local lines = {}
    for i = 0, 5 do
        lines[i + 1] = read_string(data, offset + LINE_OFFSET + (i * LINE_SIZE), LINE_SIZE)
    end

    return {
        name = name,
        icon = icon,
        line1 = lines[1],
        line2 = lines[2],
        line3 = lines[3],
        line4 = lines[4],
        line5 = lines[5],
        line6 = lines[6],
    }
end

local function write_macro(m)
    local header = '\0\0\0\0'
    local name = pad_string(m.name or '', NAME_SIZE)
    local icon = string.char(m.icon or 0)
    local lines = ''
    for i = 1, 6 do
        local key = 'line' .. i
        lines = lines .. pad_string(m[key] or '', LINE_SIZE)
    end
    return header .. name .. icon .. lines
end

function macros.parse_book(filepath)
    local f = io.open(filepath, 'rb')
    if not f then return nil end

    local data = f:read('*a')
    f:close()

    local book = { pages = {} }
    for page_idx = 0, PAGES_PER_BOOK - 1 do
        local page = { ctrl = {}, alt = {} }
        local page_offset = page_idx * MACROS_PER_PAGE * MACRO_SIZE

        for i = 0, MACROS_PER_SET - 1 do
            local ctrl_offset = page_offset + (i * MACRO_SIZE)
            page.ctrl[i + 1] = parse_macro(data, ctrl_offset)
            page.ctrl[i + 1].set = 'Ctrl'
            page.ctrl[i + 1].position = i + 1

            local alt_offset = page_offset + ((MACROS_PER_SET + i) * MACRO_SIZE)
            page.alt[i + 1] = parse_macro(data, alt_offset)
            page.alt[i + 1].set = 'Alt'
            page.alt[i + 1].position = i + 1
        end

        book.pages[page_idx + 1] = page
    end

    return book
end

function macros.write_book(filepath, book)
    local parts = {}

    for page_idx = 1, PAGES_PER_BOOK do
        local page = book.pages[page_idx]
        if not page then
            for _ = 1, MACROS_PER_PAGE do
                table.insert(parts, write_macro({}))
            end
        else
            for i = 1, MACROS_PER_SET do
                table.insert(parts, write_macro(page.ctrl[i] or {}))
            end
            for i = 1, MACROS_PER_SET do
                table.insert(parts, write_macro(page.alt[i] or {}))
            end
        end
    end

    local f = io.open(filepath, 'wb')
    if not f then return false end
    f:write(table.concat(parts))
    f:close()
    return true
end

function macros.book_to_api(book, book_number, content_hash)
    local api_book = {
        bookNumber = book_number,
        contentHash = content_hash,
        pages = {}
    }

    for page_idx = 1, PAGES_PER_BOOK do
        local page = book.pages[page_idx]
        local api_page = { pageNumber = page_idx, macros = {} }

        if page then
            for _, m in ipairs(page.ctrl) do
                table.insert(api_page.macros, {
                    set = 'Ctrl', position = m.position,
                    name = m.name, icon = m.icon,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
            for _, m in ipairs(page.alt) do
                table.insert(api_page.macros, {
                    set = 'Alt', position = m.position,
                    name = m.name, icon = m.icon,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
        end

        table.insert(api_book.pages, api_page)
    end

    return api_book
end

function macros.api_to_book(api_book)
    local book = { pages = {} }

    for _, api_page in ipairs(api_book.pages) do
        local page = { ctrl = {}, alt = {} }

        for i = 1, MACROS_PER_SET do
            page.ctrl[i] = { set = 'Ctrl', position = i, name = '', icon = 0,
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            page.alt[i] = { set = 'Alt', position = i, name = '', icon = 0,
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
        end

        for _, m in ipairs(api_page.macros) do
            local target = m.set == 'Ctrl' and page.ctrl or page.alt
            target[m.position] = {
                set = m.set, position = m.position,
                name = m.name or '', icon = m.icon or 0,
                line1 = m.line1 or '', line2 = m.line2 or '',
                line3 = m.line3 or '', line4 = m.line4 or '',
                line5 = m.line5 or '', line6 = m.line6 or '',
            }
        end

        book.pages[api_page.pageNumber] = page
    end

    for i = 1, PAGES_PER_BOOK do
        if not book.pages[i] then
            book.pages[i] = { ctrl = {}, alt = {} }
            for j = 1, MACROS_PER_SET do
                book.pages[i].ctrl[j] = { set = 'Ctrl', position = j, name = '', icon = 0,
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
                book.pages[i].alt[j] = { set = 'Alt', position = j, name = '', icon = 0,
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            end
        end
    end

    return book
end

function macros.hash_file(filepath)
    local f = io.open(filepath, 'rb')
    if not f then return nil end
    local data = f:read('*a')
    f:close()

    local hash = 5381
    for i = 1, #data do
        hash = ((hash * 33) + data:byte(i)) % 0xFFFFFFFF
    end
    return string.format('%08x', hash)
end

return macros
