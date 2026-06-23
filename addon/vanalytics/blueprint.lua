-- //va blueprint pull: fetch the generated GearSwap .lua for a job and install it into
-- GearSwap/data/<Char>/<JOB>.lua, with overwrite-safety (+ .bak backup) and a conditional reload.
-- Mirrors macros.lua's structure. All HTTP goes through the async_http helper passed in (never
-- ssl.https/ltn12). All file ops use io.open / windower.create_dir (never os.execute/io.popen).

local blueprint = {}

-- Absolute path to GearSwap's data folder for a character: <Windower4>/addons/GearSwap/data/<Char>.
-- windower.windower_path is the Windower4 root (ends with a path separator).
function blueprint.gearswap_char_dir(char_name)
    return windower.windower_path .. 'addons\\GearSwap\\data\\' .. char_name
end

-- True if GearSwap appears installed (its addon folder exists). Uses windower.dir_exists when present,
-- else falls back to listing the parent via windower.get_dir.
function blueprint.gearswap_installed()
    local gs_dir = windower.windower_path .. 'addons\\GearSwap'
    if windower.dir_exists then return windower.dir_exists(gs_dir) end
    local entries = windower.get_dir(windower.windower_path .. 'addons')
    if not entries then return false end
    for _, name in ipairs(entries) do
        if name == 'GearSwap' then return true end
    end
    return false
end

-- Read a file's full contents (text), or nil if it can't be opened.
local function read_file(path)
    local f = io.open(path, 'r')
    if not f then return nil end
    local data = f:read('*a')
    f:close()
    return data
end

-- Write text to a file. Returns true on success.
local function write_file(path, text)
    local f = io.open(path, 'w')
    if not f then return false end
    f:write(text)
    f:close()
    return true
end

-- True if a file exists at path.
function blueprint.file_exists(path)
    local f = io.open(path, 'r')
    if f then f:close(); return true end
    return false
end

-- Parse args into (job, force). job is the first non-flag token (uppercased) or nil; force is true if
-- any token is '--force'. Falls back to current_job when no explicit job token is given.
function blueprint.parse_args(args, current_job)
    local job, force = nil, false
    for _, a in ipairs(args) do
        local la = a:lower()
        if la == '--force' then
            force = true
        elseif not job then
            job = a:upper()
        end
    end
    if not job then job = current_job end
    return job, force
end

-- Orchestrate a pull. Dependencies are injected so this mirrors macros.pull's call shape:
--   opts = { api_url, headers, http_fn, json_decode, char_name, job, current_job, force,
--            log, log_error, log_success }
-- log/log_error/log_success each take a single string and print to the in-game chat.
function blueprint.pull(opts)
    if not blueprint.gearswap_installed() then
        opts.log_error('GearSwap not found — is it installed?')
        return
    end

    local job = opts.job
    local char_dir = blueprint.gearswap_char_dir(opts.char_name)
    local target = char_dir .. '\\' .. job .. '.lua'

    opts.http_fn({
        url = opts.api_url .. '/api/sync/blueprint?job=' .. job,
        method = 'GET',
        headers = opts.headers,
        label = 'blueprint-pull',
    }, function(result, status_code, _, body)
        if status_code == 404 then
            opts.log_error('No ' .. job .. ' blueprint found — build one at vanalytics.soverance.com')
            return
        end
        if not result or status_code ~= 200 then
            opts.log_error('Error pulling blueprint: HTTP ' .. tostring(status_code))
            return
        end

        local data = body and #body > 0 and opts.json_decode(body) or nil
        if not data then
            opts.log_error('Error: empty response from server.')
            return
        end
        local lua = data.lua or ''
        if lua == '' then
            opts.log_error("Couldn't generate " .. job .. '.lua — fix it in the editor: vanalytics.soverance.com')
            return
        end

        -- Overwrite safety: never clobber an existing file without --force; back it up to .bak first.
        if blueprint.file_exists(target) and not opts.force then
            opts.log_error(job .. '.lua already exists — re-run with --force (your file is backed up to '
                .. job .. '.lua.bak)')
            return
        end

        windower.create_dir(char_dir)  -- no-op if it already exists

        if blueprint.file_exists(target) then
            local existing = read_file(target)
            if existing then write_file(target .. '.bak', existing) end
        end

        if not write_file(target, lua) then
            opts.log_error('Error: could not write ' .. target)
            return
        end

        -- Count warnings (diagnostics with severity "warning") for a terse success suffix.
        local warnings = 0
        if data.diagnostics then
            for _, d in ipairs(data.diagnostics) do
                if d.severity == 'warning' then warnings = warnings + 1 end
            end
        end
        local suffix = warnings > 0 and (' — ' .. warnings .. ' warning(s), see editor') or ''

        if job == opts.current_job then
            windower.send_command('gs reload')
            opts.log_success(job .. '.lua installed and reloaded.' .. suffix)
        else
            opts.log_success(job .. '.lua installed — switch to ' .. job .. ' or //gs reload when on it.'
                .. suffix)
        end
    end)
end

return blueprint
