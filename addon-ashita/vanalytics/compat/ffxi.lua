-- addon-ashita/vanalytics/compat/ffxi.lua
-- windower.ffxi.* adapters backed by Ashita v4's memory managers.
--
-- Only the fields the Vanalytics addon actually reads are populated (see the
-- field catalog in PORTING.md). Every access into Ashita is pcall-guarded so a
-- method-name mismatch on a given Ashita build degrades one field instead of
-- crashing. Lines marked `VERIFY:` should be confirmed against a live client.

local ffxi = {}

-----------------------------------------------------------------------
-- Guarded accessors
-----------------------------------------------------------------------
local function try(fn, ...)
    local ok, a, b, c = pcall(fn, ...)
    if ok then return a, b, c end
    return nil
end

local function mm()
    return AshitaCore:GetMemoryManager()
end

-- Pull a value from an object by trying, in order, a list of zero-arg method
-- names then a list of field names. Returns the first non-nil result.
local function pick(obj, methods, fields, ...)
    if obj == nil then return nil end
    if methods then
        for _, name in ipairs(methods) do
            local m = obj[name]
            if m then
                local ok, v = pcall(m, obj, ...)
                if ok and v ~= nil then return v end
            end
        end
    end
    if fields then
        for _, name in ipairs(fields) do
            local ok, v = pcall(function() return obj[name] end)
            if ok and v ~= nil then return v end
        end
    end
    return nil
end

-----------------------------------------------------------------------
-- Job id -> Windower-style UPPERCASE abbreviation.
-- player.main_job / sub_job / job keys are abbreviation strings in Windower.
-----------------------------------------------------------------------
local JOB_ABBR = {
    [0] = 'NON', [1] = 'WAR', [2] = 'MNK', [3] = 'WHM', [4] = 'BLM', [5] = 'RDM',
    [6] = 'THF', [7] = 'PLD', [8] = 'DRK', [9] = 'BST', [10] = 'BRD', [11] = 'RNG',
    [12] = 'SAM', [13] = 'NIN', [14] = 'DRG', [15] = 'SMN', [16] = 'BLU', [17] = 'COR',
    [18] = 'PUP', [19] = 'DNC', [20] = 'SCH', [21] = 'GEO', [22] = 'RUN', [23] = 'MON',
}

-----------------------------------------------------------------------
-- Skill value extraction. Ashita's combat/craft skill objects vary in shape
-- across builds; try common method/field names. Combat "skill" raw values keep
-- their capped-flag in the high bit on retail memory, so mask to 15 bits.
-----------------------------------------------------------------------
local function skill_pair(obj)
    if obj == nil then return nil end
    if type(obj) == 'number' then return { level = obj, cap = 0 } end
    local raw = pick(obj, { 'GetSkill', 'GetRaw', 'GetLevel' }, { 'Skill', 'Raw', 'Level' })
    local cap = pick(obj, { 'GetCap', 'GetMax' }, { 'Cap', 'Max' })
    if raw == nil then return nil end
    raw = tonumber(raw) or 0
    -- Mask capped bit if present (>0x8000 indicates the capped flag set).
    if raw >= 0x8000 then raw = raw % 0x8000 end
    return { level = raw, cap = tonumber(cap) or 0 }
end

