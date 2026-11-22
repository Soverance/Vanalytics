-- addon-ashita/vanalytics/async_http.lua
-- HTTP transport selector for the Ashita port.
--
-- The addon (and every module) requires('async_http') and uses only:
--   async_http.request(params, callback)
--   async_http.poll()
--   async_http.cancel_all()
--   async_http.active_count()
--
-- Two interchangeable transports implement that API:
--   * async_http_socket.lua  — the ORIGINAL Windower LuaSocket + LuaSec client,
--     fully non-blocking (per-frame coroutine yields). Preferred when a real
--     luasocket ('socket') and luasec ('ssl') are available in the environment.
--   * async_http_winhttp.lua — a WinHTTP (FFI) client. Windows handles TLS, so
--     HTTPS works with no bundled OpenSSL. Used on stock Ashita v4, where
--     luasocket/luasec are not present.
--
-- Selection happens once, here, at require time. See PORTING.md for details and
-- for how to add luasocket+luasec to restore the fully-incremental transport.

local function can_require(name)
    local ok = pcall(require, name)
    return ok
end

if can_require('socket') and can_require('ssl') then
    return require('async_http_socket')
end

return require('async_http_winhttp')
