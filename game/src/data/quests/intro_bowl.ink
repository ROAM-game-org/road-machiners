# view: page
INCLUDE world.ink

VAR asked_where = false
VAR asked_what = false
VAR asked_next = false
VAR asked_region = false
VAR asked_nose = false
VAR asked_yard = false
VAR asked_kiln = false
VAR asked_flats = false
VAR asked_tips = false

=== start ===
# checkpoint: start
Somewhere close, a bucket is coming up a well on a creaking rope. You lie still and listen to it for a while, because it is the best sound in the world. # place: Bowl # img: bowl_yard
You're lying on a bench under a roof of woven reeds. Past the shade run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
You sit up, and your head swims, then settles. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper. It has a brass tag on it, the same kind as the one on your key. # page
The bed is empty. {engine_missing(): Somebody went through the engine and left the bolts where they fell.|Somebody went through the cab and the toolbox, but the engine is still bolted in.} Well. At least they left you the truck.
A broad woman with wet hands and rolled sleeves sets a cup of water on the bench beside you. Then she sits down at the other end of it. # page
Slow sips, driver. You've been on that chain all morning. # speaker: Hattie
The tow man left you on my bench at first light. He took your truck for a wreck nobody would come back for. He left no name and no M's. # speaker: Hattie
She nods at the chain on your bumper.
He left his chain on your bumper, though. He'll be back for it, if not for you. # speaker: Hattie
{engine_missing(): The yard by the gate sells parts for that engine. I'll put the grain on your slate.|The yard by the gate buys what you carry. I'll put the grain on your slate.} # speaker: Hattie
The water is cold and tastes of stone, and you drink it slow, because she's watching. A bowl of hot grain comes after it. # page
Hattie wipes her hands on her apron and waits. # page
-> ask

= ask
# checkpoint: start.ask
She tips her head at you. Ask your questions now, before I put you to work. # speaker: Hattie
-> questions

= questions
+ {not asked_where} [Where am I?]
  ~ asked_where = true
  <term=bowl>Bowl</term>. Farm town, built down the inside of a crater. Terraces, with canals between them. # speaker: Hattie
  You're in the gate yard. That's as much of Bowl as strangers get. # speaker: Hattie
  -> questions
+ {towed_to_bowl and not asked_what} [What happened to me?]
  ~ asked_what = true
  {engine_missing(): Heard they took your engine and left you the truck to swear at.|Heard a raider went through your truck and left the engine alone. Count yourself lucky.} # speaker: Hattie
  Tow man brought you here on his chain. # speaker: Hattie
  -> questions
+ {not asked_next} [What do I do now?]
  ~ asked_next = true
  {towed_to_bowl:{engine_missing(): Eat first. Then ask at the gate yard what they'll take for an engine.|Eat first. Then sell what you carry at the gate yard.}|Water the truck first. See what the gate yard gives you for that load. Then put those wheels to work.} # speaker: Hattie
  She looks you over, the dust, the neck, the empty hands.
  You look like a Machiner. Haul for a town, or find a yard that pays. Whether you want to be one is your business. # speaker: Hattie
  -> questions
+ {not asked_region} [What is out there?]
  ~ asked_region = true
  Roads lead to towns, and towns need water. Pick a place, driver, and I'll tell you what I've heard. # speaker: Hattie
  -> questions
+ {asked_region and not asked_nose} [And Nose?]
  ~ asked_nose = true
  <term=nose>Nose</term> is up the north road. Soldiers at the wall, and a workshop turning out engines and guns for half the basin. Strangers get in if they're buying. # speaker: Hattie
  -> questions
+ {asked_region and not asked_yard} [And the yards?]
  ~ asked_yard = true
  Anywhere there's a crane and a dead truck, there's a yard. They sell you the bits yours is missing, for scrap or M's. # speaker: Hattie
  -> questions
+ {asked_region and not asked_kiln} [And the raiders?]
  ~ asked_kiln = true
  <term=kiln>Kiln Camp</term> is east of here. They charge you for the right to haul. If you won't pay and won't fight, you'll be walking back. # speaker: Hattie
  -> questions
+ {asked_region and not asked_flats} [And east?]
  ~ asked_flats = true
  East is the <term=glass_flats>Glass Flats</term>, then the <term=sunward>Sunward</term>. People go for lenses, and nobody hauls. Lens hunters come back with good glass and bad burns. # speaker: Hattie
  -> questions
+ {not asked_tips} [Any advice?]
  ~ asked_tips = true
  Carry more water and fuel than you think you'll need. # speaker: Hattie
  Stay near towns till you know your truck. Lawmen ride the roads round the gates. Past the patrols, every driver's got a gun, and nobody's paid to keep them polite. # speaker: Hattie
  Break down and the tow costs coin, the repairs cost scrap. Walking costs you. # speaker: Hattie
  -> questions
+ [I'll go.]
  {towed_to_bowl:Safe road. That line on my slate won't clear itself.|Come back when you've got M's for water. Keep all your wheels till then.} # speaker: Hattie
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with wet hands and rolled sleeves sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
I'm Hattie, this is my well. I heard your truck before I saw it. # speaker: Hattie
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
Drinking water's in this can. Radiator water's in that one. Mind which goes in your mouth. # speaker: Hattie
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. {engine_missing(): Somebody went through the engine and left the bolts where they fell.|Somebody went through the cab and the toolbox, but the engine is still bolted in.}
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Back on my bench again. You're still letting someone else do the driving. # speaker: Hattie
She nods at the chain on your bumper.
Another tow man, another chain. He'll be back for this one too. # speaker: Hattie
{engine_missing(): The yard by the gate sells engine parts. The grain goes on your slate.|The yard by the gate buys what you carry. The grain goes on your slate.} # speaker: Hattie
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
