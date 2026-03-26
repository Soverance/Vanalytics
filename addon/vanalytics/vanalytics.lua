-- addon/vanalytics/vanalytics.lua
-- Vanalytics - FFXI Character Progress Tracker
-- Automatically syncs character state to the Vanalytics web app

_addon.name = 'Vanalytics'
_addon.author = 'Soverance'
_addon.version = '1.0.0'
_addon.commands = {'vanalytics', 'va'}

local config = require('config')
local res = require('resources')
local session = require('session')
local inventory = require('inventory')
local macro_lib = require('macros')

-- Default settings (matches settings.xml)
local defaults = {
    ApiUrl = 'https://vanalytics.soverance.com',
    ApiKey = '',
    SyncInterval = 15,
    macro_hashes = {},
}

local settings = config.load(defaults)

-- State
local last_sync_time = nil
local last_sync_status = 'Never synced'
local sync_timer = nil
local MIN_INTERVAL = 5

-----------------------------------------------------------------------
-- Utility: chat log output
-----------------------------------------------------------------------
local function log(msg)
    windower.add_to_chat(8, '[Vanalytics] ' .. msg)
end

local function log_error(msg)
    windower.add_to_chat(167, '[Vanalytics] ' .. msg)
end

local function log_success(msg)
    windower.add_to_chat(158, '[Vanalytics] ' .. msg)
end

-----------------------------------------------------------------------
-- HTTP helper: use ssl.https for HTTPS URLs, socket.http for HTTP
-----------------------------------------------------------------------
local function http_request(params)
    local ltn12 = require('ltn12')
    if params.url and params.url:sub(1, 5) == 'https' then
        local https = require('ssl.https')
        https.TIMEOUT = 5
        return https.request(params)
    else
        local http = require('socket.http')
        http.TIMEOUT = 5
        return http.request(params)
    end
end

-----------------------------------------------------------------------
-- Equipment slot mapping (Windower slot ID -> API slot name)
-----------------------------------------------------------------------
local slot_names = {
    [0]  = 'Main',
    [1]  = 'Sub',
    [2]  = 'Range',
    [3]  = 'Ammo',
    [4]  = 'Head',
    [5]  = 'Body',
    [6]  = 'Hands',
    [7]  = 'Legs',
    [8]  = 'Feet',
    [9]  = 'Neck',
    [10] = 'Waist',
    [11] = 'Ear1',
    [12] = 'Ear2',
    [13] = 'Ring1',
    [14] = 'Ring2',
    [15] = 'Back',
}

-----------------------------------------------------------------------
-- Crafting skill IDs and rank thresholds
-----------------------------------------------------------------------
-- Crafting skill keys as they appear in windower.ffxi.get_player().skills
-- These may be keyed by lowercase name or by skill ID depending on Windower version.
-- We try both approaches for compatibility.
local craft_skill_names = {
    ['fishing']       = 'Fishing',
    ['woodworking']   = 'Woodworking',
    ['smithing']      = 'Smithing',
    ['goldsmithing']  = 'Goldsmithing',
    ['clothcraft']    = 'Clothcraft',
    ['leathercraft']  = 'Leathercraft',
    ['bonecraft']     = 'Bonecraft',
    ['alchemy']       = 'Alchemy',
    ['cooking']       = 'Cooking',
    ['synergy']       = 'Synergy',
}

local craft_skill_ids = {
    [48] = 'Fishing',
    [49] = 'Woodworking',
    [50] = 'Smithing',
    [51] = 'Goldsmithing',
    [52] = 'Clothcraft',
    [53] = 'Leathercraft',
    [54] = 'Bonecraft',
    [55] = 'Alchemy',
    [56] = 'Cooking',
    [57] = 'Synergy',
}

local function get_craft_rank(level)
    if level == 0 then return 'Amateur'
    elseif level < 10 then return 'Recruit'
    elseif level < 20 then return 'Initiate'
    elseif level < 30 then return 'Novice'
    elseif level < 40 then return 'Apprentice'
    elseif level < 50 then return 'Journeyman'
    elseif level < 60 then return 'Craftsman'
    elseif level < 70 then return 'Artisan'
    elseif level < 80 then return 'Adept'
    elseif level < 90 then return 'Veteran'
    elseif level < 100 then return 'Expert'
    elseif level < 110 then return 'Authority'
    else return 'Luminary'
    end
end

