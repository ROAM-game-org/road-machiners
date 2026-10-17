VAR depot_thief = "none"
VAR first_knockout_seen = false
VAR intro_step = "off"
VAR towed_to_bowl = false
VAR ambush_raider = "none"
VAR varga_truck_known = false
VAR pipe_fate = "none"
VAR marr_regard = "none"
VAR wagon_seen = false
VAR wagon_saw = false
VAR wagon_read = false
VAR wagon_watched = false
VAR wagon_pin = "none"
VAR wagon_fate = "none"
VAR scale_seen = false

EXTERNAL money()
EXTERNAL give_money(amount)
EXTERNAL pay(amount)
EXTERNAL begin(quest)
EXTERNAL note(id)
EXTERNAL has_note(id)
EXTERNAL found(site)
EXTERNAL searched(wreck)
EXTERNAL has_work()
EXTERNAL has_offers()
EXTERNAL board_full()
EXTERNAL take_work()
EXTERNAL skill(id)
EXTERNAL passed()
EXTERNAL cult_broken()
