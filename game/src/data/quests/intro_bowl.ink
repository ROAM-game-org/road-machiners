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
A broad woman with flour on her forearms sets a cup of water on the bench beside you. Then she sits down at the other end of it. # page
Slow sips, now. This well has other customers. # speaker: Hattie
A tow man left you on my bench at first light, asked only after a Varga woman, then drove off without leaving a name or any M's. # speaker: Hattie
She nods at the chain on your bumper.
Ruth Varga from the third terrace buys water here every morning with sorghum, but he didn't stay to find out if she was his Varga. # speaker: Hattie
The yard by the gate sells new parts for whatever they pulled out of your engine, if you've got the M's. You look like someone who eats first and pays later, so your grain goes on the slate. # speaker: Hattie
The water is cold and tastes of stone, and you drink it slow, because she's watching. A bowl of hot grain comes after it. # page
Hattie wipes her hands on her apron and waits, the way people wait who are paid by the question. # page
-> ask

= ask
# checkpoint: start.ask
She tips her head at you. Nobody ever sat on my bench with nothing to ask, she says. Go on, before you spend all day making it sound like one question. # speaker: Hattie
-> questions

= questions
+ {not asked_where} [Where am I?]
  ~ asked_where = true
  <term=bowl>Bowl</term>, if a few farms count as a town. The terraces run down the inside of the crater, with canals between them, and my well house sits at the bottom where the water ends up. # speaker: Hattie
  Everybody comes down here sooner or later because everybody drinks, though most customers reach the bench awake. # speaker: Hattie
  -> questions
+ {towed_to_bowl and not asked_what} [What happened to me?]
  ~ asked_what = true
  I wasn't there, but I heard somebody went through your engine on the road and took what was worth taking, leaving you breathing. # speaker: Hattie
  The tow man hung you on his chain and brought you here. Then it was my bench and my water, which is a fair bit of hospitality for someone who arrived without a working purse. # speaker: Hattie
  -> questions
+ {not asked_next} [What do I do now?]
  ~ asked_next = true
  {towed_to_bowl:Eat. Then walk down to the yard by the gate and see what they'll take for an engine. After that, drive.|Water the truck, if you haven't. Then walk down to the yard by the gate and see what they'll take for what you carry. After that, drive.} # speaker: Hattie
  She looks you over, the dust, the neck, the empty hands.
  You've the look of a Machiner, once you get some food under that dusty neck. Haul for a town or work for a yard and the M's come in. Whether you want to be one is your business. I only sell the water. # speaker: Hattie
  -> questions
+ {not asked_region} [What is out there?]
  ~ asked_region = true
  Roads, mostly, with towns along them and people who live off whoever drives past. Pick a road, love, and I'll tell you what I've heard. # speaker: Hattie
  -> questions
+ {asked_region and not asked_nose} [And Nose?]
  ~ asked_nose = true
  <term=nose>Nose</term> is up the north-east road, with soldiers, a workshop and a wall. They build engines and guns for half the basin, and you'll find yourself much better company once you've bought one. # speaker: Hattie
  -> questions
+ {asked_region and not asked_yard} [And the yards?]
  ~ asked_yard = true
  Wherever trucks end up, there's a yard with a crane, and a crew stripping the dead ones to sell the pieces back to the live ones. They take scrap or M's, and they won't ask why you're buying your own door back. # speaker: Hattie
  -> questions
+ {asked_region and not asked_kiln} [And the raiders?]
  ~ asked_kiln = true
  They live south at <term=kiln>Kiln Camp</term>, where they sell you permission to haul. Pay their fee, or fight, or drive home on your rims. # speaker: Hattie
  -> questions
+ {asked_region and not asked_flats} [And east?]
  ~ asked_flats = true
  East is the <term=glass_flats>Glass Flats</term>, then the <term=sunward>Sunward</term>, and nobody hauls there. Folk go for lenses and come back with good glass and fewer words, which might improve you, but I'd try listening first. # speaker: Hattie
  -> questions
+ {not asked_tips} [Any advice?]
  ~ asked_tips = true
  Carry more water and fuel than you think you need, because the road looks short when it wants your business. # speaker: Hattie
  Stay near towns while you're green, where lawmen ride the roads around the gates and few care to start trouble in front of them. Out in the open nobody watches, and every driver carries a gun. # speaker: Hattie
  If you get stranded, somebody will tow you for a fee, and a yard will patch you up for scrap if you're broke. Cheaper than walking, unless those boots of yours make water. # speaker: Hattie
  -> questions
+ [I'll go.]
  {towed_to_bowl:Mind your slate, love. I remember a bowl of grain long after you stop being grateful for it.|Come back when you've got M's for a bucket, and we'll put that thirsty face to use.} # speaker: Hattie
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with flour on her forearms sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
I'm Hattie, that's the well, and that's the bench. Sitting is free, water costs, and that bucket owes you nothing. # speaker: Hattie
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
I sell water, grain and a word or two on the roads. The word costs less than the grain, and I hear it twice as well, once from the man going out and once when he comes back blaming the road. # speaker: Hattie
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. Somebody went through the engine and left the bolts where they fell.
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Back on my bench, and not on your own wheels this time. You do get around. # speaker: Hattie
She nods at the chain on your bumper.
Same as last time, the tow man set you here at first light and asked only about the Varga woman, Ruth, up on the third terrace, who buys water every morning. He didn't stay to find out whether she was his Varga. # speaker: Hattie
The yard by the gate sells new parts to replace what was pulled from your engine, and I'll put the grain on your slate. # speaker: Hattie
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
