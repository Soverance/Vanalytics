-- addon/vanalytics/session.lua
-- Session-based performance tracking: parses chat log lines for combat/economy events,
-- writes them to a local JSONL file, and uploads batches to the Vanalytics API.

local session = {}
local res = require('resources')

-- State
local active = false
local session_id = nil
local file_handle = nil
local file_path = nil
local event_count = 0
local uploaded_count = 0
local start_time = nil
local player_name = nil
local server_name = nil

-- Dependencies injected via init
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil
local log_success_fn = nil

-----------------------------------------------------------------------
-- Initialization
-----------------------------------------------------------------------
function session.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
    log_success_fn = deps.log_success
end

-----------------------------------------------------------------------
-- Internal: get current zone name
-----------------------------------------------------------------------
local function get_zone_name()
    local info = windower.ffxi.get_info()
    if info and info.zone and res.zones[info.zone] then
        return res.zones[info.zone].en
    end
    return 'Unknown'
end

-----------------------------------------------------------------------
-- Internal: POST helper following the ltn12 source/sink pattern
-----------------------------------------------------------------------
local function api_post(endpoint, body_table)
    local payload = json_encode_fn(body_table)
    local url = settings.ApiUrl .. endpoint
    local ltn12 = require('ltn12')

    local response_body = {}
    local result, status_code, headers = http_request_fn({
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

    return result, status_code, table.concat(response_body)
end

-----------------------------------------------------------------------
-- Internal: parse a chat log line into a structured event
-----------------------------------------------------------------------
local function parse_line(line)
    local source, target, dmg, ability, hp, who, item, count, amount, element

    -- Melee damage: "Player hits Target for N points of damage."
    source, target, dmg = line:match("(.+) hits (.+) for (%d+) points of damage%.")
    if source and target and dmg then
        return {t='MeleeDamage', s=source, tg=target, v=tonumber(dmg)}
    end

    -- Ranged attack: "Player's ranged attack hits Target for N points of damage."
    source, target, dmg = line:match("(.+)'s ranged attack hits (.+) for (%d+) points of damage%.")
    if source then
        return {t='RangedDamage', s=source, tg=target, v=tonumber(dmg)}
    end

    -- Spell/ability damage: "Player casts Spell. Target takes N points of damage."
    source, ability, target, dmg = line:match("(.+) casts (.+)%. (.+) takes (%d+) points of damage%.")
    if source then
        return {t='SpellDamage', s=source, tg=target, v=tonumber(dmg), a=ability}
    end

    -- Ability/WS damage: "Player uses Ability. Target takes N points of damage."
    source, ability, target, dmg = line:match("(.+) uses (.+)%. (.+) takes (%d+) points of damage%.")
    if source then
        return {t='AbilityDamage', s=source, tg=target, v=tonumber(dmg), a=ability}
    end

    -- Healing via spell: "Player casts Spell. Target recovers N HP."
    source, ability, target, hp = line:match("(.+) casts (.+)%. (.+) recovers (%d+) HP%.")
    if source then
        return {t='Healing', s=source, tg=target, v=tonumber(hp), a=ability}
    end

    -- Healing via ability: "Player uses Ability. Target recovers N HP."
    source, ability, target, hp = line:match("(.+) uses (.+)%. (.+) recovers (%d+) HP%.")
    if source then
        return {t='Healing', s=source, tg=target, v=tonumber(hp), a=ability}
    end

    -- Ability used (no damage/healing result): "Player uses Ability."
    -- This must come AFTER the "uses ... takes N damage" and "uses ... recovers N HP" patterns
    -- so damage/healing abilities match those first.
    source, ability = line:match("(.+) uses (.+)%.")
    if source and ability then
        return {t='AbilityUsed', s=source, tg='', v=0, a=ability}
    end

    -- Spell cast (no damage/healing result): "Player casts Spell."
    -- Same ordering logic — damage/healing spells already matched above.
    source, ability = line:match("(.+) casts (.+)%.")
    if source and ability then
        return {t='SpellCast', s=source, tg='', v=0, a=ability}
    end

    -- Defeat: "Player defeats Target."
    source, target = line:match("(.+) defeats (.+)%.")
    if source then
        return {t='MobKill', s=source, tg=target, v=0}
    end

    -- Item obtain (singular): "Player obtains a Item."
    who, item = line:match("(.+) obtains a (.+)%.")
    if who then
        return {t='ItemDrop', s=who, tg=item, v=1}
    end

    -- Item obtain (multiple): "Player obtains N Item."
    who, count, item = line:match("(.+) obtains (%d+) (.+)%.")
    if who then
        return {t='ItemDrop', s=who, tg=item, v=tonumber(count)}
    end

    -- Gil obtain: "Player obtains N gil."
    who, amount = line:match("(.+) obtains (%d+) gil%.")
    if who then
        return {t='GilGain', s=who, tg='', v=tonumber(amount)}
    end

    -- Gil loss: "You lose N gil."
    amount = line:match("You lose (%d+) gil%.")
    if amount then
        return {t='GilLoss', s=player_name, tg='', v=tonumber(amount)}
    end

    -- Magic Burst: "Magic Burst! Target takes N points of damage."
    target, dmg = line:match("Magic Burst! (.+) takes (%d+) points of damage%.")
    if target then
        return {t='MagicBurst', s=player_name, tg=target, v=tonumber(dmg)}
    end

    -- Skillchain: "Skillchain: Element."
    element = line:match("Skillchain: (.+)%.")
    if element then
        return {t='Skillchain', s=player_name, tg='', v=0, a=element}
    end

    -- EXP: "Player gains N experience points."
    who, amount = line:match("(.+) gains (%d+) experience points%.")
    if who then
        return {t='ExpGain', s=who, tg='', v=tonumber(amount)}
    end

    -- Limit points
    who, amount = line:match("(.+) gains (%d+) limit points%.")
    if who then
        return {t='LimitGain', s=who, tg='', v=tonumber(amount)}
    end

    -- Capacity points
    who, amount = line:match("(.+) gains (%d+) capacity points%.")
    if who then
        return {t='CapacityGain', s=who, tg='', v=tonumber(amount)}
    end

    return nil -- unrecognized line
end

-----------------------------------------------------------------------
-- Battle-relevant chat mode filter
-----------------------------------------------------------------------
local function is_relevant_mode(mode)
    if mode >= 20 and mode <= 44 then return true end
    if mode == 110 then return true end
    if mode == 121 then return true end
    if mode == 123 then return true end
    if mode == 127 then return true end
    if mode == 150 or mode == 151 then return true end
    return false
end

-----------------------------------------------------------------------
-- Public API
-----------------------------------------------------------------------

function session.start(character_name, server, zone)
    if active then
        log_error_fn('Session already active. Stop the current session first.')
        return
    end

    player_name = character_name
    server_name = server

    -- Create sessions/ subdirectory if it doesn't exist
    local sessions_dir = windower.addon_path .. 'sessions/'
    os.execute('mkdir "' .. sessions_dir:gsub('/', '\\') .. '" 2>NUL')

    -- Open JSONL file for writing
    local date_stamp = os.date('%Y-%m-%d_%H-%M-%S')
    file_path = sessions_dir .. character_name .. '_' .. date_stamp .. '.jsonl'
    file_handle = io.open(file_path, 'a')
    if not file_handle then
        log_error_fn('Failed to create session file: ' .. file_path)
        return
    end

    -- POST to API to start session
    local result, status_code, response = api_post('/api/session/start', {
        characterName = character_name,
        server = server,
        zone = zone,
    })

    if result and status_code == 200 then
        -- Try to parse session_id from response
        -- Simple pattern match for {"sessionId":"..."}  or {"sessionId":N}
        local sid = response:match('"sessionId"%s*:%s*"([^"]+)"')
        if not sid then
            sid = response:match('"sessionId"%s*:%s*(%d+)')
        end
        session_id = sid
    else
        log_fn('Warning: Could not register session with API (status: ' .. tostring(status_code) .. '). Recording locally.')
    end

    active = true
    start_time = os.clock()
    event_count = 0
    uploaded_count = 0

    log_success_fn('Session started for ' .. character_name .. ' @ ' .. server .. ' (' .. zone .. ')')
end

function session.stop()
    if not active then
        log_error_fn('No active session to stop.')
        return
    end

    -- Flush any remaining events before stopping
    session.flush()

    -- Close file handle
    if file_handle then
        file_handle:close()
        file_handle = nil
    end

    -- POST to API to stop session
    local result, status_code = api_post('/api/session/stop', {
        characterName = player_name,
        server = server_name,
    })

    -- Calculate duration
    local duration = os.clock() - start_time
    local minutes = math.floor(duration / 60)
    local seconds = math.floor(duration % 60)
    local final_count = event_count

    -- Reset all state
    active = false
    session_id = nil
    file_path = nil
    event_count = 0
    uploaded_count = 0
    start_time = nil
    player_name = nil
    server_name = nil

    log_success_fn('Session stopped. ' .. final_count .. ' events recorded over ' .. minutes .. 'm ' .. seconds .. 's.')
end

function session.flush()
    if not active or event_count <= uploaded_count then
        return
    end

    -- Read the JSONL file from uploaded_count line to current end
    local read_handle = io.open(file_path, 'r')
    if not read_handle then
        log_error_fn('Failed to open session file for reading.')
        return
    end

    -- Skip already-uploaded lines
    local line_num = 0
    local pending_lines = {}
    for line in read_handle:lines() do
        line_num = line_num + 1
        if line_num > uploaded_count then
            table.insert(pending_lines, line)
        end
    end
    read_handle:close()

    if #pending_lines == 0 then
        return
    end

    -- Batch into groups of 500
    local batch_size = 500
    local total_uploaded = 0

    for batch_start = 1, #pending_lines, batch_size do
        local batch_end = math.min(batch_start + batch_size - 1, #pending_lines)
        local batch = {}
        for i = batch_start, batch_end do
            table.insert(batch, pending_lines[i])
        end

        -- POST batch to API (send raw JSONL lines as array of strings)
        local result, status_code = api_post('/api/session/events', {
            characterName = player_name,
            server = server_name,
            events = batch,
        })

        if result and status_code == 200 then
            total_uploaded = total_uploaded + #batch
            uploaded_count = uploaded_count + #batch
        else
            log_error_fn('Flush failed at batch starting line ' .. (uploaded_count + batch_start) ..
                ' (status: ' .. tostring(status_code) .. ')')
            break
        end
    end

    if total_uploaded > 0 then
        log_fn('Flushed ' .. total_uploaded .. ' events to API (' .. uploaded_count .. '/' .. event_count .. ' total).')
    end
end

function session.on_text(original, modified, original_mode, modified_mode, blocked)
    if not active then return end

    -- Filter by original_mode — only process battle-relevant modes
    if not is_relevant_mode(original_mode) then return end

    -- Parse the line
    local event = parse_line(original)
    if not event then return end

    -- Add timestamp and zone
    event.ts = os.time()
    event.z = get_zone_name()

    -- Write event to file as JSON line
    if file_handle then
        file_handle:write(json_encode_fn(event) .. '\n')
        file_handle:flush()
    end

    event_count = event_count + 1
end

function session.check_auto_flush()
    if active and (event_count - uploaded_count) > 5000 then
        session.flush()
    end
end

function session.is_active()
    return active
end

function session.print_status()
    if not active then
        log_fn('Session: inactive')
        return
    end

    local duration = os.clock() - start_time
    local minutes = math.floor(duration / 60)
    local seconds = math.floor(duration % 60)

    log_fn('--- Session Status ---')
    log_fn('Active: yes')
    log_fn('Player: ' .. (player_name or 'Unknown'))
    log_fn('Server: ' .. (server_name or 'Unknown'))
    log_fn('Events: ' .. event_count .. ' recorded, ' .. uploaded_count .. ' uploaded')
    log_fn('Duration: ' .. minutes .. 'm ' .. seconds .. 's')
    if file_path then
        log_fn('File: ' .. file_path)
    end
end

function session.cleanup()
    local sessions_dir = windower.addon_path .. 'sessions/'
    local now = os.time()
    local max_age = 7 * 24 * 60 * 60 -- 7 days in seconds

    -- List files by parsing date from filenames
    local dir_handle = io.popen('dir /b "' .. sessions_dir:gsub('/', '\\') .. '" 2>NUL')
    if not dir_handle then return end

    local deleted = 0
    for filename in dir_handle:lines() do
        -- Parse date from filename: charactername_YYYY-MM-DD_HH-MM-SS.jsonl
        local year, month, day, hour, min, sec = filename:match('_(%d%d%d%d)-(%d%d)-(%d%d)_(%d%d)-(%d%d)-(%d%d)%.jsonl$')
        if year then
            local file_time = os.time({
                year = tonumber(year),
                month = tonumber(month),
                day = tonumber(day),
                hour = tonumber(hour),
                min = tonumber(min),
                sec = tonumber(sec),
            })
            if (now - file_time) > max_age then
                local full_path = sessions_dir .. filename
                os.remove(full_path)
                deleted = deleted + 1
            end
        end
    end
    dir_handle:close()

    if deleted > 0 then
        log_fn('Cleaned up ' .. deleted .. ' session file(s) older than 7 days.')
    end
end

return session
