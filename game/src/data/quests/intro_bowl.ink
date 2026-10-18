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
The bed is empty. Somebody went through the engine and left the bolts where they fell. Well. At least they left you the truck.
A broad woman with wet hands and rolled sleeves sets a cup of water on the bench beside you. Then she sits down at the other end of it. # page
Slow sips, driver. You've been towed enough for one morning. # speaker: Hattie
A tow man left you on my bench at first light, asked after a Varga woman, and left no name or M's. # speaker: Hattie
She nods at the chain on your bumper.
Ruth Varga lives on the third terrace, but your tow man didn't wait to find out if she was the Varga he wanted. # speaker: Hattie
The yard by the gate sells parts for that engine of yours, and I'll put the grain on your slate. # speaker: Hattie
The water is cold and tastes of stone, and you drink it slow, because she's watching. A bowl of hot grain comes after it. # page
Hattie wipes her hands on her apron and waits, the way people wait who are paid by the question. # page
-> ask

= ask
# checkpoint: start.ask
She tips her head at you. Go on, ask your questions before I put you to work. # speaker: Hattie
-> questions

= questions
+ {not asked_where} [Where am I?]
  ~ asked_where = true
  You're in <term=bowl>Bowl</term>, a farm town, and you're drooling on my bench. Bowl's built on terraces down the inside of a crater, with canals between them. # speaker: Hattie
  You're in the gate yard, which is as much of Bowl as we show strangers. # speaker: Hattie
  -> questions
+ {towed_to_bowl and not asked_what} [What happened to me?]
  ~ asked_what = true
  Heard they took your engine and left you the truck to swear at. # speaker: Hattie
  Tow man brought you here on his chain. # speaker: Hattie
  -> questions
+ {not asked_next} [What do I do now?]
  ~ asked_next = true
  {towed_to_bowl:Eat, ask at the gate yard what they'll take for an engine, then drive.|Water your truck, see what they'll give for your load in the gate yard, then give those wheels something to do.} # speaker: Hattie
  She looks you over, the dust, the neck, the empty hands.
  You look like a Machiner, so haul for a town or find a yard that'll pay you. Whether you want to be one is your business. # speaker: Hattie
  -> questions
+ {not asked_region} [What is out there?]
  ~ asked_region = true
  Roads lead to towns, towns need water, and that's where you come in. Pick a place, driver, and I'll tell you what I've heard. # speaker: Hattie
  -> questions
+ {asked_region and not asked_nose} [And Nose?]
  ~ asked_nose = true
  <term=nose>Nose</term> is up the north-east road, with soldiers, a wall, and a workshop turning out engines and guns for half the basin. Strangers get a welcome as long as they're buying. # speaker: Hattie
  -> questions
+ {asked_region and not asked_yard} [And the yards?]
  ~ asked_yard = true
  Anywhere with a crane and a dead truck, selling you the bits yours is missing. They take scrap or M's, and anything worth more than your sad story. # speaker: Hattie
  -> questions
+ {asked_region and not asked_kiln} [And the raiders?]
  ~ asked_kiln = true
  <term=kiln>Kiln Camp</term>, south of here, and they charge you for the right to haul. If you won't pay and won't fight, you'll be walking back. # speaker: Hattie
  -> questions
+ {asked_region and not asked_flats} [And east?]
  ~ asked_flats = true
  <term=glass_flats>Glass Flats</term>, then the <term=sunward>Sunward</term>; people go for lenses, nobody hauls. Lens hunters bring back good glass and bad burns. # speaker: Hattie
  -> questions
+ {not asked_tips} [Any advice?]
  ~ asked_tips = true
  Take more water and fuel than you reckon you need, green as you are. # speaker: Hattie
  Stay near towns till you know your wheels from your elbows; lawmen ride the roads round the gates. Past the patrols, every driver's got a gun and nobody's paid to keep them polite. # speaker: Hattie
  Break down and the tow costs coin, the repairs cost scrap, and walking costs you. # speaker: Hattie
  -> questions
+ [I'll go.]
  {towed_to_bowl:Safe road, and that slate won't clear itself.|Come back when you've got M's for water, and try to keep all your wheels.} # speaker: Hattie
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with wet hands and rolled sleeves sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
I'm Hattie, this is my well, and I heard your truck before I saw it. # speaker: Hattie
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
I sell drinking water, radiator water, and enough sense to keep them in separate cans. # speaker: Hattie
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. Somebody went through the engine and left the bolts where they fell.
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Back on my bench, and still letting someone else do the driving. # speaker: Hattie
She nods at the chain on your bumper.
Your tow man asked about Ruth Varga, who buys water here every morning, then left before he found out if she's the Varga he wants. # speaker: Hattie
The yard by the gate sells engine parts, and the grain goes on your slate. # speaker: Hattie
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
