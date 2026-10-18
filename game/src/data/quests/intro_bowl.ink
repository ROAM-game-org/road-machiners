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
Drink it slow. A tow man brought you in at first light, you and the truck both. He found it dead out in the badlands with you slumped in the seat, and took it for a wreck nobody would come back for. He set you on my bench and drove off. No name, and no M's either. # speaker: Hattie
She nods at the chain on your bumper.
He left his chain on you, though. He'll be back for that, if not for you. # speaker: Hattie
Whatever they pulled out of your engine, the yard by the gate sells new, if you have the M's. You look like someone who eats first and pays later, so I'll put the grain on your slate. # speaker: Hattie
The water is cold and tastes of stone, and you drink it slow, because she's watching. A bowl of hot grain comes after it. # page
Hattie wipes her hands on her apron and waits, the way people wait who are paid by the question. # page
-> ask

= ask
# checkpoint: start.ask
She tips her head at you. Go on, then, she says. Nobody ever sat on my bench and had nothing to ask. # speaker: Hattie
-> questions

= questions
+ {not asked_where} [Where am I?]
  ~ asked_where = true
  <term=bowl>Bowl</term>. Farm town, if you can call it a town. Terraces down the inside of a crater, canals between them, and my well house at the bottom where the water ends up. # speaker: Hattie
  Everybody comes down here sooner or later, because everybody drinks. # speaker: Hattie
  -> questions
+ {towed_to_bowl and not asked_what} [What happened to me?]
  ~ asked_what = true
  I wasn't there, so take this for what it cost you. Somebody went through your engine on the road, took what was worth taking and left you breathing. # speaker: Hattie
  The tow man hung you on his chain and brought you here. After that it was my bench and my water. # speaker: Hattie
  -> questions
+ {not asked_next} [What do I do now?]
  ~ asked_next = true
  {towed_to_bowl:Eat. Then walk down to the yard by the gate and see what they'll take for an engine. After that, drive.|Water the truck, if you haven't. Then walk down to the yard by the gate and see what they'll take for what you carry. After that, drive.} # speaker: Hattie
  She looks you over, the dust, the neck, the empty hands.
  You've the look of a Machiner. A driver linked to a truck can make a living on any road. Haul for a town, work for a yard, and the M's come in. Whether you want to be one is your business. I only sell the water. # speaker: Hattie
  -> questions
+ {not asked_region} [What is out there?]
  ~ asked_region = true
  Roads, mostly. Towns on the roads, and the people who live off the people on the roads. Pick one and I'll tell you what I've heard. # speaker: Hattie
  -> questions
+ {asked_region and not asked_nose} [And Nose?]
  ~ asked_nose = true
  Up the north-east road, to <term=nose>Nose</term>. Soldiers, a workshop and a wall. They build the engines and the guns for half the basin, and they like a stranger better once he's bought one. # speaker: Hattie
  -> questions
+ {asked_region and not asked_yard} [And the yards?]
  ~ asked_yard = true
  Wherever trucks end up, there's a yard with a crane. Crews strip the dead ones and sell the pieces back to the live ones. Bring them scrap or bring them M's, they're not particular. # speaker: Hattie
  -> questions
+ {asked_region and not asked_kiln} [And the raiders?]
  ~ asked_kiln = true
  South, at <term=kiln>Kiln Camp</term>. Pay their fee and they let you haul. Don't pay and don't fight, and you drive home on your rims. # speaker: Hattie
  -> questions
+ {asked_region and not asked_flats} [And east?]
  ~ asked_flats = true
  The <term=glass_flats>Glass Flats</term>, and past them the <term=sunward>Sunward</term>. Nobody hauls there. Folk who go there for the lenses come back with good glass and fewer words. # speaker: Hattie
  -> questions
+ {not asked_tips} [Any advice?]
  ~ asked_tips = true
  Carry more water and fuel than you think you'll need, because the road is longer than it looks. # speaker: Hattie
  Stay near the towns while you're green. Lawmen ride the roads around their gates, and few start trouble in front of them. Out in the open nobody watches, and every driver carries a gun. # speaker: Hattie
  And if you do end up stranded, somebody will tow you for a fee, and a yard will patch you for scrap if you're broke. It's cheaper than walking. # speaker: Hattie
  -> questions
+ [I'll go.]
  {towed_to_bowl:Mind your slate. I don't forget a bowl of grain.|Come back when you've M's for a bucket.} # speaker: Hattie
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with flour on her forearms sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
Hattie, they call me, and that's the well, and that's the bench, and the water costs, so don't look at the bucket like it owes you. # speaker: Hattie
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
Water, grain, a word or two on the roads. That's what I sell. The word costs less than the grain, and I hear it twice as well. # speaker: Hattie
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. Somebody went through the engine and left the bolts where they fell.
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Back on my bench, and not on your own wheels this time. You get around, I'll give you that. # speaker: Hattie
She nods at the chain on your bumper.
A tow man brought you in at first light. He found your truck dead out in the badlands with you slumped in the seat, and took it for a wreck nobody would come back for. He left his chain on you, so he'll be back for that, if not for you. # speaker: Hattie
Whatever they pulled out of your engine, the yard by the gate sells new, if you have the M's. I'll put the grain on your slate. # speaker: Hattie
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
