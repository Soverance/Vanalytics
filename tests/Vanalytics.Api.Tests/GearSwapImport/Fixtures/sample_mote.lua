-- A trimmed Mote-style file: function wrappers, comments, a dynamic set we can't resolve.
function get_sets()
    mote_include_version = 2
    include('Mote-Include.lua')
end

function init_gear_sets()
    sets.idle = { head="Genmei Kabuto", body="Emet Harness +1" }
    sets.engaged = { head="Adhemar Bonnet +1", neck="Asperity Necklace" }
    sets.engaged.Acc = set_combine(sets.engaged, { neck="Combatant's Torque" })

    -- Augmented gear via a helper table:
    gear.Herc_Feet = { name="Herculean Boots", augments={'"Triple Atk."+3',} }
    sets.precast.WS['Rudra\'s Storm'] = { feet=gear.Herc_Feet }

    -- Dynamic set (built from a function) — must be skipped, not crash:
    sets.engaged.Dynamic = customize_melee_set(sets.engaged)
end
