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
VAR hattie_varga = false
VAR hattie_strip = false
VAR hattie_farm = false
VAR hattie_unarmed = false

=== start ===
# checkpoint: start
Parked that thing all by yourself, did you? Last one needed six of us. Sit down. I'm Hattie, I keep the well.
This is <term=bowl>Bowl</term>. We grow grain, mend what breaks, and argue about rain. You'll hear all three from this bench.
-> hub

= hub
# checkpoint: start.hub
+ {towed_to_bowl and not hattie_tow} [Tell me about the tow man.]
  That tag on his chain is an old <term=pierce>Pierce</term> yard tag. Before the crews took the yard, Pierce hung one on every key and chain it owned.
  If your key has a brass tag, it came from the same yard, and you can tell him so while he counts your grain.
  ~ hattie_tow = true
  -> hub
+ {hattie_tow and not hattie_varga} [Why would he want a Varga?]
  Ask Ruth, up on the terraces. The Vargas had a farm at the foot of the rim, water tower and all. When their well went dry, she came up here with her name and not much else.
  Your tow man left without seeing her. A man with good news waits for an answer.
  ~ hattie_varga = true
  -> hub
+ {hattie_varga and not hattie_farm} [I found my truck at that farm.]
  Hattie puts the bucket down.
  Then you're driving Danil Varga's pickup. Ruth's boy. He went west with a convoy and never came back, and Ruth left the farm the year after.
  The whole well house will know by noon, so go and see Ruth before somebody gets to her with your news.
  ~ hattie_farm = true
  ~ varga_truck_known = true
  -> hub
+ {towed_to_bowl and not hattie_strip} [Who stripped my truck?]
  Not the tow man. Your bed was bare and your engine open when he brought you in on his chain. Whoever did it took their time and left you breathing, which passes for manners on the open road.
  ~ hattie_strip = true
  -> hub
+ {not hattie_rumor} [Heard any rumors?]
  A scavenger came through a few days back, trying to sell a <term=nose>Nose</term> Army radio, and he threw in a story for free. Swore he'd pulled it off a dead Army wagon in the hills north-east of here.
  The patrol asked him where exactly. He answered by filling his tank and taking the west road before dark.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats} [Any local legends?]
  There's supposed to be an Old World tank out on the <term=glass_flats>Glass Flats</term> that still runs. It rolls out at night with its lights off.
  My cousin says he heard it, but my cousin hears a great deal when he's been drinking. Buy him another and he'll tell you what gear it was in.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ {not hattie_strangers} [Who comes through here?]
  Somebody every day. Traders, couriers, drivers hauling fuel, and soldiers down from Nose who buy water and say please, which puts them ahead of most.
  The quiet ones worry me. They ask about the <term=granary>Granary</term> and give me nothing to sell when they leave.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers and not hattie_granary} [Who asks about the Granary?]
  Drivers with nothing in the back, and you thought you were doing poorly. The raiders pay them to learn how much grain we keep, so they know how much to ask for.
  Not that they need spies. Odile chalks the count on the Granary gate every night for anyone to read. She calls that honest. I call it saving the raiders a trip.
  ~ hattie_granary = true
  -> hub
+ {hattie_strangers and not hattie_soldiers} [What do you make of the soldiers from Nose?]
  Soldiers playing at being a town. They eat our grain and send orders back, like we can grind those into flour.
  Perfectly polite when they want something, which is the only time to watch them.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers and not hattie_roads} [Will the Nose soldiers stop me on the road?]
  Not on the open road, love. Nobody guards it, and that's the trouble with it.
  Nose won't let a truck out of its gate without a gun on it, so don't go up there unarmed.
  ~ hattie_roads = true
  -> hub
+ {hattie_roads and not hattie_unarmed} [What if I go up to Nose unarmed?]
  They'll let you in, and you can sit inside their gate till you grow roots. You leave when you buy a gun, and they name the price.
  ~ hattie_unarmed = true
  -> hub
+ {hattie_flats and not hattie_glass} [What about the glass at the Glass Flats?]
  Pim Arslan, who cuts lenses, says every ripple in that glass leans toward the <term=fallen_sun>Fallen Sun</term> crater. Looking pays Pim's bills, so I'd weigh that.
  I won't stand on it at noon, whatever it points at. The <term=sunward>Sunward</term> worship what lies in that crater, and if you stand still long enough, you'll get their opinion for free.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> hub
+ {hattie_glass and not hattie_sunward} [What do the Sunward do with strangers?]
  They take strangers into the crater, if they'll go. Folk say a stranger who goes in with the Sunward doesn't come out.
  They do come out, green at the edges and with less to say than you. I've never followed one in, and you couldn't pay me to start.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward and not hattie_came_out} [Have you seen one come out?]
  Once, at dusk. A woman came up the canal road and asked for water. Her hands had a green shine to them in the dark.
  She drank bucket after bucket without another word, then walked back toward the crater. She didn't pay, and I didn't ask her to.
  ~ hattie_came_out = true
  -> hub
+ [Goodbye.]
  { towed_to_bowl: Mind your slate, love. I remember a bowl of grain long after you stop being grateful for it. | Come back when you've got M's for a bucket, and we'll put that thirsty face to use. }
  -> END
