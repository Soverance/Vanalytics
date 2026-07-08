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
local debug_mode = false
local debug_handle = nil

-- Flush hygiene: prevent overlapping flushes and stop a persistently-failing
-- flush from re-firing on every prerender frame (which spikes chat spam and
-- tanks FPS). is_flushing guards re-entrancy; flush_backoff_until gates the
-- auto-flush path after a failure so we retry on a cooldown, not per-frame.
local is_flushing = false
local flush_backoff_until = 0
local flush_fail_count = 0
-- Callbacks for flush() calls that arrived while another flush was in flight
-- (e.g. a stop/manual-flush racing an auto-flush). Run when the current one
-- finishes so no request is silently dropped.
local flush_waiters = {}

-- Dependencies injected via init
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local json_decode_fn = nil
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
    json_decode_fn = deps.json_decode
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
-- Internal: clamp a string to a byte length. FFXI names/abilities are
-- ASCII, so byte length == char length here. This is a backstop matching
-- the server's column widths so a mis-parsed (greedy-regex) over-length
-- value can never trip server-side validation and reject a whole batch.
-----------------------------------------------------------------------
local function truncate(s, n)
    if type(s) ~= 'string' then return s end
    if #s > n then return s:sub(1, n) end
    return s
end

-----------------------------------------------------------------------
-- Internal: map short JSONL keys to API SessionEventEntry field names
-----------------------------------------------------------------------
local function jsonl_to_api_event(raw_line)
    local ok, event = pcall(json_decode_fn, raw_line)
    if not ok or not event then return nil end
    return {
        EventType = event.t,
        Timestamp = event.ts and os.date('!%Y-%m-%dT%H:%M:%SZ', event.ts) or nil,
        Source = truncate(event.s or '', 64),
        Target = truncate(event.tg or '', 128),
        Value = event.v or 0,
        Ability = event.a and truncate(event.a, 128) or nil,
        ItemId = event.item_id,
        Zone = truncate(event.z or '', 64),
    }
end

-----------------------------------------------------------------------
-- Internal: async POST helper. callback(result, status_code, body)
-- where result is true on response received, nil on connection failure.
-- Session endpoints take characterName + server in the body, so no
-- per-character headers are needed beyond the API key.
-----------------------------------------------------------------------
local function api_post_async(endpoint, body_table, callback)
    callback = callback or function() end
    local payload = json_encode_fn(body_table)
    http_request_fn({
        url = settings.ApiUrl .. endpoint,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['X-Api-Key'] = settings.ApiKey,
        },
        body = payload,
        label = 'session-' .. endpoint:gsub('^.*/', ''),
    }, function(result, status_code, _, response_body)
        callback(result, status_code, response_body or '')
    end)
end

-----------------------------------------------------------------------
-- Internal: strip FFXI control characters from chat text.
-- \x07 (BEL) is FFXI's sentence separator — replace with space so
-- multi-sentence patterns like "uses WS. Target takes N damage" match.
-- Individual control bytes are stripped; we avoid stripping "next byte"
-- patterns like \x1E. because FFXI embeds color codes densely throughout
-- text and the 2-byte approach eats actual content.
-----------------------------------------------------------------------
local CHAR_BEL = string.char(7)   -- \x07 — FFXI sentence separator
local CHAR_1E = string.char(0x1E) -- color/control marker

