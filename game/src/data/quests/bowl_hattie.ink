INCLUDE world.ink

VAR hattie_rumor = false
VAR hattie_flats = false
VAR hattie_glass = false
VAR hattie_sunward = false
VAR hattie_strangers = false
VAR hattie_granary = false
VAR hattie_soldiers = false
VAR hattie_roads = false
VAR hattie_came_out = false
VAR hattie_tow = false
VAR hattie_strip = false
VAR hattie_unarmed = false

=== start ===
# checkpoint: start
Park that wreck clear of my well, driver, and tell me how much water you need. I'm Hattie, and I charge for the water, not the advice you'll ignore.
<term=bowl>Bowl</term> grows food behind that gate. Drivers stay here with me till their tanks are full.
-> hub

= hub
# checkpoint: start.hub
+ {towed_to_bowl and not hattie_tow} [Tell me about the tow man.]
  That tag on his chain is an old <term=pierce>Pierce</term> yard tag. Before the crews took the yard, Pierce hung one of those on every key and chain it owned.
  Tag on your key came from that same yard.
  He found your truck dead in the badlands with you in the seat, took it for abandoned and hooked up the lot.
  ~ hattie_tow = true
  -> hub
+ {towed_to_bowl and engine_missing() and not hattie_strip} [Who stripped my truck?]
  Wasn't the tow man, if that's where you're looking. Whoever it was took their time and left you breathing.
  ~ hattie_strip = true
  -> hub
+ {not hattie_rumor} [Heard any rumors?]
  A scavenger came through selling a <term=nose>Nose</term> Army radio. Said he took it off a dead wagon in the hills north-east of here.
  Then the patrol asked where exactly, and he filled his tank and took the west road before dark.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats} [Any local legends?]
  There's supposed to be an Old World tank still running out on the <term=glass_flats>Glass Flats</term>, rolling out at night with its lights off.
  One driver swore he saw it, but I only ever saw him drink.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ {not hattie_strangers} [Who comes through here?]
  Traders, couriers, fuel haulers, thirsty soldiers from Nose, and quiet sorts asking after the <term=granary>Granary</term> without buying a drop.
  The ones asking after the Granary worry me. Water's a funny thing to forget at a well.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers and not hattie_granary} [Who asks about the Granary?]
  Drivers with empty beds ask, and the raiders pay them to count our grain.
  Odile chalks the count on the Granary gate every night, so they're paying good money for somebody who can read.
  ~ hattie_granary = true
  -> hub
+ {hattie_strangers and not hattie_soldiers} [What do you make of the soldiers from Nose?]
  They pay for water like guests and give orders like owners.
  They ask polite, then stand there till you do it.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers and not hattie_roads} [Will the Nose soldiers stop me on the road?]
  No, and they won't stop whoever comes to take your truck either.
  Take that truck to Nose without a gun and you're parking till you find one.
  ~ hattie_roads = true
  -> hub
+ {hattie_roads and not hattie_unarmed} [What if I go up to Nose unarmed?]
  Nose will let you in unarmed, sure.
  Try leaving and they'll make you buy a gun at whatever price they fancy.
  ~ hattie_unarmed = true
  -> hub
+ {hattie_flats and not hattie_glass} [What about the glass at the Glass Flats?]
  Pim Arslan says every ripple in that glass leans toward the <term=fallen_sun>Fallen Sun</term> crater.
  I won't stand on it at noon, and you won't catch me checking if it's safe. The <term=sunward>Sunward</term> say it's bowing to what's down there.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> hub
+ {hattie_glass and not hattie_sunward} [What do the Sunward do with strangers?]
  They take them into the crater, and they come out green at the edges and quiet. Folk say they don't come back; I say they don't come back right.
  Never been in, never will; I sell water, not sense.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward and cult_broken()} [Have the Sunward gone quiet?]
  Quiet as a dry well. Bo's cousin says the lamps stopped crossing to the crater at dusk, and a man with a green shine on his hands came to my well asking where a body could sleep. Well, Bo's cousin says a lot of things. You look like you'd know more about it than he does.
  -> hub
+ {hattie_sunward and not hattie_came_out} [Have you seen one come out?]
  I saw one at dusk once, a woman with her hands shining green. She emptied bucket after bucket without a word.
  She didn't pay, and she walked back toward the crater.
  ~ hattie_came_out = true
  -> hub
+ [Goodbye.]
  { towed_to_bowl: Safe road, and that slate won't clear itself. | Come back when you've got M's for water, and try to keep all your wheels. }
  -> END
