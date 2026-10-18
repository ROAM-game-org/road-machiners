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
Water costs here, talk doesn't, and I hear everything that happens in <term=bowl>Bowl</term> twice. Once when it happens, and once when somebody's improved it.
-> hub

= hub
# checkpoint: start.hub
+ {towed_to_bowl and not hattie_tow} [Tell me about the tow man.]
  Big and slow-spoken, with a <term=pierce>Pierce</term> coat gone white at the seams. That tag on his chain is an old Pierce yard tag. Before the crews took the yard, Pierce hung one on every key and chain it owned.
  If your key has a brass tag, it came from the same yard.
  He found your truck out in the badlands, dead on its wheels with you in the seat. He took it for abandoned, so he hooked up the lot and brought it here.
  ~ hattie_tow = true
  -> hub
+ {towed_to_bowl and not hattie_strip} [Who stripped my truck?]
  Not the tow man. It came in on his chain like that, with the bed bare and the engine open. Whoever did it took their time and left you breathing, and out on the open road that counts as manners.
  ~ hattie_strip = true
  -> hub
+ {not hattie_rumor} [Heard any rumors?]
  A scavenger came through a few days back, trying to sell a <term=nose>Nose</term> Army radio. He swore he'd pulled it off an Army wagon sitting dead in the hills north-east of here.
  When the patrol asked him where exactly, he filled his tank and left by the west road before dark.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats} [Any local legends?]
  You know the <term=glass_flats>Glass Flats</term>, out east, where the ground melted into glass? There's supposed to be an Old World tank out there that still runs. It rolls out at night with its lights off.
  My cousin saw it. Well, he heard it, and my cousin hears a great deal when he's been drinking.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ {not hattie_strangers} [Who comes through here?]
  Somebody every day, mind you. Traders, couriers, drivers hauling fuel. The ones that worry me are the quiet ones who ask about the <term=granary>Granary</term>.
  Soldiers come down from Nose to buy water too. They're polite, I'll give them that.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers and not hattie_granary} [Who asks about the Granary?]
  Drivers with nothing in the back. The raiders pay them to find out how much grain we've got in store, so they know how much to ask us for.
  Not that they need spies. Odile writes the grain count on the Granary gate every night for anyone to read. She calls that honest. I call it saving the raiders a trip.
  ~ hattie_granary = true
  -> hub
+ {hattie_strangers and not hattie_soldiers} [What do you make of the soldiers from Nose?]
  Soldiers playing at being a town, if you ask me. They eat our grain and send us orders back, and they're perfectly polite whenever they want something.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers and not hattie_roads} [Will the Nose soldiers stop me on the road?]
  Not on the open road. Nobody guards that, which is the trouble with it. But Nose won't let a truck out of its own gate without a gun on it, so don't go up there unarmed.
  ~ hattie_roads = true
  -> hub
+ {hattie_roads and not hattie_unarmed} [What if I go up to Nose unarmed?]
  They'll let you in. Getting out's the trouble. You'll sit inside their gate till you buy a gun off them, at their price.
  ~ hattie_unarmed = true
  -> hub
+ {hattie_flats and not hattie_glass} [What about the glass at the Glass Flats?]
  Pim Arslan, who cuts lenses, says every ripple in it leans the same way, toward the <term=fallen_sun>Fallen Sun</term>. That's the crater where the ship came down.
  I won't stand on it at noon, whatever it points at. The <term=sunward>Sunward</term> have their own opinion, mind. They worship whatever lies in that crater, and they'll share it with anyone who stands still.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> hub
+ {hattie_glass and not hattie_sunward} [What do the Sunward do with strangers?]
  Take them into the crater, if they'll go. Folk say a stranger who goes in with the Sunward doesn't come out. I say they do come out, green at the edges and quiet.
  I've never followed one in, and I won't.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward and not hattie_came_out} [Have you seen one come out?]
  Once. A woman came up the canal road at dusk and asked me for water. Her hands had a green shine to them in the dark, and she drank bucket after bucket without a word.
  She didn't pay, and I didn't ask her to. She walked back the way she came, toward the crater.
  ~ hattie_came_out = true
  -> hub
+ [Goodbye.]
  { towed_to_bowl: Mind your slate. I don't forget a bowl of grain. | Come back when you've M's for a bucket. }
  -> END
