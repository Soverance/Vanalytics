-- addon-ashita/vanalytics/async_http_winhttp.lua
-- HTTP/HTTPS client for the Vanalytics addon, backed by Windows' WinHTTP via
-- LuaJIT FFI. Used when luasocket/luasec are not available (the common case on
-- Ashita v4). Windows handles all TLS, so HTTPS "just works" with no bundled
-- OpenSSL/LuaSec.
--
-- It exposes the SAME public API as async_http_socket.lua so every caller (and
-- the addon's http_request wrapper) is unchanged:
--   async_http.request(params, callback)   -- params: {url, method, headers, body, label, timeout}
--   async_http.poll()                       -- call once per frame (from d3d_present)
--   async_http.cancel_all()
--   async_http.active_count()
--
-- callback contract (identical to the socket transport):
--   callback(true,  status_code, headers_table, body_string)   -- HTTP response received
--   callback(nil,   error_string)                              -- connection/transport failure
--
-- TRANSPORT MODEL / TRADEOFF (see PORTING.md):
--   WinHTTP's request calls are synchronous, and calling Lua from WinHTTP's own
--   async worker threads is unsafe under LuaJIT. To stay safe we resolve at most
--   ONE queued request per poll() (i.e. per frame), running it to completion
--   with bounded WinHTTP timeouts. The addon issues sync sub-requests serially
--   (each on_complete triggers the next), so normally only one is in flight.
--   The brief per-request stall replaces the socket transport's fully-incremental
--   yielding. If a bundled luasocket+luasec is added later, async_http.lua will
--   prefer the non-blocking socket transport automatically.
--
-- Certificate handling mirrors the socket transport's verify='none': WinHTTP is
-- told to ignore cert-trust/name/date errors, so self-signed or private-CA
-- Vanalytics endpoints work the same way they did under LuaSec.

local ffi = require('ffi')

local M = {}

-----------------------------------------------------------------------
-- FFI declarations (declared once; guarded so a second load is harmless)
-----------------------------------------------------------------------
local ok_cdef = pcall(ffi.cdef, [[
    typedef void*          HINTERNET;
    typedef int            BOOL;
    typedef unsigned long  DWORD;
    typedef unsigned short WORD;

    HINTERNET WinHttpOpen(const uint16_t*, DWORD, const uint16_t*, const uint16_t*, DWORD);
    HINTERNET WinHttpConnect(HINTERNET, const uint16_t*, WORD, DWORD);
    HINTERNET WinHttpOpenRequest(HINTERNET, const uint16_t*, const uint16_t*, const uint16_t*, const uint16_t*, const uint16_t**, DWORD);
    BOOL      WinHttpSetOption(HINTERNET, DWORD, void*, DWORD);
    BOOL      WinHttpSetTimeouts(HINTERNET, int, int, int, int);
    BOOL      WinHttpAddRequestHeaders(HINTERNET, const uint16_t*, DWORD, DWORD);
    BOOL      WinHttpSendRequest(HINTERNET, const uint16_t*, DWORD, void*, DWORD, DWORD, uintptr_t);
    BOOL      WinHttpReceiveResponse(HINTERNET, void*);
    BOOL      WinHttpQueryHeaders(HINTERNET, DWORD, const uint16_t*, void*, DWORD*, DWORD*);
    BOOL      WinHttpQueryDataAvailable(HINTERNET, DWORD*);
    BOOL      WinHttpReadData(HINTERNET, void*, DWORD, DWORD*);
    BOOL      WinHttpCloseHandle(HINTERNET);

    DWORD     GetLastError(void);
    int       MultiByteToWideChar(unsigned int, DWORD, const char*, int, uint16_t*, int);
]])
-- ok_cdef may be false if these types were already defined by a prior load;
-- that's fine — the symbols remain usable.

-- WinHTTP constants
local WINHTTP_ACCESS_TYPE_DEFAULT_PROXY = 0
local WINHTTP_FLAG_SECURE                = 0x00800000
local WINHTTP_ADDREQ_FLAG_ADD            = 0x20000000
local WINHTTP_ADDREQ_FLAG_REPLACE        = 0x80000000
local WINHTTP_QUERY_STATUS_CODE          = 19
local WINHTTP_QUERY_RAW_HEADERS_CRLF     = 22
local WINHTTP_QUERY_FLAG_NUMBER          = 0x20000000
local WINHTTP_OPTION_SECURITY_FLAGS      = 31
local SECURITY_FLAG_IGNORE_UNKNOWN_CA       = 0x00000100
local SECURITY_FLAG_IGNORE_CERT_DATE_INVALID = 0x00002000
local SECURITY_FLAG_IGNORE_CERT_CN_INVALID   = 0x00001000
local SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE  = 0x00000200
local CP_UTF8 = 65001

-- Load winhttp.dll lazily; if unavailable the whole transport degrades to a
-- clean error via the request callback rather than crashing at load time.
local winhttp = nil
local winhttp_failed = false
local function get_winhttp()
    if winhttp or winhttp_failed then return winhttp end
    local ok, lib = pcall(ffi.load, 'winhttp')
    if ok then winhttp = lib else winhttp_failed = true end
    return winhttp
end

-----------------------------------------------------------------------
-- String helpers
-----------------------------------------------------------------------
-- Convert a (UTF-8) Lua string to a null-terminated UTF-16LE buffer.
local function to_wide(s)
    s = s or ''
    local n = ffi.C.MultiByteToWideChar(CP_UTF8, 0, s, #s, nil, 0)
    local buf = ffi.new('uint16_t[?]', n + 1)
    if n > 0 then
        ffi.C.MultiByteToWideChar(CP_UTF8, 0, s, #s, buf, n)
    end
    buf[n] = 0
    return buf
end

-- Convert a WinHTTP wide buffer (ASCII headers) to a Lua string (low bytes).
local function wide_ascii(buf, wchar_count)
    local out = {}
    for i = 0, wchar_count - 1 do
        local c = buf[i]
        if c == 0 then break end
        out[#out + 1] = string.char(c % 256)
    end
    return table.concat(out)
end

-----------------------------------------------------------------------
-- URL parsing (mirrors async_http_socket.lua's parse_url)
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

-- Build the "K: V\r\nK2: V2\r\n" request-header block. Content-Type / X-Api-Key
-- etc. come through here unchanged, preserving the exact web contract.
local function build_header_block(headers)
    if not headers then return nil end
    local lines = {}
    for k, v in pairs(headers) do
        lines[#lines + 1] = tostring(k) .. ': ' .. tostring(v)
    end
    if #lines == 0 then return nil end
    return table.concat(lines, '\r\n')
end

-- Parse a raw CRLF header block into a lowercased { name = value } table,
-- skipping the HTTP status line. Matches what the socket transport passed as
-- the callback's 3rd argument.
local function parse_headers(raw)
    local headers = {}
    if type(raw) ~= 'string' then return headers end
    local first = true
    for line in raw:gmatch('[^\r\n]+') do
        if first then
            first = false -- status line
        else
            local k, v = line:match('^([^:]+):%s*(.*)$')
            if k and v then headers[k:lower()] = v end
        end
    end
    return headers
end

-----------------------------------------------------------------------
-- Perform one request synchronously. Returns:
--   true, status_code, headers_table, body_string   -- on HTTP response
--   false, error_string                             -- on transport failure
-----------------------------------------------------------------------
local function winhttp_do(params, timeout_ms)
    local lib = get_winhttp()
    if not lib then return false, 'winhttp:dll-unavailable' end

    local url = parse_url(params.url)
    if not url then return false, 'invalid-url' end

    local function fail(step, ...)
        for i = 1, select('#', ...) do
            local h = select(i, ...)
            if h ~= nil and h ~= ffi.NULL then lib.WinHttpCloseHandle(h) end
        end
        return false, 'winhttp:' .. step .. ':' .. tonumber(ffi.C.GetLastError())
    end

    local session = lib.WinHttpOpen(to_wide('Vanalytics-Addon/1.0'),
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nil, nil, 0)
    if session == nil or session == ffi.NULL then return fail('open') end

    lib.WinHttpSetTimeouts(session, timeout_ms, timeout_ms, timeout_ms, timeout_ms)

    local conn = lib.WinHttpConnect(session, to_wide(url.host), url.port, 0)
    if conn == nil or conn == ffi.NULL then return fail('connect', session) end

    local req_flags = 0
    if url.scheme == 'https' then req_flags = WINHTTP_FLAG_SECURE end
    local request = lib.WinHttpOpenRequest(conn, to_wide(params.method or 'GET'),
        to_wide(url.path), nil, nil, nil, req_flags)
    if request == nil or request == ffi.NULL then return fail('openrequest', conn, session) end

    -- verify='none' equivalent: ignore all cert-trust errors.
    if url.scheme == 'https' then
        local sec = ffi.new('DWORD[1]',
            SECURITY_FLAG_IGNORE_UNKNOWN_CA +
            SECURITY_FLAG_IGNORE_CERT_DATE_INVALID +
            SECURITY_FLAG_IGNORE_CERT_CN_INVALID +
            SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE)
        lib.WinHttpSetOption(request, WINHTTP_OPTION_SECURITY_FLAGS, sec, ffi.sizeof('DWORD'))
    end

    local header_block = build_header_block(params.headers)
    if header_block then
        lib.WinHttpAddRequestHeaders(request, to_wide(header_block), 0xFFFFFFFF,
            WINHTTP_ADDREQ_FLAG_ADD + WINHTTP_ADDREQ_FLAG_REPLACE)
    end

    -- Body (kept as raw UTF-8 bytes; never widened).
    local body = params.body
    local body_ptr, body_len = nil, 0
    local body_buf -- keep a reference alive for the duration of the call
    if type(body) == 'string' and #body > 0 then
        body_len = #body
        body_buf = ffi.new('char[?]', body_len)
        ffi.copy(body_buf, body, body_len)
        body_ptr = body_buf
    end

    if lib.WinHttpSendRequest(request, nil, 0, body_ptr, body_len, body_len, 0) == 0 then
        return fail('send', request, conn, session)
    end
    if lib.WinHttpReceiveResponse(request, nil) == 0 then
        return fail('receive', request, conn, session)
    end

    -- Status code (numeric)
    local dwCode = ffi.new('DWORD[1]', 0)
    local dwCodeSize = ffi.new('DWORD[1]', ffi.sizeof('DWORD'))
    lib.WinHttpQueryHeaders(request,
        WINHTTP_QUERY_STATUS_CODE + WINHTTP_QUERY_FLAG_NUMBER,
        nil, dwCode, dwCodeSize, nil)
    local status_code = tonumber(dwCode[0])

    -- Raw response headers (first call sizes the buffer in bytes).
    local headers = {}
    local dwLen = ffi.new('DWORD[1]', 0)
    lib.WinHttpQueryHeaders(request, WINHTTP_QUERY_RAW_HEADERS_CRLF, nil, nil, dwLen, nil)
    if dwLen[0] > 0 then
        local wchars = math.floor(dwLen[0] / 2) + 1
        local hbuf = ffi.new('uint16_t[?]', wchars)
        if lib.WinHttpQueryHeaders(request, WINHTTP_QUERY_RAW_HEADERS_CRLF, nil, hbuf, dwLen, nil) ~= 0 then
            headers = parse_headers(wide_ascii(hbuf, wchars))
        end
    end

    -- Body
    local chunks = {}
    while true do
        local avail = ffi.new('DWORD[1]', 0)
        if lib.WinHttpQueryDataAvailable(request, avail) == 0 then break end
        local n = tonumber(avail[0])
        if n <= 0 then break end
        local rbuf = ffi.new('char[?]', n)
        local read = ffi.new('DWORD[1]', 0)
        if lib.WinHttpReadData(request, rbuf, n, read) == 0 then break end
        local got = tonumber(read[0])
        if got <= 0 then break end
        chunks[#chunks + 1] = ffi.string(rbuf, got)
    end

    lib.WinHttpCloseHandle(request)
    lib.WinHttpCloseHandle(conn)
    lib.WinHttpCloseHandle(session)

    return true, status_code, headers, table.concat(chunks)
end

-----------------------------------------------------------------------
-- Public API (queue + one-per-frame pump)
-----------------------------------------------------------------------
local active = {}
local DEFAULT_TIMEOUT = 30

function M.request(params, callback)
    active[#active + 1] = {
        params = params,
        callback = callback or function() end,
        timeout_ms = math.floor((params.timeout or DEFAULT_TIMEOUT) * 1000),
        fired = false,
    }
end

function M.poll()
    if #active == 0 then return end
    local e = table.remove(active, 1)
    if e.fired then return end
    e.fired = true

    local pok, r1, r2, r3, r4 = pcall(winhttp_do, e.params, e.timeout_ms)
    if not pok then
        pcall(e.callback, nil, 'winhttp-exception:' .. tostring(r1))
        return
    end
    if r1 == true then
        pcall(e.callback, true, r2, r3, r4)
    else
        pcall(e.callback, nil, tostring(r2))
    end
end

function M.active_count()
    return #active
end

function M.cancel_all()
    for _, e in ipairs(active) do
        e.fired = true
        e.callback = function() end
    end
    active = {}
end

return M