-----------------------------------------------------------------------
-- get_player
-----------------------------------------------------------------------
function ffxi.get_player()
    local p = try(function() return mm():GetPlayer() end)
    local party = try(function() return mm():GetParty() end)
    if not p and not party then return nil end

    -- Not logged in yet -> Windower returns nil.
    local name = party and try(function() return party:GetMemberName(0) end)
    if not name or name == '' then return nil end

    local main_job_id = tonumber(pick(p, { 'GetMainJob' })) or 0
    local sub_job_id = tonumber(pick(p, { 'GetSubJob' })) or 0

    -- All jobs keyed by UPPERCASE abbreviation -> level.
    local jobs = {}
    for id = 1, 23 do
        local lvl = tonumber(pick(p, { 'GetJobLevel' }, nil, id)) or 0
        local abbr = JOB_ABBR[id]
        if abbr then jobs[abbr] = lvl end
    end

    -- Job points / capacity points, keyed by lowercase abbreviation.
    -- VERIFY: Ashita method names for JP/CP vary; guarded, defaults to 0.
    local job_points = {}
    for id = 1, 23 do
        local abbr = JOB_ABBR[id]
        if abbr then
            job_points[abbr:lower()] = {
                jp = tonumber(pick(p, { 'GetJobPointsCurrent', 'GetJobPoints' }, nil, id)) or 0,
                jp_spent = tonumber(pick(p, { 'GetJobPointsSpent' }, nil, id)) or 0,
                cp = tonumber(pick(p, { 'GetCapacityPoints' }, nil, id)) or 0,
            }
        end
    end

    -- Master levels: in practice only the active job's ML is reliably readable.
    -- VERIFY: Ashita master-level API. Keyed by UPPERCASE abbr like Windower.
    local master_levels = {}
    do
        local ml = tonumber(pick(p, { 'GetMasterLevel', 'GetMasterlevel' }))
        if ml and ml > 0 then
            local abbr = JOB_ABBR[main_job_id]
            if abbr then master_levels[abbr] = ml end
        end
    end

    -- Skills keyed by numeric skill id -> {level, cap}. core.lua's id-based
    -- fallback path consumes these (its name-based path yields nothing, which
    -- is fine). Ids 1-48 cover combat/magic; 48-57 crafting.
    local skills = {}
    for id = 1, 57 do
        local obj = try(function() return p:GetCombatSkill(id) end)
        local sp = obj and skill_pair(obj)
        if not sp then
            obj = try(function() return p:GetCraftSkill(id) end)
            sp = obj and skill_pair(obj)
        end
        if sp and (sp.level or 0) > 0 then skills[id] = sp end
    end

    -- Merits: Ashita exposes total merit points, not a per-category name map.
    -- STUB: left empty (core.lua treats empty as nil). See PORTING.md.
    local merits = {}

    local vitals = {
        hp = tonumber(party and try(function() return party:GetMemberHP(0) end)) or 0,
        max_hp = tonumber(pick(p, { 'GetHPMax' })) or 0,
        mp = tonumber(party and try(function() return party:GetMemberMP(0) end)) or 0,
        max_mp = tonumber(pick(p, { 'GetMPMax' })) or 0,
    }

    local player = {
        name = name,
        id = tonumber(party and try(function() return party:GetMemberServerId(0) end)) or 0,
        index = tonumber(party and try(function() return party:GetMemberTargetIndex(0) end)) or 0,
        main_job = JOB_ABBR[main_job_id] or 'NON',
        main_job_level = tonumber(pick(p, { 'GetMainJobLevel' })) or 0,
        sub_job = JOB_ABBR[sub_job_id] or 'NON',
        sub_job_level = tonumber(pick(p, { 'GetSubJobLevel' })) or 0,
        jobs = jobs,
        job_points = job_points,
        master_levels = master_levels,
        skills = skills,
        merits = merits,
        vitals = vitals,
        -- player.linkshell is the *active* LS id in Windower; Ashita has no
        -- direct equivalent. Equipped LS decoding happens separately in core via
        -- item extdata, so nil here is acceptable. VERIFY if exact id needed.
        linkshell = nil,
        linkshell_slot = tonumber(pick(p, { 'GetLinkshellSlot' })) or nil,
        nation = tonumber(pick(p, { 'GetNation' })) or 0,
        superior_level = tonumber(pick(p, { 'GetSuLevel', 'GetSuperiorLevel' })) or 0,
        item_level = tonumber(pick(p, { 'GetItemLevel' })) or 0,
        title = tonumber(pick(p, { 'GetTitle' })) or 0,
    }
    return player
end

-----------------------------------------------------------------------
-- get_info
-- zone, server, menu_open, macro_book
-----------------------------------------------------------------------
function ffxi.get_info()
    local party = try(function() return mm():GetParty() end)
    local p = try(function() return mm():GetPlayer() end)
    local info = {
        -- VERIFY: server (world) id. Wire contract keys characters by
        -- name + server, so this is the top correctness risk. Ashita has no
        -- clean "world id"; try player server id / login server, else 0.
        server = tonumber(pick(p, { 'GetServerId' }))
            or tonumber(party and try(function() return party:GetMemberServerId(0) end))
            or 0,
        zone = tonumber(party and try(function() return party:GetMemberZone(0) end)) or 0,
        menu_open = false,
        macro_book = 0,
    }
    -- Macro book + menu state (used by macro sync). VERIFY method names.
    local mp = try(function() return mm():GetPlayer() end)
    info.macro_book = tonumber(pick(mp, { 'GetMacroBook' })) or 0
    local menu = try(function() return mm():GetMenu() end)
    if menu then
        local mname = pick(menu, { 'GetName' })
        info.menu_open = (mname ~= nil and mname ~= '')
    end
    -- logged_in: true when a character name is present.
    info.logged_in = (party and (function()
        local n = try(function() return party:GetMemberName(0) end)
        return n ~= nil and n ~= ''
    end)()) or false
    return info
