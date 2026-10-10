INCLUDE world.ink

VAR hattie_flats = false
VAR hattie_sunward = false
VAR hattie_strangers = false
VAR hattie_soldiers = false

=== start ===
# checkpoint: start
Water costs here, talk doesn't, and I hear everything that happens in Bowl twice. Once when it happens, and once when somebody's improved it.
-> hub

= hub
# checkpoint: start.hub
+ [Heard any rumors?]
  A scavenger came through a few days back, trying to sell a Nose Army radio. He swore he'd pulled it off an Army wagon sitting dead in the hills north-east of here.
  When the patrol asked him where exactly, he filled his tank and left for Nose in a hurry.
  ~ note("wagonBowl")
  -> hub
+ [Any local legends?]
  You know the Glass Flats, out east, where the ground melted into glass? There's supposed to be an Old World tank out there that still runs. It rolls out at night with its lights off.
  My cousin saw it. Well, he heard it, and my cousin hears a great deal when he's been drinking.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ [Who comes through here?]
  Somebody every day, mind you. Traders, couriers, drivers hauling fuel. The ones that worry me are the quiet ones who ask where the seed stores are.
  Soldiers come down from Nose to buy water too. They're polite, I'll give them that.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers} [What do you make of the soldiers from Nose?]
  Soldiers playing at being a town, if you ask me. They eat our grain and send us orders back, and they're perfectly polite whenever they want something.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers} [Will they stop me on the road?]
  Not on the open road. Nobody guards that, which is the trouble with it. But Nose won't let a truck out of its own gate without a gun on it, so don't go up there unarmed.
  -> hub
+ {hattie_flats} [What about the glass at the Glass Flats?]
  Pim Arslan, who cuts lenses, says every ripple in it leans the same way, toward the Fallen Sun. That's the crater where the ship came down. My cousin says it points at heaven, but my cousin drinks.
  Sun or heaven, I won't stand on it at noon. The Sunward have their own opinion, mind. They worship whatever lies in that crater, and they'll share it with anyone who stands still.
  ~ note("talkGlassLean")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward} [Is it true the Sunward take strangers?]
  That's what they say. A stranger goes into the crater with the Sunward and doesn't come out. I say folk do come out, green at the edges and quiet.
  I've never followed one in. Water's for paying folk, not for asking.
  ~ note("talkSunwardTake")
  -> hub
+ [Goodbye.]
  Come back when you've coin for a bucket.
  -> END
