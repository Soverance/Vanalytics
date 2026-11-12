-- addon-ashita/vanalytics/compat/images.lua
-- Windower `images` library shim, backed by Dear ImGui.
--
-- The Vanalytics addon uses images objects only for the Hunt Watch "status
-- pills" — thin 4x14 vertical bars drawn to the left of each watch row, green
-- for alive mobs and red for dead ones. The alive/dead state is selected by
-- swapping the object's texture path between pill_alive.png and pill_dead.png.
--
-- Rather than loading PNGs into D3D textures (fragile, and requires a live
-- device), we reproduce the visual by drawing a filled colored rectangle whose
-- color is chosen from the current texture path (…alive… -> green, …dead… ->
-- red). This is visually equivalent for these solid-color pills and avoids all
-- texture-management concerns. See PORTING.md.
--
-- Supported surface (exactly what core.lua uses):
--   local img = images.new(name, settings)
--   img:show() / img:hide()
--   img:path(path_string)   -- selects alive/dead color
--   img:pos(x, y)
--   images.render_all()     -- called once per frame by the entry point

local images = {}
images.__index = images

local registry = {}

local imgui = nil
local imgui_failed = false
local function get_imgui()
    if imgui or imgui_failed then return imgui end
    local ok, mod = pcall(require, 'imgui')
    if ok and type(mod) == 'table' then imgui = mod else imgui_failed = true end
    return imgui
end

local function enum(name, default)
    local v = _G[name]
    if type(v) == 'number' then return v end
    return default
end

-- Choose a fill color (0-255 RGBA) from the texture path.
local function color_for_path(path)
    local p = tostring(path or ''):lower()
    if p:find('dead', 1, true) then
        return 190, 110, 110, 230 -- red (matches hunt_watch_dead_text)
    end
    return 130, 170, 100, 230     -- green (matches hunt_watch_alive_text)
end

function images.new(name, settings)
    settings = settings or {}
    local pos = settings.pos or {}
    local size = settings.size or {}
    local texture = settings.texture or {}

    local self = setmetatable({}, images)
    self._name = name
    self._x = pos.x or 0
    self._y = pos.y or 0
    self._w = size.width or 4
    self._h = size.height or 14
    self._visible = settings.visible and true or false
    self._path = texture.path
    registry[#registry + 1] = self
    return self
end

function images:show() self._visible = true end
function images:hide() self._visible = false end
function images:path(p) self._path = p end
function images:pos(x, y) self._x, self._y = x, y end
function images:pos_x() return self._x end
function images:pos_y() return self._y end

function images:_render(ig)
    if not self._visible then return end
    if not ig.GetBackgroundDrawList and not ig.GetForegroundDrawList then return end

    local r, g, b, a = color_for_path(self._path)
    -- Draw directly onto a screen-space draw list so we don't need a window.
    local get_list = ig.GetForegroundDrawList or ig.GetBackgroundDrawList
    local ok, dl = pcall(get_list)
    if not ok or not dl then return end

    local x1, y1 = self._x, self._y
    local x2, y2 = self._x + self._w, self._y + self._h

    -- Prefer a packed U32 color if the helper exists; fall back to a table.
    local col
    if ig.GetColorU32 then
        local ok2, c = pcall(ig.GetColorU32, { r / 255, g / 255, b / 255, a / 255 })
        if ok2 then col = c end
    end
    if col == nil then col = { r / 255, g / 255, b / 255, a / 255 } end

    if dl.AddRectFilled then
        pcall(function() dl:AddRectFilled({ x1, y1 }, { x2, y2 }, col) end)
    end
end

function images.render_all()
    local ig = get_imgui()
    if not ig then return end
    for _, obj in ipairs(registry) do
        pcall(obj._render, obj, ig)
    end
end

return images
