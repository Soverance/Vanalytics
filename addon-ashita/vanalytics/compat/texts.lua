-- addon-ashita/vanalytics/compat/texts.lua
-- Windower `texts` library shim, backed by Dear ImGui (Ashita's require('imgui')).
--
-- Windower's `texts` objects are independent on-screen text overlays. Ashita has
-- no equivalent, so each texts object is rendered as its own borderless ImGui
-- window (semi-transparent black background) from the d3d_present callback.
--
-- Supported surface (exactly what core.lua uses):
--   local t = texts.new(template_string, settings)
--   t:show() / t:hide()
--   t:update({ key = value, ... })   -- fills ${key|default} placeholders
--   t:color(r, g, b)                 -- overrides text color (0-255)
--   t:pos(x, y) / t:pos_x() / t:pos_y()
--   texts.render_all()               -- called once per frame by the entry point
--
-- settings = {
--   pos = { x, y },
--   bg  = { alpha, red, green, blue, visible },   -- 0-255
--   padding = n,
--   text = { font, size, alpha, red, green, blue, stroke = {...} },
--   flags = { draggable, bold, italic },
-- }
--
-- APPROXIMATIONS (see PORTING.md):
--  * Per-object font size is approximated with SetWindowFontScale (ImGui has a
--    single default font atlas; exact px sizes/fonts are not reproduced).
--  * bold / italic / text stroke are not rendered (ImGui default font only).
--  * Colors and the black translucent background are reproduced faithfully.

local texts = {}
texts.__index = texts

-- Registry of all live text objects, in creation order (stable draw order).
local registry = {}

-- Lazily-resolved imgui module + enum values (resolved on first render).
local imgui = nil
local imgui_failed = false
local function get_imgui()
    if imgui or imgui_failed then return imgui end
    local ok, mod = pcall(require, 'imgui')
    if ok and type(mod) == 'table' then imgui = mod else imgui_failed = true end
    return imgui
end

-- Read an ImGui enum from the global namespace (Ashita exposes them), else use
-- the well-known stable default value.
local function enum(name, default)
    local v = _G[name]
    if type(v) == 'number' then return v end
    return default
end

-----------------------------------------------------------------------
-- Template parsing: "${key|default}" segments interleaved with literals.
-----------------------------------------------------------------------
local function parse_template(tmpl)
    local segments = {}
    if type(tmpl) ~= 'string' then return segments end
    local pos = 1
    while true do
        local s, e, key, def = tmpl:find('%${([^|}]*)|?([^}]*)}', pos)
        if not s then
            if pos <= #tmpl then segments[#segments + 1] = { lit = tmpl:sub(pos) } end
            break
        end
        if s > pos then segments[#segments + 1] = { lit = tmpl:sub(pos, s - 1) } end
        segments[#segments + 1] = { key = key, def = def or '' }
        pos = e + 1
    end
    return segments
end

-----------------------------------------------------------------------
-- Construction
-----------------------------------------------------------------------
local next_id = 0

function texts.new(template, settings)
    -- Windower allows texts.new(settings) with no template.
    if type(template) == 'table' and settings == nil then
        settings = template
        template = ''
    end
    settings = settings or {}
    local pos = settings.pos or {}
    local text = settings.text or {}
    local bg = settings.bg or {}
    local flags = settings.flags or {}

    next_id = next_id + 1
    local self = setmetatable({}, texts)
    self._id = next_id
    self._segments = parse_template(template)
    self._values = {}
    self._visible = false
    self._x = pos.x or 0
    self._y = pos.y or 0
    self._force_pos = true
    self._padding = settings.padding or 4
    self._size = text.size or 12
    self._draggable = flags.draggable and true or false
    -- text color (0-255), overridable via :color()
    self._r = text.red or 255
    self._g = text.green or 255
    self._b = text.blue or 255
    self._a = text.alpha or 255
    -- background color (0-255)
    self._bg_r = bg.red or 0
    self._bg_g = bg.green or 0
    self._bg_b = bg.blue or 0
    self._bg_a = (bg.visible == false) and 0 or (bg.alpha or 0)

    registry[#registry + 1] = self
    return self
end

-----------------------------------------------------------------------
-- Instance methods
-----------------------------------------------------------------------
function texts:show() self._visible = true end
function texts:hide() self._visible = false end

function texts:update(values)
    if type(values) == 'table' then
        self._values = values
    elseif type(values) == 'string' then
        self._values = { content = values }
    end
end

function texts:color(r, g, b)
    self._r, self._g, self._b = r, g, b
end

function texts:pos(x, y)
    self._x, self._y = x, y
    self._force_pos = true
end

function texts:pos_x() return self._x end
function texts:pos_y() return self._y end

-- Render the current template + values into a single string.
function texts:_rendered_text()
    local out = {}
    for _, seg in ipairs(self._segments) do
        if seg.lit then
            out[#out + 1] = seg.lit
        else
            local v = self._values[seg.key]
            if v == nil or v == '' then v = seg.def end
            out[#out + 1] = tostring(v)
        end
    end
    return table.concat(out)
end

-----------------------------------------------------------------------
-- Per-frame rendering
-----------------------------------------------------------------------
local function draw_text(ig, str, r, g, b, a)
    local col = { r / 255, g / 255, b / 255, a / 255 }
    -- Prefer an unformatted call so '%' in content is never treated as printf.
    if ig.TextUnformatted then
        if ig.PushStyleColor and ig.PopStyleColor then
            ig.PushStyleColor(enum('ImGuiCol_Text', 0), col)
            ig.TextUnformatted(str)
            ig.PopStyleColor(1)
            return
        end
        ig.TextUnformatted(str)
        return
    end
    ig.TextColored(col, str)
end

function texts:_render(ig)
    if not self._visible then return end
    local text_str = self:_rendered_text()
    if text_str == nil then return end

    local WindowFlags =
        enum('ImGuiWindowFlags_NoTitleBar', 1) +
        enum('ImGuiWindowFlags_NoResize', 2) +
        enum('ImGuiWindowFlags_NoScrollbar', 8) +
        enum('ImGuiWindowFlags_NoCollapse', 32) +
        enum('ImGuiWindowFlags_AlwaysAutoResize', 64) +
        enum('ImGuiWindowFlags_NoSavedSettings', 256) +
        enum('ImGuiWindowFlags_NoFocusOnAppearing', 4096) +
        enum('ImGuiWindowFlags_NoNav', 65536 + 131072)
    if not self._draggable then
        WindowFlags = WindowFlags +
            enum('ImGuiWindowFlags_NoMove', 4) +
            enum('ImGuiWindowFlags_NoMouseInputs', 512) +
            enum('ImGuiWindowFlags_NoBringToFrontOnFocus', 8192)
    end

    local cond_always = enum('ImGuiCond_Always', 1)
    local cond_first = enum('ImGuiCond_FirstUseEver', 4)
    -- Non-draggable objects are pinned every frame. Draggable objects only get
    -- their position forced on creation or an explicit :pos(); otherwise ImGui
    -- keeps the user's dragged position.
    local cond = cond_always
    if self._draggable and not self._force_pos then cond = cond_first end
    if ig.SetNextWindowPos then ig.SetNextWindowPos({ self._x, self._y }, cond) end

    -- Background color / alpha.
    local pushed = 0
    if ig.PushStyleColor then
        ig.PushStyleColor(enum('ImGuiCol_WindowBg', 2),
            { self._bg_r / 255, self._bg_g / 255, self._bg_b / 255, self._bg_a / 255 })
        pushed = 1
    end

    local label = '##va_text_' .. self._id
    local visible = true
    if ig.Begin then visible = ig.Begin(label, true, WindowFlags) end
    -- Approximate per-object font size relative to ImGui's default (~13px).
    if ig.SetWindowFontScale then ig.SetWindowFontScale((self._size or 12) / 13) end

    draw_text(ig, text_str, self._r, self._g, self._b, self._a)

    -- Capture a user-dragged position back into x/y so dependent objects follow.
    if self._draggable and ig.GetWindowPos then
        local ok, p = pcall(ig.GetWindowPos)
        if ok and type(p) == 'table' then
            if p.x then self._x, self._y = p.x, p.y
            elseif p[1] then self._x, self._y = p[1], p[2] end
        end
    end

    if ig.End then ig.End() end
    if pushed > 0 and ig.PopStyleColor then ig.PopStyleColor(pushed) end
    self._force_pos = false
end

-- Draw every visible text object. Called once per frame from d3d_present.
function texts.render_all()
    local ig = get_imgui()
    if not ig then return end
    for _, obj in ipairs(registry) do
        pcall(obj._render, obj, ig)
    end
end

return texts
