-- addon/vanalytics/async_http.lua
-- Non-blocking HTTP/HTTPS client for the Vanalytics addon.
--
-- Each request runs in a Lua coroutine that yields whenever the underlying
-- socket would block. async_http.poll() — called once per frame from the
-- addon's prerender hook — resumes all in-flight coroutines, advancing them
-- by however many bytes the socket has available right now. The game thread
-- is never blocked by network I/O.
--
-- Intentional limitations (simplicity over completeness):
--   * HTTP/1.1 only, Connection: close on every request, no keep-alive
--   * Accept-Encoding: identity sent on every request (no gzip/brotli decode)
--   * No TLS certificate verification (matches the addon's prior behavior)
--   * No redirect following, no automatic retries
--   * 30-second per-request deadline; on expiry the callback fires with err='timeout'

local socket = require('socket')
local ssl    = require('ssl')

local M = {}

local active = {}
local DEFAULT_TIMEOUT = 30

local TLS_DEFAULTS = {
    mode = 'client',
    protocol = 'any',
    verify = 'none',
    options = { 'all' },
}

-----------------------------------------------------------------------
-- URL parsing
-----------------------------------------------------------------------
local function parse_url(url)
    local scheme, host, port, path = url:match('^(https?)://([^:/]+):(%d+)(/.*)$')
    if not scheme then
        scheme, host, path = url:match('^(https?)://([^/]+)(/.*)$')
    end
    if not scheme then
        scheme, host = url:match('^(https?)://([^/]+)$')
        path = '/'
    end
    if not scheme then return nil end
    if not path or path == '' then path = '/' end
    port = port and tonumber(port) or (scheme == 'https' and 443 or 80)
    return { scheme = scheme, host = host, port = port, path = path }
end

-----------------------------------------------------------------------
-- Build raw HTTP/1.1 request bytes
-----------------------------------------------------------------------
local function build_request(method, url_parts, headers, body)
    local lines = {}
    table.insert(lines, method .. ' ' .. url_parts.path .. ' HTTP/1.1')
    table.insert(lines, 'Host: ' .. url_parts.host)
    table.insert(lines, 'Connection: close')
    table.insert(lines, 'Accept-Encoding: identity')
    table.insert(lines, 'User-Agent: Vanalytics-Addon/1.0')
    if body and #body > 0 then
        table.insert(lines, 'Content-Length: ' .. tostring(#body))
    end
    if headers then
        for k, v in pairs(headers) do
            local low = k:lower()
            if low ~= 'host' and low ~= 'connection' and
               low ~= 'accept-encoding' and low ~= 'content-length' and
               low ~= 'user-agent' then
                table.insert(lines, k .. ': ' .. v)
            end
        end
    end
    table.insert(lines, '')
    table.insert(lines, body or '')
    return table.concat(lines, '\r\n')
end

-----------------------------------------------------------------------
-- Parse response status line + headers from a buffer containing at least
-- one CRLFCRLF. Returns: status_code, headers_table, body_start_index.
-----------------------------------------------------------------------
local function parse_response_head(buf)
    local header_end = buf:find('\r\n\r\n', 1, true)
    if not header_end then return nil end
    local head = buf:sub(1, header_end - 1)
    local body_start = header_end + 4

    local status_code = tonumber(head:match('^HTTP/1%.[01]%s+(%d+)'))
    if not status_code then return nil end

    local headers = {}
    for line in head:gmatch('[^\r\n]+') do
        local k, v = line:match('^([^:]+):%s*(.*)$')
        if k and v then headers[k:lower()] = v end
    end

    return status_code, headers, body_start
end

-----------------------------------------------------------------------
-- Decode HTTP/1.1 chunked transfer encoding. Returns nil if the buffer
-- doesn't yet contain a complete chunked body (terminator chunk missing).
-----------------------------------------------------------------------
local function dechunk(s)
    local out = {}
    local i = 1
    while i <= #s do
        local line_end = s:find('\r\n', i, true)
        if not line_end then return nil end
        local size_hex = s:sub(i, line_end - 1):match('^(%x+)')
        if not size_hex then return nil end
        local size = tonumber(size_hex, 16)
        i = line_end + 2
        if size == 0 then return table.concat(out) end
        if i + size - 1 > #s then return nil end
        table.insert(out, s:sub(i, i + size - 1))
        i = i + size + 2
    end
    return nil
end

-----------------------------------------------------------------------
-- Drive one request through connect / handshake / send / receive. Runs
-- inside a coroutine; yields whenever the socket would block.
-- Returns: ok, status_or_error, headers, body
-----------------------------------------------------------------------
local function run_request(params)
    local url = parse_url(params.url)
    if not url then return false, 'invalid-url' end

    local tcp, terr = socket.tcp()
    if not tcp then return false, 'socket:' .. tostring(terr) end
    tcp:settimeout(0)

    -- Non-blocking connect. The first call returns immediately with either
    -- success, 'timeout' (in progress), or a fatal error. We then yield and
    -- poll writeability until the connect resolves.
    local _, connect_err = tcp:connect(url.host, url.port)
    local function in_progress(e)
        return e == 'timeout' or e == 'Operation already in progress'
    end
    if connect_err and not in_progress(connect_err) then
        tcp:close()
        return false, 'connect:' .. tostring(connect_err)
    end
    while in_progress(connect_err) do
        coroutine.yield()
        local _, w = socket.select(nil, { tcp }, 0)
        if w and w[1] then
            local _, e2 = tcp:connect(url.host, url.port)
            if not e2 or e2 == 'already connected' then
                connect_err = nil
            elseif not in_progress(e2) then
                tcp:close()
                return false, 'connect:' .. tostring(e2)
            end
        end
    end

    -- TLS wrap (https only)
    local conn = tcp
    if url.scheme == 'https' then
        local wrapped, werr = ssl.wrap(tcp, TLS_DEFAULTS)
        if not wrapped then
            tcp:close()
            return false, 'sslwrap:' .. tostring(werr)
        end
        if wrapped.sni then wrapped:sni(url.host) end
        wrapped:settimeout(0)

        while true do
            local ok, herr = wrapped:dohandshake()
            if ok then break end
            if herr == 'wantread' or herr == 'wantwrite' or herr == 'timeout' then
                coroutine.yield()
            else
                wrapped:close()
                return false, 'handshake:' .. tostring(herr)
            end
        end
        conn = wrapped
    end

    -- Send request
    local request_bytes = build_request(params.method or 'GET', url, params.headers, params.body)
    local sent = 0
    while sent < #request_bytes do
        local s, serr, last = conn:send(request_bytes, sent + 1)
        if s then
            sent = s
        elseif serr == 'wantread' or serr == 'wantwrite' or serr == 'timeout' then
            sent = last or sent
            coroutine.yield()
        else
            conn:close()
            return false, 'send:' .. tostring(serr)
        end
    end

    -- Phase A: receive until we have full headers
    local buf = {}
    local status_code, headers, body_start
    while not status_code do
        local chunk, rerr, partial = conn:receive(4096)
        local data = chunk or partial
        if data and #data > 0 then
            table.insert(buf, data)
            local joined = table.concat(buf)
            local sc, h, bs = parse_response_head(joined)
            if sc then
                status_code = sc
                headers = h
                body_start = bs
                buf = { joined:sub(bs) }
            end
        end
        if status_code then break end
        if chunk then
            -- got data but headers not yet complete; loop
        elseif rerr == 'closed' then
            conn:close()
            return false, 'recv:headers:closed-prematurely'
        elseif rerr == 'wantread' or rerr == 'wantwrite' or rerr == 'timeout' then
            coroutine.yield()
        else
            conn:close()
            return false, 'recv:headers:' .. tostring(rerr)
        end
    end

    -- Phase B: receive body using Content-Length or chunked encoding
    local content_length = tonumber(headers['content-length'])
    local te = headers['transfer-encoding']
    local is_chunked = te and te:lower():find('chunked', 1, true)
    local body

    if content_length then
        local have = #(buf[1] or '')
        while have < content_length do
            local chunk, rerr, partial = conn:receive(content_length - have)
            local data = chunk or partial
            if data and #data > 0 then
                table.insert(buf, data)
                have = have + #data
            end
            if chunk then
                -- got full requested amount; loop will exit if satisfied
            elseif rerr == 'closed' then
                break
            elseif rerr == 'wantread' or rerr == 'wantwrite' or rerr == 'timeout' then
                coroutine.yield()
            else
                conn:close()
                return false, 'recv:body:' .. tostring(rerr)
            end
        end
        body = table.concat(buf):sub(1, content_length)
    elseif is_chunked then
        while true do
            local decoded = dechunk(table.concat(buf))
            if decoded then body = decoded break end
            local chunk, rerr, partial = conn:receive(4096)
            local data = chunk or partial
            if data and #data > 0 then
                table.insert(buf, data)
            end
            if chunk then
                -- continue; will try to dechunk on next loop top
            elseif rerr == 'closed' then
                body = dechunk(table.concat(buf)) or table.concat(buf)
                break
            elseif rerr == 'wantread' or rerr == 'wantwrite' or rerr == 'timeout' then
                coroutine.yield()
            else
                conn:close()
                return false, 'recv:body-chunked:' .. tostring(rerr)
            end
        end
    else
        -- No framing: read until close
        while true do
            local chunk, rerr, partial = conn:receive(4096)
            local data = chunk or partial
            if data and #data > 0 then
                table.insert(buf, data)
            end
            if chunk then
                -- continue
            elseif rerr == 'closed' then
                break
            elseif rerr == 'wantread' or rerr == 'wantwrite' or rerr == 'timeout' then
                coroutine.yield()
            else
                conn:close()
                return false, 'recv:body:' .. tostring(rerr)
            end
        end
        body = table.concat(buf)
    end

    conn:close()
    return true, status_code, headers, body
end

-----------------------------------------------------------------------
-- Public API
-----------------------------------------------------------------------

-- Fire an HTTP request. The callback runs when the request finishes (or
-- the deadline expires). Signature:
--   callback(ok, status_or_err, headers, body)
-- where ok is true on HTTP response received, nil on connection failure
-- (status_or_err is a labeled error string in that case).
function M.request(params, callback)
    local timeout = params.timeout or DEFAULT_TIMEOUT
    local label = params.label or ((params.method or 'GET') .. ' ' .. (params.url or ''))

    -- Create the entry first so the coroutine can flip fired_callback BEFORE
    -- it invokes the callback. Without that flag set, a callback that throws
    -- would be re-invoked by poll()'s coroutine-error path (which only guards
    -- on fired_callback) — firing the same callback twice and forking the
    -- sync chain (a second on_complete → duplicate step advance).
    local entry = {
        callback = callback,
        deadline = os.time() + timeout,
        label = label,
        fired_callback = false,
    }

    entry.co = coroutine.create(function()
        local ok, status, headers, body = run_request(params)
        if entry.fired_callback then return end
        entry.fired_callback = true
        if ok then
            callback(true, status, headers, body)
        else
            callback(nil, status)
        end
    end)

    table.insert(active, entry)
end

-- Pump all in-flight coroutines once. Call from the addon's prerender hook.
function M.poll()
    if #active == 0 then return end

    local now = os.time()
    local i = 1
    while i <= #active do
        local r = active[i]

        if coroutine.status(r.co) == 'dead' then
            table.remove(active, i)
        elseif now > r.deadline then
            table.remove(active, i)
            if not r.fired_callback then
                r.fired_callback = true
                local ok, err = pcall(r.callback, nil, 'timeout:' .. r.label)
                if not ok then
                    windower.add_to_chat(8, '[async_http] callback err: ' .. tostring(err))
                end
            end
        else
            local ok, err = coroutine.resume(r.co)
            if not ok then
                table.remove(active, i)
                if not r.fired_callback then
                    r.fired_callback = true
                    local cok, cerr = pcall(r.callback, nil, 'coroutine-error:' .. tostring(err))
                    if not cok then
                        windower.add_to_chat(8, '[async_http] callback err: ' .. tostring(cerr))
                    end
                end
            elseif coroutine.status(r.co) == 'dead' then
                table.remove(active, i)
            else
                i = i + 1
            end
        end
    end
end

-- For status displays / debugging
function M.active_count()
    return #active
end

-- Drop all in-flight requests and discard their callbacks. Used on logout
-- and unload so coroutines holding sockets/closures don't outlive the addon
-- session and try to fire callbacks against torn-down state.
function M.cancel_all()
    -- Mark each entry so any callback that somehow fires is a no-op, then
    -- clear the table. The coroutines and their sockets become unreachable
    -- and Lua's GC closes the sockets via their __gc metamethod.
    for _, r in ipairs(active) do
        r.fired_callback = true
        r.callback = function() end
    end
    active = {}
end

return M