local function sanitize(line)
    -- Replace BEL (sentence separator) with space BEFORE stripping
    line = line:gsub(CHAR_BEL, ' ')
    -- Strip individual non-printable bytes (control chars below 0x20 except space/newline)
    -- Also strip the trailing \x1E\x31 end-of-message marker: \x1E is stripped here,
    -- and the orphaned "1" (0x31) is trimmed at the end.
    local out = {}
    for i = 1, #line do
        local b = line:byte(i)
        if b >= 0x20 or b == 0x0A then
            out[#out + 1] = line:sub(i, i)
        end
    end
    local result = table.concat(out)
    -- Trim trailing "1" left from \x1E\x31 end-of-message marker
    if result:sub(-1) == '1' and result:sub(-2, -2) == '.' then
        result = result:sub(1, -2)
    end
    return result
end

-----------------------------------------------------------------------
-- Internal: parse a number that may contain commas (e.g., "9,888")
-----------------------------------------------------------------------
local function parse_number(s)
    return tonumber(s:gsub(',', ''))
end

-----------------------------------------------------------------------
-- Internal: parse a chat log line into a structured event
-----------------------------------------------------------------------
local function parse_line(line)
    line = sanitize(line)
    local source, target, dmg, ability, hp, who, item, count, amount, element

    -- Critical hit damage: "Player scores a critical hit! Target takes N points of damage."
    -- BEL after "!" becomes space, so there may be leading space on target — trim it.
    source, target, dmg = line:match("(.+) scores a critical hit!%s*(.+) takes (%d+) points of damage%.")
    if source then
        return {t='CriticalHit', s=source, tg=target, v=tonumber(dmg)}
    end

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

    -- HP/MP drain: "Player uses Ability. N HP drained from Target."
    source, ability, hp, target = line:match("(.+) uses (.+)%. (%d+) HP drained from (.+)%.")
    if source then
        return {t='Healing', s=source, tg=target, v=tonumber(hp), a=ability}
    end

    -- Ability used (no damage/healing result): "Player uses Ability."
    -- This must come AFTER the "uses ... takes N damage", "recovers N HP", and "HP drained" patterns
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

    -- Standalone AoE damage: "Target takes N points of damage." (no source — AoE spillover)
    -- Must come AFTER all "Source uses/casts ... Target takes N" patterns.
    target, dmg = line:match("^(.+) takes (%d+) points of damage%.")
    if target then
        return {t='AbilityDamage', s=player_name, tg=target, v=tonumber(dmg)}
    end

    -- Miss (player): "Player misses Target."
    source, target = line:match("(.+) misses (.+)%.")
    if source then
        return {t='Miss', s=source, tg=target, v=0}
    end

    -- Parry: "Player parries Target's attack with his/her weapon."
    source = line:match("(.+) parries .+'s attack")
    if source then
        return {t='Parry', s=source, tg='', v=0}
    end

    -- Gil obtain: "Player obtains N gil." (must come before item patterns)
    -- Handles comma-formatted numbers (e.g., "9,888 gil")
    who, amount = line:match("(.+) obtains ([%d,]+) gil%.")
    if who then
        return {t='GilGain', s=who, tg='', v=parse_number(amount)}
    end

    -- Item obtain (singular): "Player obtains a/an Item."
    who, item = line:match("(.+) obtains an? (.+)%.")
    if who then
        return {t='ItemDrop', s=who, tg=item, v=1}
    end

    -- Item obtain (multiple): "Player obtains N Item."
    who, count, item = line:match("(.+) obtains (%d+) (.+)%.")
    if who then
        return {t='ItemDrop', s=who, tg=item, v=tonumber(count)}
    end

    -- NOTE: "You find a X on Y" (mode 121) is NOT parsed as ItemDrop because
    -- "Player obtains a X" (mode 127) fires for the same item, causing duplicates.
    -- We only capture from the "obtains" pattern above.

    -- Item lost: "You do not meet the requirements to obtain the Item. Item lost."
    -- Fires when inventory can't hold a unique/rare item from the treasure pool.
    item = line:match("You do not meet the requirements to obtain the (.+)%.")
    if item then
        -- Strip trailing "Item lost" suffix if present (BEL-separated in original)
        item = item:match("^(.-)%.?%s*.*lost$") or item
        return {t='ItemLost', s=player_name, tg=item, v=0}
    end

    -- Treasure Hunter: "Additional effect: Treasure Hunter effectiveness against Target increases to N."
    target, amount = line:match("Treasure Hunter effectiveness against (.+) increases to (%d+)%.")
    if target then
        return {t='TreasureHunter', s=player_name, tg=target, v=tonumber(amount)}
    end

    -- Gil loss: "You lose N gil."
    amount = line:match("You lose ([%d,]+) gil%.")
    if amount then
        return {t='GilLoss', s=player_name, tg='', v=parse_number(amount)}
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
    if mode >= 20 and mode <= 44 then return true end   -- Battle messages
    if mode == 101 then return true end                  -- Job abilities (SP, JAs)
    if mode == 110 then return true end                  -- WS readied / system battle
    if mode == 114 then return true end                  -- Ability results (Steal, etc.)
    if mode == 121 then return true end                  -- Treasure pool / item lost
    if mode == 123 then return true end                  -- Gil gains/losses
    if mode == 127 then return true end                  -- Skillchain/MB, item obtain, records
    if mode == 131 then return true end                  -- EXP/LP/CP gains, sparks
    if mode == 150 or mode == 151 then return true end   -- System messages (defeats)
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

    local sessions_dir = windower.addon_path .. 'sessions/'
    windower.create_dir(sessions_dir)

    local date_stamp = os.date('%Y-%m-%d_%H-%M-%S')
    file_path = sessions_dir .. character_name .. '_' .. date_stamp .. '.jsonl'
    file_handle = io.open(file_path, 'a')
    if not file_handle then
        log_error_fn('Failed to create session file: ' .. file_path)
        return
    end

    -- Local state goes active immediately so chat events get captured to the
    -- JSONL file even if the server registration is still in flight.
    active = true
    start_time = os.time()
    event_count = 0
    uploaded_count = 0
    is_flushing = false
    flush_backoff_until = 0
    flush_fail_count = 0
    flush_waiters = {}

    if debug_mode then
        local debug_path = sessions_dir .. character_name .. '_' .. date_stamp .. '_debug.log'
        debug_handle = io.open(debug_path, 'a')
    end

    log_success_fn('Session started for ' .. character_name .. ' @ ' .. server .. ' (' .. zone .. ')' .. (debug_mode and ' [DEBUG]' or ''))

    -- Register with the API in the background. Failure doesn't prevent local
    -- recording; we just won't have a server-side session_id to attach to
    -- future events (currently unused but reserved for future correlation).
    api_post_async('/api/session/start', {
        characterName = character_name,
        server = server,
        zone = zone,
    }, function(result, status_code, response_body)
        if result and status_code == 200 then
            local sid = response_body:match('"sessionId"%s*:%s*"([^"]+)"')
            if not sid then
                sid = response_body:match('"sessionId"%s*:%s*(%d+)')
            end
            session_id = sid
        else
            log_fn('Warning: Could not register session with API (status: ' .. tostring(status_code) .. '). Recording locally.')
        end
    end)
end

function session.stop()
    if not active then
        log_error_fn('No active session to stop.')
        return
    end

    -- Capture state BEFORE resetting locals so the async stop POST gets the
    -- correct values even if other code mutates module state between now
    -- and when the request actually fires.
    local stop_character = player_name
    local stop_server = server_name
    local start_t = start_time
    local final_count = event_count

    -- Flush remaining events first; the stop POST and cleanup happen in the
    -- flush callback so we don't tear down state with pending uploads still
    -- in flight.
    session.flush(function()
        if file_handle then file_handle:close(); file_handle = nil end
        if debug_handle then debug_handle:close(); debug_handle = nil end

        api_post_async('/api/session/stop', {
            characterName = stop_character,
            server = stop_server,
        }, function(_, _, _) end)

        local duration = os.time() - start_t
        local minutes = math.floor(duration / 60)
        local seconds = math.floor(duration % 60)

        active = false
        session_id = nil
        file_path = nil
        event_count = 0
        uploaded_count = 0
        start_time = nil
        player_name = nil
        server_name = nil
        is_flushing = false
        flush_backoff_until = 0
        flush_fail_count = 0
        flush_waiters = {}

        log_success_fn('Session stopped. ' .. final_count .. ' events recorded over ' .. minutes .. 'm ' .. seconds .. 's.')
    end)
end

function session.flush(on_complete)
    on_complete = on_complete or function() end

    if not active or event_count <= uploaded_count then
        on_complete()
        return
    end

    -- Re-entrancy guard: check_auto_flush runs every prerender frame, so a
    -- flush that's still awaiting its HTTP response must not spawn another.
    -- A direct caller (stop / manual flush) that races an in-flight flush is
    -- queued and run when it finishes, rather than dropped.
    if is_flushing then
        table.insert(flush_waiters, on_complete)
        return
    end

    -- Read the JSONL file from uploaded_count line to current end
    local read_handle = io.open(file_path, 'r')
    if not read_handle then
        log_error_fn('Failed to open session file for reading.')
        on_complete()
        return
    end

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
        on_complete()
        return
    end

    local api_events = {}
    for _, raw_line in ipairs(pending_lines) do
        local event = jsonl_to_api_event(raw_line)
        if event then
            table.insert(api_events, event)
        end
    end

    if #api_events == 0 then
        on_complete()
        return
    end

    -- Upload batches sequentially via callback chain — never parallel, so
    -- the server sees events in order and we can report partial-success
    -- accurately if a batch midway through fails.
    local batch_size = 500
    local total_uploaded = 0

    is_flushing = true
    local function finish()
        is_flushing = false
        on_complete()
        -- Run any flush requests that arrived mid-flight (e.g. a racing stop).
        if #flush_waiters > 0 then
            local waiter = table.remove(flush_waiters, 1)
            session.flush(waiter)
        end
    end

    local function upload_batch(batch_start)
        if batch_start > #api_events then
            if total_uploaded > 0 then
                log_fn('Flushed ' .. total_uploaded .. ' events to API (' .. uploaded_count .. '/' .. event_count .. ' total).')
            end
            -- Full success: clear any prior failure backoff.
            flush_fail_count = 0
            flush_backoff_until = 0
            finish()
            return
        end

        local batch_end = math.min(batch_start + batch_size - 1, #api_events)
        local batch = {}
        for i = batch_start, batch_end do
            table.insert(batch, api_events[i])
        end

        api_post_async('/api/session/events', {
            characterName = player_name,
            server = server_name,
            events = batch,
        }, function(result, status_code, _)
            if result and status_code == 200 then
                total_uploaded = total_uploaded + #batch
                uploaded_count = uploaded_count + #batch
                upload_batch(batch_end + 1)
            else
                log_error_fn('Flush failed at batch starting line ' .. (uploaded_count + batch_start) ..
                    ' (status: ' .. tostring(status_code) .. ')')
                if total_uploaded > 0 then
                    log_fn('Flushed ' .. total_uploaded .. ' events to API (' .. uploaded_count .. '/' .. event_count .. ' total).')
                end
                -- Back off the auto-flush path so we don't retry (and re-spam
                -- this error) every frame. Exponential 30s → 300s cap.
                flush_fail_count = flush_fail_count + 1
                local backoff = math.min(300, 30 * (2 ^ (flush_fail_count - 1)))
                flush_backoff_until = os.time() + backoff
                finish()
            end
        end)
    end

    upload_batch(1)
end

function session.on_text(original, modified, original_mode, modified_mode, blocked)
    if not active then return end

    -- Filter by original_mode — only process battle-relevant modes
    if not is_relevant_mode(original_mode) then
        -- In debug mode, log all chat modes we're filtering out
        if debug_mode and debug_handle then
            debug_handle:write('[FILTERED mode=' .. tostring(original_mode) .. '] ' .. sanitize(original) .. '\n')
            debug_handle:flush()
        end
        return
    end

    -- Parse the line
    local event = parse_line(original)
    if not event then
        -- In debug mode, log lines that passed the mode filter but didn't match any pattern
        if debug_mode and debug_handle then
            debug_handle:write('[UNMATCHED mode=' .. tostring(original_mode) .. '] ' .. sanitize(original) .. '\n')
            debug_handle:flush()
        end
        return
    end

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
    if not active then return end
    if is_flushing then return end
    -- Respect failure backoff so a persistent error doesn't retry per-frame.
    if os.time() < flush_backoff_until then return end
    if (event_count - uploaded_count) > 5000 then
        session.flush()
    end
end

function session.is_active()
    return active
end

function session.toggle_debug()
    debug_mode = not debug_mode
    return debug_mode
end

function session.print_status()
    if not active then
        log_fn('Session: inactive')
        return
    end

    local duration = os.time() - start_time
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
    local entries = windower.get_dir(sessions_dir)
    if not entries then return end

    local deleted = 0
    for _, filename in ipairs(entries) do
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

    if deleted > 0 then
        log_fn('Cleaned up ' .. deleted .. ' session file(s) older than 7 days.')
    end
end

-----------------------------------------------------------------------
-- Recover: re-upload local session files whose live upload failed (e.g.
-- the flush-400 bug). Reads each of THIS character's un-uploaded .jsonl
-- files and POSTs it to /api/session/import, which creates a completed
-- session dated from the events. Successfully-imported files are renamed
-- to *.uploaded so a re-run won't duplicate them.
-----------------------------------------------------------------------
function session.recover(character_name, server)
    if active then
        log_error_fn('Stop the active session before recovering.')
        return
    end

    local sessions_dir = windower.addon_path .. 'sessions/'
    local entries = windower.get_dir(sessions_dir)
    if not entries then
        log_fn('No sessions folder found.')
        return
    end

    -- Only this character's raw session files: end in .jsonl (excludes the
    -- already-renamed *.jsonl.uploaded and *_debug.log) and match the
    -- "<name>_" filename prefix so we never import another character's run.
    local prefix = character_name .. '_'
    local files = {}
    for _, filename in ipairs(entries) do
        if filename:sub(-6) == '.jsonl' and filename:sub(1, #prefix) == prefix then
            table.insert(files, filename)
        end
    end

    if #files == 0 then
        log_fn('No session files to recover for ' .. character_name .. '.')
        return
    end

    log_fn('Recovering ' .. #files .. ' session file(s) for ' .. character_name .. '...')

    -- Process one file at a time via a callback chain (never parallel) so we
    -- stay within the API rate limit and report per-file results in order.
    local recovered = 0
    local function process(idx)
        if idx > #files then
            log_success_fn('Recovery complete. ' .. recovered .. '/' .. #files .. ' file(s) uploaded.')
            return
        end

        local filename = files[idx]
        local full_path = sessions_dir .. filename

        local read_handle = io.open(full_path, 'r')
        if not read_handle then
            log_error_fn(filename .. ': could not read, skipping.')
            process(idx + 1)
            return
        end

        local events = {}
        local zone = ''
        for line in read_handle:lines() do
            local event = jsonl_to_api_event(line)
            if event then
                table.insert(events, event)
                if zone == '' and event.Zone and event.Zone ~= '' then
                    zone = event.Zone
                end
            end
        end
        read_handle:close()

        if #events == 0 then
            log_fn(filename .. ': no events, skipping.')
            process(idx + 1)
            return
        end

        api_post_async('/api/session/import', {
            characterName = character_name,
            server = server,
            zone = zone,
            events = events,
        }, function(result, status_code, _)
            if result and status_code == 200 then
                recovered = recovered + 1
                if os.rename(full_path, full_path .. '.uploaded') then
                    log_fn(filename .. ': uploaded ' .. #events .. ' events.')
                else
                    log_fn(filename .. ': uploaded ' .. #events .. ' events (could not rename file).')
                end
            else
                log_error_fn(filename .. ': import failed (status: ' .. tostring(status_code) .. ').')
            end
            process(idx + 1)
        end)
    end

    process(1)
end

return session
