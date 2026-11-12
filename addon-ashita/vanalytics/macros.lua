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

local res = require('resources')

local macros = {}

-- Build request headers (API key + character context) for addon API calls.
-- Returns nil if the player or zone info isn't available — callers should
-- bail with a clear message in that case.
local function character_headers(api_key, extra)
    local player = windower.ffxi.get_player()
    local info = windower.ffxi.get_info()
    if not (player and info) then return nil end
    local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    local h = {
        ['X-Api-Key'] = api_key,
        ['X-Character-Name'] = player.name,
        ['X-Server'] = server_name,
    }
    if extra then
        for k, v in pairs(extra) do h[k] = v end
    end
    return h
end

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

-- Write all 10 pages of a book to their correct DAT files
function macros.write_book(macro_path, book_number, book)
    local success = true
    for page_num = 1, PAGES_PER_BOOK do
        local file_idx = macros.file_index(book_number, page_num)
        local filename = macros.dat_filename(file_idx)
        local filepath = macro_path .. '/' .. filename

        local page = book.pages[page_num]
        if page == nil then
            -- Create empty page
            page = { ctrl = {}, alt = {} }
            for i = 1, MACROS_PER_SET do
                page.ctrl[i] = { set = 'Ctrl', position = i, name = '', icon = 0, line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
                page.alt[i] = { set = 'Alt', position = i, name = '', icon = 0, line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            end
        end

        if not macros.write_page(filepath, page) then
            log('Error writing page ' .. page_num .. ' of book ' .. book_number)
            success = false
        end
    end
    return success
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

-- Compute DJB2 hash from in-memory book data (matches hash_book output from disk)
function macros.hash_book_from_data(book)
    local hash = 5381
    for page_num = 1, PAGES_PER_BOOK do
        local page = book.pages[page_num]
        if page then
            -- Hash ctrl macros then alt macros, matching write_page order
            for i = 1, MACROS_PER_SET do
                local macro = page.ctrl[i]
                if macro then
                    local data = macros.write_macro(macro)
                    for j = 1, #data do
                        hash = ((hash * 33) + string.byte(data, j)) % 0xFFFFFFFF
                    end
                end
            end
            for i = 1, MACROS_PER_SET do
                local macro = page.alt[i]
                if macro then
                    local data = macros.write_macro(macro)
                    for j = 1, #data do
                        hash = ((hash * 33) + string.byte(data, j)) % 0xFFFFFFFF
                    end
                end
            end
        end
    end
    if hash == 5381 then return nil end
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

-- Get a fingerprint of all macro DAT file timestamps in the directory.
-- Returns a table keyed by filename -> mtime (number) when lfs is available
-- (the common case in Windower 4), or a date-string parsed from `dir /T:W`
-- output as a fallback. Either is fine — book_files_changed only needs the
-- values to compare equal across consecutive checks of an unchanged file.
function macros.get_file_timestamps(macro_path)
    local timestamps = {}

    local ok_lfs, lfs = pcall(require, 'lfs')
    if ok_lfs then
        local entries = windower.get_dir(macro_path)
        if entries then
            for _, name in ipairs(entries) do
                if name:match('^mcr%d*%.dat$') then
                    local attr = lfs.attributes(macro_path .. '\\' .. name)
                    if attr and attr.modification then
                        timestamps[name] = attr.modification
                    end
                end
            end
        end
        return timestamps
    end

    -- Fallback for installs without LuaFileSystem: parse `dir /T:W` output.
    -- Spawns a brief cmd.exe window; acceptable in the rare-fallback case.
    local handle = io.popen('dir /T:W "' .. macro_path .. '\\mcr*.dat" 2>NUL')
    if not handle then return timestamps end

    for line in handle:lines() do
        -- dir output lines look like: "03/25/2026  02:14 PM             7,624 mcr15.dat"
        local date_str, time_str, filename = line:match('(%d+/%d+/%d+)%s+(%d+:%d+%s*%a+)%s+[%d,]+%s+(mcr%d*%.dat)')
        if filename then
            timestamps[filename] = date_str .. ' ' .. time_str
        end
    end
    handle:close()

    return timestamps
end

-- Check if any DAT file in a book has changed since last check.
-- Compares file timestamps against a stored fingerprint table.
-- Returns true if any page file has a different timestamp (or is new).
function macros.book_files_changed(macro_path, book_number, old_timestamps, new_timestamps)
    for page = 1, PAGES_PER_BOOK do
        local idx = macros.file_index(book_number, page)
        local filename = macros.dat_filename(idx)
        local old_ts = old_timestamps[filename]
        local new_ts = new_timestamps[filename]
        if new_ts and new_ts ~= old_ts then
            return true
        end
    end
    return false
end

macros.write_macro = write_macro
macros.PAGES_PER_BOOK = PAGES_PER_BOOK
macros.BOOKS_COUNT = BOOKS_COUNT

-----------------------------------------------------------------------
-- Diag: report per-book change-detection state for troubleshooting
-----------------------------------------------------------------------
function macros.diag(macro_path, settings, log_fn)
    local new_timestamps = macros.get_file_timestamps(macro_path)
    local old_timestamps = settings.macro_file_timestamps or {}
    local titles = macros.parse_titles(macro_path)
    local any = false

    log_fn('--- Macro diagnostics ---')
    log_fn('Macro path: ' .. macro_path)
    for book_num = 1, BOOKS_COUNT do
        local current_hash = macros.hash_book(macro_path, book_num)
        if current_hash then
            any = true
            local key = 'book' .. book_num
            local old_entry = settings.macro_hashes and settings.macro_hashes[key]
            local old_local = type(old_entry) == 'table' and old_entry['local'] or old_entry or '(none)'
            local old_remote = type(old_entry) == 'table' and old_entry.remote or '(none)'

            -- Count pages where timestamp changed
            local ts_changes = 0
            for page = 1, PAGES_PER_BOOK do
                local idx = macros.file_index(book_num, page)
                local filename = macros.dat_filename(idx)
                if new_timestamps[filename] and new_timestamps[filename] ~= old_timestamps[filename] then
                    ts_changes = ts_changes + 1
                end
            end

            local hash_match = (old_local == current_hash) and 'same' or 'DIFF'
            local title = titles[book_num] or '?'
            log_fn(string.format('Book %2d "%s": hash %s (local=%s current=%s) ts_changed=%d/10 remote=%s',
                book_num, title, hash_match, tostring(old_local), current_hash, ts_changes, tostring(old_remote)))
        end
    end
    if not any then log_fn('No macro books found on disk.') end
    log_fn('--- End diagnostics ---')
end

-----------------------------------------------------------------------
-- Push: upload changed macro books to server
-- http_fn: function(params) matching LuaSocket request signature
-- json_encode/json_decode: serialization functions from host addon
-----------------------------------------------------------------------
function macros.push(macro_path, settings, http_fn, json_encode, json_decode, base_url, api_key, force, log_fn, on_complete)
    on_complete = on_complete or function() end

    if force then
        log_fn('Force push: uploading all books on disk regardless of cached state.')
    else
        log_fn('Push: uploading books changed since last sync.')
        log_fn('Note: FFXI only writes macro edits to DAT files on zone/relogin. If a recent')
        log_fn('in-game edit is missing from Vanalytics, zone once and push again.')
    end

    -- Character context is required for every addon API call. If the player
    -- isn't fully loaded yet, bail early rather than letting the server pick
    -- the wrong character via fallback heuristics.
    local ch_headers = character_headers(api_key)
    if not ch_headers then
        log_fn('Cannot sync macros: not fully logged in yet. Try again after zoning.')
        on_complete(false)
        return
    end

    -- Detect locally-changed books and ship them. Pulled into a closure so we
    -- can either invoke directly (force mode) or after a successful conflict
    -- check (default mode).
    local function do_upload()
        local new_timestamps = macros.get_file_timestamps(macro_path)
        local old_timestamps = settings.macro_file_timestamps or {}
        local titles = macros.parse_titles(macro_path)
        local changed_books = {}

        for book_num = 1, BOOKS_COUNT do
            local files_changed = force or macros.book_files_changed(macro_path, book_num, old_timestamps, new_timestamps)
            if files_changed then
                local new_hash = macros.hash_book(macro_path, book_num)
                local key = 'book' .. book_num
                local old_entry = settings.macro_hashes and settings.macro_hashes[key]
                local old_hash = type(old_entry) == 'table' and old_entry['local'] or old_entry

                if new_hash and (force or new_hash ~= old_hash) then
                    local book = macros.parse_book(macro_path, book_num)
                    if book then
                        local title = titles[book_num] or ('Book' .. string.format('%02d', book_num))
                        local api_book = macros.book_to_api(book, book_num, new_hash, title)
                        table.insert(changed_books, { book_num = book_num, api_book = api_book, local_hash = new_hash })
                    end
                end
            end
        end

        if #changed_books == 0 then
            log_fn('No macro changes detected on disk.')
            log_fn('Tip: FFXI only flushes in-game macro edits to DAT files on zone or relogin.')
            log_fn("Zone once and try again, or run '//va macros diag' to inspect per-book state.")
            on_complete(true)
            return
        end

        log_fn('Detected ' .. #changed_books .. ' changed book(s). Uploading...')

        if not settings.macro_hashes then settings.macro_hashes = {} end

        local books_payload = {}
        for _, entry in ipairs(changed_books) do
            table.insert(books_payload, entry.api_book)
        end
        local request_body = json_encode({ books = books_payload })

        http_fn({
            url = base_url .. '/api/sync/macros',
            method = 'POST',
            headers = character_headers(api_key, { ['Content-Type'] = 'application/json' }),
            body = request_body,
            label = 'macros-upload',
        }, function(result, resp_code, _, resp_text)
            local total_updated = 0
            if result and resp_code == 200 then
                local resp = resp_text and #resp_text > 0 and json_decode(resp_text) or nil

                local remote_by_book = {}
                if resp and resp.books then
                    for _, b in ipairs(resp.books) do
                        remote_by_book[b.bookNumber] = b.contentHash or ''
                    end
                end

                for _, entry in ipairs(changed_books) do
                    local key = 'book' .. entry.book_num
                    local remote_hash = remote_by_book[entry.book_num] or ''
                    settings.macro_hashes[key] = { ['local'] = entry.local_hash, remote = remote_hash }
                    total_updated = total_updated + 1
                end

                if resp and resp.conflicts and #resp.conflicts > 0 then
                    local conflict_list = table.concat(resp.conflicts, ', ')
                    log_fn('Note: Books ' .. conflict_list .. ' had pending web edits that were overwritten (snapshots saved).')
                end
                settings.macro_file_timestamps = new_timestamps
                log_fn('Pushed ' .. total_updated .. ' book(s) to server.')
                on_complete(true)
            else
                log_fn('Error syncing macros: HTTP ' .. tostring(resp_code))
                on_complete(false)
            end
        end)
    end

    if force then
        do_upload()
        return
    end

    -- Default mode: check for unapplied web edits first; only proceed to
    -- upload if there are no pending books on the server.
    http_fn({
        url = base_url .. '/api/sync/macros/pending',
        method = 'GET',
        headers = ch_headers,
        label = 'macros-pending-check',
    }, function(result, pending_code, _, pending_body)
        if result and pending_code == 200 and pending_body and #pending_body > 0 then
            local pending = json_decode(pending_body)
            if pending and pending.pendingBooks and #pending.pendingBooks > 0 then
                local book_list = table.concat(pending.pendingBooks, ', ')
                log_fn('Blocked: Books ' .. book_list .. ' have unapplied web edits.')
                log_fn("Pull them first with '//va macros pull', or run '//va macros push --force'")
                log_fn('to overwrite the web edits with your local DAT contents.')
                on_complete(false)
                return
            end
        end
        do_upload()
    end)
end

-----------------------------------------------------------------------
-- Pull: download pending macro books from server
-- http_fn: function(params) matching LuaSocket request signature
-- json_encode/json_decode: serialization functions from host addon
-----------------------------------------------------------------------
function macros.pull(macro_path, settings, http_fn, json_encode, json_decode, base_url, api_key, force, log_fn, active_book, on_complete)
    on_complete = on_complete or function() end

    local ch_headers = character_headers(api_key)
    if not ch_headers then
        log_fn('Cannot pull macros. Try again after zoning.')
        on_complete({})
        return
    end

    -- Local conflict check (sync). A book only counts as "locally changed" if
    -- we've synced it before (have a stored hash) AND the current hash differs.
    if not force then
        local new_timestamps = macros.get_file_timestamps(macro_path)
        local old_timestamps = settings.macro_file_timestamps or {}
        local locally_changed = {}

        for book_num = 1, BOOKS_COUNT do
            local key = 'book' .. book_num
            local old_entry = settings.macro_hashes and settings.macro_hashes[key]
            local old_hash = type(old_entry) == 'table' and old_entry['local'] or old_entry
            if old_hash and old_hash ~= '' then
                if macros.book_files_changed(macro_path, book_num, old_timestamps, new_timestamps) then
                    local new_hash = macros.hash_book(macro_path, book_num)
                    if new_hash and new_hash ~= old_hash then
                        table.insert(locally_changed, book_num)
                    end
                end
            end
        end

        if #locally_changed > 0 then
            local book_list = table.concat(locally_changed, ', ')
            log_fn("Warning: Books " .. book_list .. " have local changes that haven't been pushed.")
            log_fn("Use '//va macros pull --force' to overwrite local files.")
            on_complete({})
            return
        end
    end

    http_fn({
        url = base_url .. '/api/sync/macros/pull',
        method = 'GET',
        headers = ch_headers,
        label = 'macros-pull',
    }, function(result, pull_code, _, pull_body)
        if not result or pull_code ~= 200 then
            log_fn('Error pulling pending macros: HTTP ' .. tostring(pull_code))
            on_complete({})
            return
        end

        local pull_data = pull_body and #pull_body > 0 and json_decode(pull_body) or nil
        if not pull_data or not pull_data.books or #pull_data.books == 0 then
            log_fn('No pending changes to pull.')
            on_complete({})
            return
        end

        if not settings.macro_hashes then settings.macro_hashes = {} end

        local pulled = {}
        local skipped_active = {}

        for _, book_data in ipairs(pull_data.books) do
            local book_number = book_data.bookNumber

            -- FFXI holds the currently active macro book in memory and flushes it back
            -- to disk on zone/logout, which would clobber any DAT we wrote. Refuse to
            -- write over the active book unless the caller forces it.
            if active_book and book_number == active_book and not force then
                table.insert(skipped_active, book_number)
            else
                local book = macros.api_to_book(book_data)
                if macros.write_book(macro_path, book_number, book) then
                    local local_hash = macros.hash_book_from_data(book)
                    local remote_hash = book_data.contentHash or ''
                    local key = 'book' .. book_number
                    settings.macro_hashes[key] = { ['local'] = local_hash or '', remote = remote_hash }

                    table.insert(pulled, book_number)
                    log_fn('Pulled book ' .. book_number .. ' successfully.')
                else
                    log_fn('Error writing book ' .. book_number .. ' to DAT files.')
                end
            end
        end

        if #skipped_active > 0 then
            local list = table.concat(skipped_active, ', ')
            log_fn("Skipped book(s) " .. list .. ": you are currently on this macro book in-game.")
            log_fn("FFXI would overwrite the pulled edits with its in-memory copy on zone/logout.")
            log_fn("Switch to a different book in-game ('/macro book N'), then run '//va macros pull' again.")
        end

        local function finalize()
            settings.macro_file_timestamps = macros.get_file_timestamps(macro_path)
            log_fn('Pulled ' .. #pulled .. ' book(s) from server.')
            on_complete(pulled)
        end

        if #pulled > 0 then
            local ack_body = json_encode({ bookNumbers = pulled })
            http_fn({
                url = base_url .. '/api/sync/macros/acknowledge',
                method = 'POST',
                headers = character_headers(api_key, { ['Content-Type'] = 'application/json' }),
                body = ack_body,
                label = 'macros-acknowledge',
            }, function(_, _, _, _) finalize() end)
        else
            finalize()
        end
    end)
end

return macros