end

-----------------------------------------------------------------------
-- get_spells -> { [spell_id] = true } for known spells.
-----------------------------------------------------------------------
function ffxi.get_spells()
    local p = try(function() return mm():GetPlayer() end)
    local out = {}
    if not p then return out end
    -- Spell ids run 0..~1024. HasSpell(id) is the common Ashita accessor.
    for id = 0, 1024 do
        local known = try(function() return p:HasSpell(id) end)
        if known == true or known == 1 then out[id] = true end
    end
    return out
end

-----------------------------------------------------------------------
-- get_key_items -> array of unlocked key item ids.
-----------------------------------------------------------------------
function ffxi.get_key_items()
    local p = try(function() return mm():GetPlayer() end)
    local out = {}
    if not p then return out end
    for id = 0, 2048 do
        local has = try(function() return p:HasKeyItem(id) end)
        if has == true or has == 1 then out[#out + 1] = id end
    end
    return out
end

-----------------------------------------------------------------------
-- Inventory
-- Bag name -> Ashita container id. Order matches Windower bag ids so gear
-- lookups (bag_names in core.lua) resolve to the same physical bag.
-----------------------------------------------------------------------
local BAGS = {
    inventory = 0, safe = 1, storage = 2, temporary = 3, locker = 4,
    satchel = 5, sack = 6, case = 7, wardrobe = 8, safe2 = 9,
    wardrobe2 = 10, wardrobe3 = 11, wardrobe4 = 12, wardrobe5 = 13,
    wardrobe6 = 14, wardrobe7 = 15, wardrobe8 = 16,
}

-- Equipment slot id -> Windower equipment key.
local EQUIP_KEYS = {
    [0] = 'main', [1] = 'sub', [2] = 'range', [3] = 'ammo', [4] = 'head',
    [5] = 'body', [6] = 'hands', [7] = 'legs', [8] = 'feet', [9] = 'neck',
    [10] = 'waist', [11] = 'left_ear', [12] = 'right_ear', [13] = 'left_ring',
    [14] = 'right_ring', [15] = 'back',
}

-- Convert Ashita item .Extra (byte array/string/userdata) to a Lua string so
-- the extdata shim can parse augments/linkshell the same way Windower does.
local function extra_to_string(extra)
    if extra == nil then return nil end
    if type(extra) == 'string' then return extra end
    local ok, s = pcall(function()
        local bytes = {}
        for i = 0, 23 do
            local b = extra[i]
            if b == nil then break end
            bytes[#bytes + 1] = string.char(tonumber(b) % 256)
        end
        return table.concat(bytes)
    end)
    return ok and s or nil
end

local function read_item(inv, container, slot)
    local it = try(function() return inv:GetContainerItem(container, slot) end)
    if not it then return nil end
    local id = tonumber(pick(it, nil, { 'Id' }))
    if not id or id == 0 then return nil end
    return {
        id = id,
        count = tonumber(pick(it, nil, { 'Count' })) or 1,
        -- Windower item.status (e.g. 19 == equipped linkshell). Ashita exposes
        -- item flags; mapping is approximate. VERIFY for equipped-LS detection.
        status = tonumber(pick(it, nil, { 'Flags' })) or 0,
        bazaar = tonumber(pick(it, nil, { 'Price' })) or 0,
        extdata = extra_to_string(pick(it, nil, { 'Extra' })),
    }
end

function ffxi.get_items()
    local inv = try(function() return mm():GetInventory() end)
    local out = {}
    if not inv then return out end

    for bag_name, container in pairs(BAGS) do
        local max = tonumber(try(function() return inv:GetContainerCountMax(container) end))
            or tonumber(try(function() return inv:GetContainerCount(container) end))
            or 80
        local bag = {}
        for slot = 0, max do
            local item = read_item(inv, container, slot)
            if item then bag[slot] = item end
        end
        out[bag_name] = bag
    end

    -- Equipment map: slot_name = inventory slot index, slot_name_bag = bag id.
    local equipment = {}
    for slot_id, ekey in pairs(EQUIP_KEYS) do
        local eq = try(function() return inv:GetEquippedItem(slot_id) end)
        if eq then
            -- Ashita equipmententry: .Index packs container<<8 | slot (VERIFY),
            -- .Slot may give the slot directly.
            local idx = tonumber(pick(eq, nil, { 'Index' }))
            local slot = tonumber(pick(eq, nil, { 'Slot' }))
            local container, invslot
            if idx and idx > 0 then
                container = math.floor(idx / 256) % 256
                invslot = idx % 256
            end
            if slot and (not invslot or invslot == 0) then invslot = slot end
            if invslot and invslot > 0 then
                equipment[ekey] = invslot
                equipment[ekey .. '_bag'] = container or 0
            end
        end
    end
    out.equipment = equipment
    return out
end

-----------------------------------------------------------------------
-- Entities / mobs
-----------------------------------------------------------------------
local function make_mob(index)
    if not index or index <= 0 then return nil end
    local e = try(function() return mm():GetEntity() end)
    if not e then return nil end
    local name = pick(e, { 'GetName' }, nil, index)
    local id = tonumber(pick(e, { 'GetServerId' }, nil, index))
    if (not name or name == '') and (not id or id == 0) then return nil end

    local spawn = tonumber(pick(e, { 'GetSpawnFlags' }, nil, index)) or 0
    local render = tonumber(pick(e, { 'GetRenderFlags0' }, nil, index)) or 0

    local mob = {
        index = index,
        idx = index,
        id = id or 0,
        name = name or '',
        x = tonumber(pick(e, { 'GetLocalPositionX' }, nil, index)) or 0,
        y = tonumber(pick(e, { 'GetLocalPositionY' }, nil, index)) or 0,
        z = tonumber(pick(e, { 'GetLocalPositionZ' }, nil, index)) or 0,
        hpp = tonumber(pick(e, { 'GetHPPercent' }, nil, index)) or 0,
        status = tonumber(pick(e, { 'GetStatusServer', 'GetStatus' }, nil, index)) or 0,
        claim_id = tonumber(pick(e, { 'GetClaimStatus' }, nil, index)) or 0,
        race = tonumber(pick(e, { 'GetRace' }, nil, index)) or 0,
        model_size = tonumber(pick(e, { 'GetModelSize' }, nil, index)) or 0,
        spawn_type = spawn,
        -- VERIFY: flag bit meanings. valid_target ~ rendered/targetable.
        valid_target = (render % 0x400) >= 0x200,
        is_npc = (spawn % 0x10) ~= 0,
        bazaar = false,
    }
    return mob
end

function ffxi.get_mob_by_index(index)
    return make_mob(tonumber(index))
end

function ffxi.get_mob_by_id(id)
    id = tonumber(id)
    if not id or id == 0 then return nil end
    local e = try(function() return mm():GetEntity() end)
    if not e then return nil end
    for index = 0, 0x8FF do
        local sid = tonumber(pick(e, { 'GetServerId' }, nil, index))
        if sid == id then return make_mob(index) end
    end
    return nil
end

function ffxi.get_mob_by_target(kind)
    local t = try(function() return mm():GetTarget() end)
    if not t then return nil end
    -- 't' = main target (slot 0); 'st'/'scan' = subtarget (slot 1).
    local slot = (kind == 't') and 0 or 1
    local index = tonumber(pick(t, { 'GetTargetIndex' }, nil, slot))
    if not index or index == 0 then return nil end
    return make_mob(index)
end

function ffxi.get_mob_array()
    local e = try(function() return mm():GetEntity() end)
    local out = {}
    if not e then return out end
    for index = 1, 0x8FF do
        local name = pick(e, { 'GetName' }, nil, index)
        local id = tonumber(pick(e, { 'GetServerId' }, nil, index))
        if (name and name ~= '') or (id and id ~= 0) then
            out[index] = make_mob(index)
        end
    end
    return out
end

function ffxi.get_mob_list()
    local e = try(function() return mm():GetEntity() end)
    local out = {}
    if not e then return out end
    for index = 1, 0x8FF do
        local name = pick(e, { 'GetName' }, nil, index)
        if name and name ~= '' then out[index] = name end
    end
    return out
end

return ffxi
