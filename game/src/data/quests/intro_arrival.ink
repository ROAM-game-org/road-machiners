# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
Sand and dust, the faded spotlight of the sun, and not a blade of grass in sight. For days now. # place: The rim
You shake the canteen beside your ear anyway. You emptied it at dawn and you've known it was empty all morning, but the hand stopped listening to the head a while back. The cap is too hot to hold. Your shirt dried stiff with salt hours ago, and it hasn't been wet since.
+ [Wipe your mouth.]
  ~ intro_step = "walk"
  Your lips are split at the corners. The back of your hand comes away gritty and a little pink. Funny thing, the drier you get, the more you think about your own mouth.
  -> rim
+ [Tuck the canteen away.]
  ~ intro_step = "walk"
  It knocks against your hip with every step, a hollow little sound. Some company, alright.
  -> rim

=== rim ===
# checkpoint: rim
The rock you've been climbing all morning just ends, and past the edge the world falls away into a basin. A big one. The far side is a paler line in the haze, and that's being generous. # page
Dust hangs over the flat like it has nowhere better to be. Way off to the north a thin line runs through it that might be a road. Past that the haze thickens around something that might be a town, or might be your eyes, seeing things.
Right below you, at the foot of the slope, a water tower stands over a scatter of roofs. No smoke, and nothing moves. But a water tower is a water tower.
+ [Look back the way you came.]
  Rock and shimmer, same as yesterday, same as the day before. Whatever you left back there isn't coming after you. Nothing back there has the water for it.
  -> slope
+ [Look down the slope.]
  Loose scree most of the way, then hard dirt, then the tower. Going down beats going back. It always has.
  -> slope

=== slope ===
# checkpoint: slope
You go down sideways, the way you'd go down a roof. The stones skate out from under your boots and clatter on long after you've passed, and your knees crack at every step. # page
The sun settles on the back of your neck and drills. For a while you sweat. Then you stop sweating, and you know well enough that the second part is the bad part.
+ [Rest in the shade of a boulder.]
  The shade is thin as paper. You sit in it anyway and count your breaths until they slow. Then you make yourself stand, before sitting starts to feel like a plan.
  -> farm
+ [Keep walking.]
  You don't stop. Sit down now and you might decide to stay, and be one with the scree by evening. Not under this goddamn sun.
  -> farm

=== farm ===
# checkpoint: farm
Up close the tower is taller than it looked from the rim. The tank has rusted the color of dried blood, and it stands on legs so thin you wonder why it hasn't walked off in the wind. # page # place: The farm
The farm around it has been handed back to the dust. Fence posts lean every way but the one they were set. The house has let its roof down onto its floor. Somewhere a loose sheet of tin knocks against something, slow and patient, like it's waiting for you to leave.
+ [Try the tap under the tower.]
  The handle shrieks. The pipe coughs once, spits a thread of rust onto your boots, and that's all it has. You hold it open a while longer anyway. Hope is a stupid habit, and you've kept it longer than most.
  -> shed
+ [Call out.]
  Your voice goes out across the yard, cracked and smaller than you meant it. Nothing sends it back. Just as well. Out here, whoever answers usually wants your boots.
  -> shed

=== shed ===
# checkpoint: shed
Behind the tower stands what's left of a shed, grey boards folded in on themselves like a tired animal lying down for the last time. # page
Under the fallen roof sheet, out of the sun, sits a pickup. An old one, older than anyone you've known, from back when trucks were built square and heavy and meant to outlive the people who drove them. The grille is flat, with a pair of round lamps set in it like patient eyes. Whatever color it was, the sun took it years ago and left the dull primer underneath.
The tires are soft but whole. The bed is boxed in with welded plate. Behind the cab a machine gun sits on a swivel, its barrel wrapped in rag against the dust and its mount held down by a pair of fat steel pins. Somebody loved this truck, or was very afraid. Out here that's mostly the same thing.
+ [Pull the door open.]
  The hinge screams loud enough to send something small scrabbling out from under the bed. Air rolls out of the cab, warm and close, and still cooler than the yard. Anything to get out of the sun.
  -> truck
+ [Wipe the windshield first.]
  Your palm leaves a clean arc in the dust. Behind it there's a bench seat split and patched with tape, a dash of bare metal, and the key, still standing in the ignition. Somebody meant to come back.
  -> truck

=== truck ===
# checkpoint: truck
The bench seat is hot through your trousers. It smells of engine oil, old rope and somebody else's tobacco. The key sits in the ignition like the owner stepped out for a minute, and the minute went on for years. # page
You twist it. The starter grinds, slows and quits.
You twist it again. The engine catches for the length of a breath, shakes the whole cab and dies. You call the truck something you'd never say to a person.
You rest your forehead on the hot rim of the wheel and wait. Then you twist it a third time. It coughs, misses, coughs again, and holds, settling into a rough, lopsided idle that rattles the mirror and the loose glass in the door. Best sound you've heard in days. Maybe in years.
+ [Ease out of the shed.]
  ~ intro_step = "drive"
  The roof sheet scrapes the length of the cab and slides off the tailgate. Then the light hits the windshield, and the whole basin lies open in front of the hood. Sand and dust, the spotlight of the sun. Only now you've got wheels.
  -> END
