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
Pull up by the well. I'm Hattie. Where'd you come from, and how much water do you need?
<term=bowl>Bowl</term> grows food behind that gate.
-> hub

= hub
# checkpoint: start.hub
+ {towed_to_bowl and not hattie_tow} [Tell me about the tow man.]
  The tag on his chain is old <term=pierce>Pierce</term> yard stock. Before the crews took the yard, Pierce hung one on every key and chain.
  Yours matches.
  He found your truck dead in the badlands, you in the seat. He took the lot for abandoned and hooked it up.
  ~ hattie_tow = true
  -> hub
+ {towed_to_bowl and engine_missing() and not hattie_strip} [Who stripped my truck?]
  Wasn't the tow man, if that's where you're looking. Whoever it was took their time and left you breathing.
  ~ hattie_strip = true
  -> hub
+ {not hattie_rumor} [Heard any rumors?]
  A scavenger came through selling a <term=nose>Nose</term> Army radio. Said he took it off a dead wagon in the hills east of here. That's his story, not mine.
  The patrol asked where exactly. He filled his tank and took the west road before dark.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats} [Any local legends?]
  One driver swears an Old World tank still runs out on the <term=glass_flats>Glass Flats</term>. Comes out at night with its lights off.
  I only ever saw him drink.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ {not hattie_strangers} [Who comes through here?]
  Traders, couriers, fuel haulers. Soldiers from Nose, thirsty as ever. Then the quiet ones, asking after the <term=granary>Granary</term> and never buying a drop.
  Those worry me. Water's a funny thing to forget at a well.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers and not hattie_granary} [Who asks about the Granary?]
  Drivers with empty beds. The raiders pay them to count the Granary's grain.
  Odile chalks the count on the gate every night, so all they need is somebody who can read.
  ~ hattie_granary = true
  -> hub
+ {hattie_strangers and not hattie_soldiers} [What do you make of the soldiers from Nose?]
  They pay for water like guests and give orders like owners.
  They say please, then stand there till it's done.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers and not hattie_roads} [Will the Nose soldiers stop me on the road?]
  No, and they won't stop whoever comes to take your truck either.
  Nobody keeps the road between the towns, and Kiln riders strip any truck that can't fight and won't pay.
  ~ hattie_roads = true
  -> hub
+ {hattie_roads and not hattie_unarmed} [What if I go up to Nose unarmed?]
  Nose will let you in unarmed, sure.
  Out again too, gun or no gun. I only heard Pierce won't insure a truck without one.
  ~ hattie_unarmed = true
  -> hub
+ {hattie_flats and not hattie_glass} [What about the glass at the Glass Flats?]
  People say every ripple in that glass leans toward the <term=fallen_sun>Fallen Sun</term> crater.
  The <term=sunward>Sunward</term> say it's bowing to what's down there. That's what I've heard. I won't stand on it at noon.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> hub
+ {hattie_glass and not hattie_sunward} [What do the Sunward do with strangers?]
  They take them into the crater. The ones who come out are green at the edges and quiet.
  I've never been in, and I never will.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward and cult_broken()} [Have the Sunward gone quiet?]
  Quiet as a dry well. Bo's cousin says the lamps stopped crossing to the crater at dusk. And a man with a green shine on his hands came to my well asking where a body could sleep. Well, Bo's cousin says a lot of things. You look like you'd know more about it than he does.
  -> hub
+ {hattie_sunward and not hattie_came_out} [Have you seen anyone come out of the crater?]
  I saw one at dusk once, a woman with her hands shining green. She emptied bucket after bucket without a word.
  She didn't pay. Then she walked back toward the crater.
  ~ hattie_came_out = true
  -> hub
+ [Goodbye.]
  { towed_to_bowl: Safe road. That line on my slate won't clear itself. | Come back when you've got M's for water. Keep all your wheels till then. }
  -> END