-----------------------------------------------------------------------
-- JSON encoder (minimal, sufficient for sync payload)
-----------------------------------------------------------------------
local function json_encode_string(s)
    -- Build output byte-by-byte to handle control chars efficiently
    local out = {}
    for i = 1, #s do
        local b = s:byte(i)
        if b == 0x5C then      -- backslash
            out[#out+1] = '\\\\'
        elseif b == 0x22 then  -- double quote
            out[#out+1] = '\\"'
        elseif b == 0x0A then  -- newline
            out[#out+1] = '\\n'
        elseif b == 0x0D then  -- carriage return
            out[#out+1] = '\\r'
        elseif b == 0x09 then  -- tab
            out[#out+1] = '\\t'
        elseif b < 0x20 then   -- other control chars
            out[#out+1] = string.format('\\u%04x', b)
        else
            out[#out+1] = s:sub(i, i)
        end
    end
    return '"' .. table.concat(out) .. '"'
end

local function json_encode(val)
    if type(val) == 'string' then
        return json_encode_string(val)
    elseif type(val) == 'number' then
        return tostring(val)
    elseif type(val) == 'boolean' then
        return val and 'true' or 'false'
    elseif type(val) == 'table' then
        -- Check if array (sequential integer keys starting at 1)
        local is_array = true
        local max_index = 0
        for k, _ in pairs(val) do
            if type(k) ~= 'number' or k ~= math.floor(k) or k < 1 then
                is_array = false
                break
            end
            if k > max_index then max_index = k end
        end
        if is_array and max_index == #val then
            local parts = {}
            for i = 1, #val do
                parts[i] = json_encode(val[i])
            end
            return '[' .. table.concat(parts, ',') .. ']'
        else
            local parts = {}
            for k, v in pairs(val) do
                table.insert(parts, json_encode_string(tostring(k)) .. ':' .. json_encode(v))
            end
            return '{' .. table.concat(parts, ',') .. '}'
        end
    elseif val == nil then
        return 'null'
    end
    return 'null'
end

-----------------------------------------------------------------------
-- JSON decoder (minimal, sufficient for API responses)
-----------------------------------------------------------------------
local json_decode
do
    local function skip_ws(s, pos)
        return s:match('^%s*()', pos)
    end

    local function decode_string(s, pos)
        -- pos should be right after opening "
        local result = {}
        local i = pos
        while i <= #s do
            local c = s:sub(i, i)
            if c == '"' then
                return table.concat(result), i + 1
            elseif c == '\\' then
                i = i + 1
                local esc = s:sub(i, i)
                if esc == '"' then table.insert(result, '"')
                elseif esc == '\\' then table.insert(result, '\\')
                elseif esc == '/' then table.insert(result, '/')
                elseif esc == 'n' then table.insert(result, '\n')
                elseif esc == 'r' then table.insert(result, '\r')
                elseif esc == 't' then table.insert(result, '\t')
                else table.insert(result, esc)
                end
                i = i + 1
            else
                table.insert(result, c)
                i = i + 1
            end
        end
        return table.concat(result), i
    end

    local function decode_value(s, pos)
        pos = skip_ws(s, pos)
        local c = s:sub(pos, pos)

        if c == '"' then
            return decode_string(s, pos + 1)
        elseif c == '{' then
            local obj = {}
            pos = skip_ws(s, pos + 1)
            if s:sub(pos, pos) == '}' then return obj, pos + 1 end
            while true do
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) ~= '"' then break end
                local key
                key, pos = decode_string(s, pos + 1)
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ':' then pos = pos + 1 end
                local val
                val, pos = decode_value(s, pos)
                obj[key] = val
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ',' then pos = pos + 1
                elseif s:sub(pos, pos) == '}' then pos = pos + 1; break
                end
            end
            return obj, pos
        elseif c == '[' then
            local arr = {}
            pos = skip_ws(s, pos + 1)
            if s:sub(pos, pos) == ']' then return arr, pos + 1 end
            while true do
                local val
                val, pos = decode_value(s, pos)
                table.insert(arr, val)
                pos = skip_ws(s, pos)
                if s:sub(pos, pos) == ',' then pos = pos + 1
                elseif s:sub(pos, pos) == ']' then pos = pos + 1; break
                end
            end
            return arr, pos
        elseif s:sub(pos, pos + 3) == 'true' then
            return true, pos + 4
        elseif s:sub(pos, pos + 4) == 'false' then
            return false, pos + 5
        elseif s:sub(pos, pos + 3) == 'null' then
            return nil, pos + 4
        else
            -- number
            local num_str = s:match('^-?%d+%.?%d*[eE]?[+-]?%d*', pos)
            if num_str then
                return tonumber(num_str), pos + #num_str
            end
            return nil, pos + 1
        end
    end

    json_decode = function(s)
        if not s or s == '' then return nil end
        local val, _ = decode_value(s, 1)
        return val
    end
end

-----------------------------------------------------------------------
-- Macro sync functions
-----------------------------------------------------------------------
local function find_macro_path()
    local user_dir = windower.ffxi_path .. 'USER'
    -- Find the most recently modified content ID directory
    local best_dir = nil
    local best_time = 0
    local handle = io.popen('dir "' .. user_dir .. '" /b /ad /o-d 2>nul')
    if handle then
        -- First line is the most recently modified directory
        best_dir = handle:read('*l')
        handle:close()
    end
    if not best_dir then return nil end
    return user_dir .. '\\' .. best_dir
end

-- Stored file timestamps from last macro check (avoids re-hashing unchanged files)
local macro_file_timestamps = {}

local function sync_macros(force)
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'

    local macro_path = find_macro_path()
    if not macro_path then
        log_error('Could not find macro directory.')
        return
    end

    -- Single dir command to get all file timestamps (cheap compared to reading 200 files)
    local new_timestamps = macro_lib.get_file_timestamps(macro_path)

    local changed_books = {}
    local new_hashes = {}
    local books_found = 0
    local titles = nil  -- lazy-loaded only if needed

    for book_num = 1, macro_lib.BOOKS_COUNT do
        local hash_key = 'book' .. book_num

        -- Fast path: skip books whose files haven't been modified since last check
        if not force and not macro_lib.book_files_changed(macro_path, book_num, macro_file_timestamps, new_timestamps) then
            -- Check if we have a stored hash (i.e., we've seen this book before)
            if settings.macro_hashes[hash_key] then
                books_found = books_found + 1
            end
        else
            -- Files changed (or force) — compute hash to confirm actual content change
            local hash = macro_lib.hash_book(macro_path, book_num)
            if hash then
                books_found = books_found + 1
                local stored_hash = settings.macro_hashes[hash_key]
                if force or hash ~= stored_hash then
                    if not titles then
                        titles = macro_lib.parse_titles(macro_path)
                    end
                    local book = macro_lib.parse_book(macro_path, book_num)
                    if book then
                        table.insert(changed_books, macro_lib.book_to_api(book, book_num, hash, titles[book_num]))
                        new_hashes[hash_key] = hash
                    end
                end
            end
        end
    end

    -- Update stored timestamps for next cycle
    macro_file_timestamps = new_timestamps

    if books_found == 0 then
        log_error('No macro DAT files found at: ' .. macro_path)
        return
    end

    if #changed_books == 0 then
        return
    end

    log('Uploading ' .. #changed_books .. ' macro book(s)...')

    local url = settings.ApiUrl .. '/api/sync/macros'
    local ltn12 = require('ltn12')
    local uploaded = 0

    -- Upload one book at a time to avoid timeout on large payloads
    for _, book in ipairs(changed_books) do
        local payload = json_encode({ books = { book } })
        local response_body = {}

        local result, status_code = http_request({
            url = url,
            method = 'POST',
            headers = {
                ['Content-Type'] = 'application/json',
                ['Content-Length'] = tostring(#payload),
                ['X-Api-Key'] = settings.ApiKey,
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        })

        if not result then
            log_error('Macro sync failed on book ' .. book.bookNumber .. ': ' .. tostring(status_code))
        elseif status_code == 200 then
            uploaded = uploaded + 1
            local hash_key = 'book' .. book.bookNumber
            if new_hashes[hash_key] then
                settings.macro_hashes[hash_key] = new_hashes[hash_key]
            end
        else
            local resp = table.concat(response_body)
            log_error('Macro sync failed on book ' .. book.bookNumber .. ' (status ' .. tostring(status_code) .. '): ' .. resp)
        end
    end

    if uploaded > 0 then
        config.save(settings)
        log_success('Macro sync: ' .. uploaded .. '/' .. #changed_books .. ' book(s) uploaded.')
    end
end

local function check_pending_macros(macro_path)
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'

    if not macro_path then
        macro_path = find_macro_path()
    end
    if not macro_path then
        log_error('Could not find macro directory.')
        return
    end

    local url = settings.ApiUrl .. '/api/sync/macros/pending'
    local ltn12 = require('ltn12')
    local response_body = {}

    local result, status_code = http_request({
        url = url,
        method = 'GET',
        headers = {
            ['X-Api-Key'] = settings.ApiKey,
        },
        sink = ltn12.sink.table(response_body),
    })

    if not result or status_code ~= 200 then return end

    local body = table.concat(response_body)
    local pending = json_decode(body)
    if not pending or not pending.pendingBooks or #pending.pendingBooks == 0 then return end

    local files_written = 0

    for _, book_number in ipairs(pending.pendingBooks) do
        -- GET the full book data
        local book_url = settings.ApiUrl .. '/api/sync/macros/' .. book_number
        local book_response = {}
        local br, bs = http_request({
            url = book_url,
            method = 'GET',
            headers = {
                ['X-Api-Key'] = settings.ApiKey,
            },
            sink = ltn12.sink.table(book_response),
        })

        if br and bs == 200 then
            local book_data = json_decode(table.concat(book_response))
            if book_data then
                local book = macro_lib.api_to_book(book_data)
                local book_idx = book_number - 1
                local filename = string.format('mcr%d.dat', book_idx)
                local filepath = macro_path .. '\\' .. filename
                if macro_lib.write_book(filepath, book) then
                    files_written = files_written + 1
                    -- Update hash so we don't re-upload what we just downloaded
                    local new_hash = macro_lib.hash_file(filepath)
                    if new_hash then
                        settings.macro_hashes[filename] = new_hash
                    end
                end

                -- DELETE to acknowledge receipt
                local ack_response = {}
                http_request({
                    url = settings.ApiUrl .. '/api/sync/macros/pending/' .. book_number,
                    method = 'DELETE',
                    headers = {
                        ['X-Api-Key'] = settings.ApiKey,
                    },
                    sink = ltn12.sink.table(ack_response),
                })
            end
        end
    end

    if files_written > 0 then
        config.save(settings)
        log_success('Macro pull: ' .. files_written .. ' book(s) written.')
        windower.send_command('input /reloadmacros')
    end
end

-----------------------------------------------------------------------
-- Initialize session and inventory modules
-----------------------------------------------------------------------
session.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    json_decode = json_decode,
    log = log,
    log_error = log_error,
    log_success = log_success,
})

inventory.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})

-----------------------------------------------------------------------
-- Read character state from Windower APIs
-----------------------------------------------------------------------
local function read_character_state()
    local player = windower.ffxi.get_player()
    if not player then
        return nil, 'Not logged into a character'
    end

    local info = windower.ffxi.get_info()
    if not info then
        return nil, 'Could not read character info'
    end

    -- Character name and server
    local char_name = player.name
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'

    -- Active job
    local active_job = player.main_job
    local active_job_level = player.main_job_level

    -- All jobs with levels > 0, including JP/CP data
    local jobs = {}
    for job_key, level in pairs(player.jobs) do
        if type(level) == 'number' and level > 0 then
            local job_abbr = tostring(job_key)
            local jp_data = player.job_points and player.job_points[job_abbr:lower()]
            table.insert(jobs, {
                job = job_abbr,
                level = level,
                jp = jp_data and jp_data.jp or 0,
                jpSpent = jp_data and jp_data.jp_spent or 0,
                cp = jp_data and jp_data.cp or 0,
            })
        end
    end

    -- Equipped gear
    -- Windower's get_items().equipment uses string keys matching slot names.
    local equip_key_map = {
        [0]  = 'main',
        [1]  = 'sub',
        [2]  = 'range',
        [3]  = 'ammo',
        [4]  = 'head',
        [5]  = 'body',
        [6]  = 'hands',
        [7]  = 'legs',
        [8]  = 'feet',
        [9]  = 'neck',
        [10] = 'waist',
        [11] = 'left_ear',
        [12] = 'right_ear',
        [13] = 'left_ring',
        [14] = 'right_ring',
        [15] = 'back',
    }

    -- Equipped gear
    -- Windower equipment fields: slot_name = inventory index, slot_name_bag = bag ID
    local equip_keys = {
        [0]  = 'main',
        [1]  = 'sub',
        [2]  = 'range',
        [3]  = 'ammo',
        [4]  = 'head',
        [5]  = 'body',
        [6]  = 'hands',
        [7]  = 'legs',
        [8]  = 'feet',
        [9]  = 'neck',
        [10] = 'waist',
        [11] = 'left_ear',
        [12] = 'right_ear',
        [13] = 'left_ring',
        [14] = 'right_ring',
        [15] = 'back',
    }

    local gear = {}
    local items = windower.ffxi.get_items()
    if items and items.equipment then
        local equip = items.equipment
        -- Map numeric bag IDs to items table string keys
        local bag_names = {
            [0]  = 'inventory',
            [1]  = 'safe',
            [2]  = 'storage',
            [3]  = 'temporary',
            [4]  = 'locker',
            [5]  = 'satchel',
            [6]  = 'sack',
            [7]  = 'case',
            [8]  = 'wardrobe',
            [9]  = 'safe2',
            [10] = 'wardrobe2',
            [11] = 'wardrobe3',
            [12] = 'wardrobe4',
            [13] = 'wardrobe5',
            [14] = 'wardrobe6',
            [15] = 'wardrobe7',
            [16] = 'wardrobe8',
            [17] = 'recycle',
        }

        for slot_id, slot_name in pairs(slot_names) do
            local ekey = equip_keys[slot_id]
            if ekey then
                local inv_index = equip[ekey]
                local bag_id = equip[ekey .. '_bag']
                if inv_index and inv_index > 0 and bag_id then
                    local bag_key = bag_names[bag_id]
                    local bag_table = bag_key and items[bag_key]
                    if bag_table then
                        local item = bag_table[inv_index]
                        if item and item.id and item.id > 0 then
                            local item_res = res.items[item.id]
                            local item_name = item_res and item_res.en or ('Item ' .. item.id)
                            table.insert(gear, {
                                slot = slot_name,
                                itemId = item.id,
                                itemName = item_name,
                            })
                        end
                    end
                end
            end
        end
    end

    -- Crafting skills — try name-based keys first, fall back to ID-based
    local crafting = {}
    if player.skills then
        -- Try name-based keys (e.g., player.skills.fishing)
        for skill_key, craft_name in pairs(craft_skill_names) do
            local skill = player.skills[skill_key]
            if skill then
                local level = type(skill) == 'table' and (skill.level or 0) or tonumber(skill) or 0
                if level > 0 then
                    table.insert(crafting, {
                        craft = craft_name,
                        level = level,
                        rank = get_craft_rank(level),
                    })
                end
            end
        end
        -- If no name-based results, try ID-based keys
        if #crafting == 0 then
            for skill_id, craft_name in pairs(craft_skill_ids) do
                local skill = player.skills[skill_id]
                if skill then
                    local level = type(skill) == 'table' and (skill.level or 0) or tonumber(skill) or 0
                    if level > 0 then
                        table.insert(crafting, {
                            craft = craft_name,
                            level = level,
                            rank = get_craft_rank(level),
                        })
                    end
                end
            end
        end
    end

    -- Collect merit points (only non-zero values to keep payload small)
    local merits = nil
    if player.merits then
        merits = {}
        for merit_key, merit_val in pairs(player.merits) do
            if type(merit_val) == 'number' and merit_val > 0 then
                merits[merit_key] = merit_val
            end
        end
        -- Use nil if no merits to avoid empty array serialization
        if not next(merits) then merits = nil end
    end

    local state = {
        characterName = char_name,
        server = server,
        activeJob = active_job,
        activeJobLevel = active_job_level,
        subJob = player.sub_job,
        subJobLevel = player.sub_job_level,
        masterLevel = player.superior_level,
        itemLevel = player.item_level,
        hp = player.vitals.hp,
        maxHp = player.vitals.max_hp,
        mp = player.vitals.mp,
        maxMp = player.vitals.max_mp,
        linkshell = player.linkshell,
        nation = player.nation,
        merits = merits,
        jobs = jobs,
        gear = gear,
        crafting = crafting,
    }

    -- Read mob entity for race and model data
    local mob = windower.ffxi.get_mob_by_id(player.id)
    if mob then
        state.race = mob.race
    end

    -- Models: attempt to read equipment model IDs from the player mob entity.
    if mob and mob.models then
        -- Slot 1 is the face/hair model
        local face_id = mob.models[1]
        if face_id and face_id >= 0 then
            state.faceModelId = face_id
        end

        local models = {}
        for slot_id = 2, 9 do
            local model_id = mob.models[slot_id]
            if model_id and model_id > 0 then
                table.insert(models, {
                    slotId = slot_id,
                    modelId = model_id,
                })
            end
        end
        if #models > 0 then
            state.models = models
        end
    end

    return state
end

-----------------------------------------------------------------------
-- HTTP sync to API
-----------------------------------------------------------------------
local function do_sync()
    if settings.ApiKey == '' then
        log_error('API key not configured. Set it in addon/vanalytics/settings.xml')
        return
    end

    local state, err = read_character_state()
    if not state then
        log_error(err)
        return
    end

    local payload = json_encode(state)
    local url = settings.ApiUrl .. '/api/sync'
    local ltn12 = require('ltn12')

    -- Note: HTTP request is synchronous and will briefly freeze the game.
    -- This is acceptable for an infrequent sync (every 5-15 min). A short timeout
    -- limits the freeze if the API is unreachable.
    local response_body = {}
    local result, status_code, headers = http_request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['Content-Length'] = tostring(#payload),
            ['X-Api-Key'] = settings.ApiKey,
        },
        source = ltn12.source.string(payload),
        sink = ltn12.sink.table(response_body),
    })

        if not result then
            log_error('Connection failed: ' .. tostring(status_code))
            last_sync_status = 'Connection failed'
            return
        end

        if status_code == 200 then
            last_sync_time = os.time()
            last_sync_status = 'Success'
            log_success('Sync successful (' .. state.characterName .. ' @ ' .. state.server .. ')')
        elseif status_code == 403 then
            last_sync_status = 'Forbidden (no license)'
            log_error('Character does not have an active license. Visit the Vanalytics web app to activate.')
        elseif status_code == 429 then
            last_sync_status = 'Rate limited'
            log_error('Rate limit exceeded. Sync will retry on next interval.')
        elseif status_code == 401 then
            last_sync_status = 'Unauthorized'
            log_error('Invalid API key. Check your settings.xml configuration.')
        else
            last_sync_status = 'Error (' .. tostring(status_code) .. ')'
            log_error('Sync failed with status ' .. tostring(status_code))
        end

    -- Sync inventory diffs
    local player = windower.ffxi.get_player()
    local info = windower.ffxi.get_info()
    if player and info then
        local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
        inventory.sync(player.name, server_name)
    end
end

-----------------------------------------------------------------------
-- Auto-sync timer (single global prerender handler, controlled by state)
-----------------------------------------------------------------------
local timer_active = false
local timer_elapsed = 0
local timer_last_time = os.clock()
local timer_interval_seconds = 0

local function get_effective_interval()
    local interval = settings.SyncInterval
    if interval < MIN_INTERVAL then
        interval = MIN_INTERVAL
    end
    return interval
end

local function start_timer()
    timer_interval_seconds = get_effective_interval() * 60
    timer_elapsed = 0
    timer_last_time = os.clock()
    timer_active = true
end

local function stop_timer()
    timer_active = false
end

-----------------------------------------------------------------------
-- Bazaar Presence Scan (passive, runs on sync timer)
-----------------------------------------------------------------------
local function scan_bazaars()
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    local zone = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'

    local mob_array = windower.ffxi.get_mob_array()
    local bazaar_players = {}

    for _, mob in pairs(mob_array) do
        if mob.spawn_type == 13 and mob.name and mob.name ~= '' then
            -- spawn_type 13 = PC; check bazaar flag in status
            -- The bazaar flag is indicated by the player having a bazaar icon
            -- This is typically in mob.status or a specific flag field
            if mob.bazaar then
                table.insert(bazaar_players, { name = mob.name })
            end
        end
    end

    if #bazaar_players == 0 then return end

    local payload = json_encode({
        server = server,
        zone = zone,
        players = bazaar_players,
    })

    local url = settings.ApiUrl .. '/api/economy/bazaar/presence'
    local ltn12 = require('ltn12')

    local response_body = {}
    http_request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['Content-Length'] = tostring(#payload),
            ['X-Api-Key'] = settings.ApiKey,
        },
        source = ltn12.source.string(payload),
        sink = ltn12.sink.table(response_body),
    })
end

-----------------------------------------------------------------------
-- Work queue: spreads sync tasks across frames to avoid stutter.
-- Each entry is a function. One function runs per frame until the queue
-- is empty.
-----------------------------------------------------------------------
local work_queue = {}

local function enqueue_sync_work()
    -- Queue each sync task as a separate frame's work
    table.insert(work_queue, function() do_sync() end)
    table.insert(work_queue, function() scan_bazaars() end)
    table.insert(work_queue, function() sync_macros(false) end)
end

-- Single prerender handler registered once at load time
windower.register_event('prerender', function()
    -- Process one queued work item per frame
    if #work_queue > 0 then
        local task = table.remove(work_queue, 1)
        task()
    end

    if not timer_active then return end

    local now = os.clock()
    timer_elapsed = timer_elapsed + (now - timer_last_time)
    timer_last_time = now

    if timer_elapsed >= timer_interval_seconds then
        timer_elapsed = 0
        enqueue_sync_work()
    end

    -- Check if session needs auto-flush
    session.check_auto_flush()
end)

-- TODO: Packet capture for AH history (0x0E7) and bazaar contents (0x109)
-- Byte offsets are placeholders and need in-game verification with
-- Windower's PacketViewer addon before this will produce usable data.
-- See git history for the skeleton implementation.
--
-- windower.register_event('incoming chunk', function(id, data)
--     -- AH History (0x0E7): parse item_id, price, timestamp, buyer/seller
--     --   -> POST /api/economy/ah
--     -- Bazaar Contents (0x109): parse seller_name, items, prices, quantities
--     --   -> POST /api/economy/bazaar
-- end)

-----------------------------------------------------------------------
-- Chat commands
-----------------------------------------------------------------------
windower.register_event('addon command', function(command, ...)
    command = command and command:lower() or 'help'
    local args = {...}

    if command == 'sync' then
        log('Syncing...')
        do_sync()

    elseif command == 'status' then
        local interval = get_effective_interval()
        log('--- Vanalytics Status ---')
        log('API URL: ' .. settings.ApiUrl)
        log('API Key: ' .. (settings.ApiKey ~= '' and '****' .. settings.ApiKey:sub(-4) or 'Not set'))
        log('Sync Interval: ' .. interval .. ' minutes')
        if last_sync_time then
            local ago = os.difftime(os.time(), last_sync_time)
            local mins = math.floor(ago / 60)
            log('Last Sync: ' .. mins .. ' minute(s) ago (' .. last_sync_status .. ')')
        else
            log('Last Sync: ' .. last_sync_status)
        end

    elseif command == 'apikey' then
        local key = args[1]
        if not key or key == '' then
            log_error('Usage: //vanalytics apikey <your-api-key>')
            return
        end
        settings.ApiKey = key
        config.save(settings)
        log_success('API key saved.')

    elseif command == 'interval' then
        local minutes = tonumber(args[1])
        if not minutes then
            log_error('Usage: //vanalytics interval <minutes>')
            return
        end
        if minutes < MIN_INTERVAL then
            log('Minimum interval is ' .. MIN_INTERVAL .. ' minutes. Setting to ' .. MIN_INTERVAL .. '.')
            minutes = MIN_INTERVAL
        end
        settings.SyncInterval = minutes
        config.save(settings)
        log('Sync interval set to ' .. minutes .. ' minutes.')
        -- Restart timer with new interval
        stop_timer()
        start_timer()

    elseif command == 'session' then
        local subcommand = args[1] and args[1]:lower() or 'help'
        if subcommand == 'start' then
            local player = windower.ffxi.get_player()
            local info = windower.ffxi.get_info()
            if not player then
                log_error('Not logged in.')
                return
            end
            local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
            local zone_name = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'
            session.start(player.name, server_name, zone_name)
        elseif subcommand == 'stop' then
            session.stop()
        elseif subcommand == 'status' then
            session.print_status()
        elseif subcommand == 'flush' then
            session.flush()
        elseif subcommand == 'cleanup' then
            session.cleanup()
        elseif subcommand == 'debug' then
            local enabled = session.toggle_debug()
            log('Session debug mode: ' .. (enabled and 'ON' or 'OFF'))
        else
            log('Session commands: start | stop | status | flush | cleanup | debug')
        end

    elseif command == 'dump' then
        local player = windower.ffxi.get_player()
        if not player then
            log_error('Not logged in.')
            return
        end
        local items = windower.ffxi.get_items()
        local info = windower.ffxi.get_info()
        local mob = windower.ffxi.get_mob_by_id(player.id)

        local lines = {}

        -- Dump all known Windower path variables
        table.insert(lines, '=== Windower Paths ===')
        table.insert(lines, 'windower.addon_path = ' .. tostring(windower.addon_path or 'nil'))
        table.insert(lines, 'windower.windower_path = ' .. tostring(windower.windower_path or 'nil'))
        table.insert(lines, 'windower.pol_path = ' .. tostring(windower.pol_path or 'nil'))
        table.insert(lines, 'windower.ffxi_path = ' .. tostring(windower.ffxi_path or 'nil'))
        table.insert(lines, 'windower.script_path = ' .. tostring(windower.script_path or 'nil'))
        table.insert(lines, 'windower.appdata_path = ' .. tostring(windower.appdata_path or 'nil'))
        table.insert(lines, '')

        local function dump(val, prefix, depth)
            if depth > 4 then
                table.insert(lines, prefix .. ' = <max depth>')
                return
            end
            if type(val) == 'table' then
                for k, v in pairs(val) do
                    local key = prefix .. '.' .. tostring(k)
                    if type(v) == 'table' then
                        table.insert(lines, key .. ' = {table}')
                        dump(v, key, depth + 1)
                    else
                        table.insert(lines, key .. ' = ' .. tostring(v) .. ' (' .. type(v) .. ')')
                    end
                end
            else
                table.insert(lines, prefix .. ' = ' .. tostring(val) .. ' (' .. type(val) .. ')')
            end
        end

        table.insert(lines, '=== player ===')
        dump(player, 'player', 0)
        table.insert(lines, '')
        table.insert(lines, '=== info ===')
        dump(info, 'info', 0)
        table.insert(lines, '')
        table.insert(lines, '=== mob (self) ===')
        if mob then dump(mob, 'mob', 0) else table.insert(lines, 'mob = nil') end
        table.insert(lines, '')
        table.insert(lines, '=== items.equipment ===')
        if items and items.equipment then dump(items.equipment, 'equipment', 0) end
        table.insert(lines, '')
        -- Dump one bag sample (inventory slot 1) to show item structure
        table.insert(lines, '=== items.inventory[1] (sample) ===')
        if items and items.inventory and items.inventory[1] then
            dump(items.inventory[1], 'inventory[1]', 0)
        end

        local path = windower.addon_path .. 'dump.txt'
        local f = io.open(path, 'w')
        if f then
            f:write(table.concat(lines, '\n'))
            f:close()
            log_success('Player data dumped to ' .. path)
        else
            log_error('Failed to write dump file.')
        end

    elseif command == 'url' then
        local url = args[1]
        if not url or url == '' then
            log('Current API URL: ' .. settings.ApiUrl)
            return
        end
        if url == 'local' then
            url = 'http://localhost:5000'
        elseif url == 'prod' then
            url = 'https://vanalytics.soverance.com'
        end
        settings.ApiUrl = url
        config.save(settings)
        log_success('API URL set to: ' .. url)

    elseif command == 'macros' then
        local subcommand = args[1] and args[1]:lower() or 'help'
        if subcommand == 'push' then
            log('Force-uploading all macro books...')
            sync_macros(true)
        elseif subcommand == 'pull' then
            log('Checking for pending macro updates...')
            check_pending_macros(nil)
        elseif subcommand == 'status' then
            local tracked = 0
            for _ in pairs(settings.macro_hashes) do
                tracked = tracked + 1
            end
            log('Macro sync: ' .. tracked .. '/20 books tracked.')
        elseif subcommand == 'dump' then
            local macro_path = find_macro_path()
            if not macro_path then
                log_error('Could not find macro directory.')
                return
            end
            -- Dump mcr0.dat and mcr1.dat (Book 1 and Book 2)
            for i = 0, 1 do
                local dat = macro_path .. '\\mcr' .. i .. '.dat'
                local out = windower.addon_path .. 'mcr' .. i .. '_dump.txt'
                if macro_lib.dump_dat(dat, out) then
                    log_success('Dumped mcr' .. i .. '.dat to ' .. out)
                else
                    log_error('Failed to dump mcr' .. i .. '.dat')
                end
            end
        else
            log('Macro commands: push | pull | status | dump')
        end

    elseif command == 'help' then
        log('--- Vanalytics Commands ---')
        log('//va apikey <key> - Set your API key')
        log('//va url <url>    - Set API URL (or: local / prod)')
        log('//va sync         - Sync now')
        log('//va status       - Show status')
        log('//va interval N   - Set sync interval (min: ' .. MIN_INTERVAL .. ')')
        log('//va dump         - Dump player data to file')
        log('//va session start   - Start a performance tracking session')
        log('//va session stop    - Stop the active session and upload data')
        log('//va session status  - Show current session info')
        log('//va session flush   - Manually upload buffered events')
        log('//va session cleanup - Delete old session files')
        log('//va session debug   - Toggle debug mode (logs unmatched chat lines)')
        log('//va macros push     - Force upload all macro books')
        log('//va macros pull     - Check for pending macro updates')
        log('//va macros status   - Show tracked macro book count')
        log('//va help         - Show this help')

    else
        log_error('Unknown command: ' .. command .. '. Type //vanalytics help')
    end
end)

-----------------------------------------------------------------------
-- Addon lifecycle events
-----------------------------------------------------------------------
windower.register_event('login', function(name)
    if settings.ApiKey == '' then
        log('Logged in as ' .. name .. '.')
        log_error('No API key configured. Run: //vanalytics apikey <your-key>')
    else
        log('Logged in as ' .. name .. '. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
        start_timer()
    end
end)

windower.register_event('logout', function()
    stop_timer()
    last_sync_time = nil
    last_sync_status = 'Never synced'
end)

windower.register_event('load', function()
    -- If already logged in when addon loads, start timer
    local player = windower.ffxi.get_player()
    if player then
        if settings.ApiKey == '' then
            log('Loaded.')
            log_error('No API key configured. Run: //vanalytics apikey <your-key>')
        else
            log('Loaded. Auto-sync active (every ' .. get_effective_interval() .. ' min).')
            start_timer()
        end
    else
        log('Loaded. Waiting for login...')
    end
end)

windower.register_event('incoming text', function(original, modified, original_mode, modified_mode, blocked)
    session.on_text(original, modified, original_mode, modified_mode, blocked)
end)

windower.register_event('unload', function()
    stop_timer()
    if session.is_active() then
        session.stop()
    end
end)
