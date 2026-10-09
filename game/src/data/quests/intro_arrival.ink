# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
You shake the canteen beside your ear out of habit, though you emptied it at dawn and have known it was empty all morning. # place: The rim
The cap is too hot to hold for long. Heat comes up off the bare rock in slow sheets, and the shirt on your back dried stiff with salt hours ago and has not been wet since.
+ [Wipe your mouth.]
  ~ intro_step = "walk"
  Your lips are split in the corners, and the back of your hand comes away gritty and faintly pink.
  -> rim
+ [Tuck the canteen away.]
  ~ intro_step = "walk"
  It knocks against your hip with every step, a hollow little sound that keeps you company whether you want it or not.
  -> rim

=== rim ===
# checkpoint: rim
The rock you have been climbing all morning ends at an edge, and beyond the edge the world drops away into a basin so wide that its far side is only a paler line in the haze. # page
Dust hangs over the flat like breath on cold glass. Far to the north a thin line runs through it that could be a road, and past that, too far to tell, the haze thickens around something that might be a town or might be nothing at all.
Below you, at the very foot of the slope, a single water tower stands over a scatter of roofs. Nothing moves down there, and no smoke rises.
+ [Look back the way you came.]
  Behind you there is only rock and the shimmer over it, the same as yesterday and the day before. Whatever you left back there, it is not coming after you.
  -> slope
+ [Look down at the slope.]
  It is loose scree most of the way, a long tilted field of it, then hard dirt, then the tower.
  -> slope

=== slope ===
# checkpoint: slope
You go down sideways, the way you would go down a roof, and the stones skate away from your boots and clatter on long after you have passed. # page
The sun settles on the back of your neck and stays there. For a while you sweat, and then you stop sweating, and you know that the second part is the bad part.
+ [Rest in the shade of a boulder.]
  The shade is no thicker than paper. You sit in it anyway and count your breaths until they slow, and then you make yourself stand before sitting starts to feel like a good idea.
  -> farm
+ [Keep walking.]
  You do not stop. Some part of you understands that if you sit down now you may decide not to get up.
  -> farm

=== farm ===
# checkpoint: farm
Up close, the tower is taller than it looked from the rim, its tank rusted the color of dried blood and held up on legs so thin that you wonder why it has not walked off in the wind. # page # place: The farm
Around it a farm has been given back to the dust. Fence posts lean at every angle but the one they were set at, the house has let its roof down onto its floor, and a loose sheet of tin knocks against something in a slow and patient rhythm.
+ [Try the tap under the tower.]
  The handle gives with a shriek. The pipe coughs once, spits a thread of rust onto your boots, and gives nothing else, however long you hold it open.
  -> shed
+ [Call out.]
  Your voice goes out across the yard, cracked and smaller than you meant it, and nothing sends it back.
  -> shed

=== shed ===
# checkpoint: shed
Behind the tower stands what is left of a shed, a frame of grey boards that has folded in on itself like a tired animal lying down. # page
Under the fallen roof sheet, out of the sun, there is a pickup. It is an old one, older than anyone you have known, built back when trucks were made square and heavy and meant to outlive their owners. The nose is a flat grille with a pair of round lamps set into it like patient eyes, and the paint has gone from whatever color it once was to the dull bare primer of something the sun has had for many years.
The tires are soft but whole. The bed is boxed in with welded plate, and a machine gun sits on a swivel behind the cab, its barrel wrapped in rag against the dust, its mount bolted down with a pair of heavy pins.
+ [Pull the door open.]
  The hinge screams loud enough to send something small scrabbling out from under the bed. A breath of air rolls out of the cab, warm and close, but cooler than the yard.
  -> truck
+ [Wipe the windshield first.]
  Your palm leaves a clean arc in the dust. Behind it the bench seat is split and patched with tape, the dash is bare metal, and the key is still standing in the ignition.
  -> truck

=== truck ===
# checkpoint: truck
The bench seat is hot through your trousers and smells of engine oil, old rope and someone else's tobacco, and the key is in the ignition as if whoever owned this only stepped out for a moment and forgot to come back. # page
You twist it. The starter grinds, slows and quits.
You twist it again. The engine catches for the length of a breath, shudders the whole cab, and dies.
You wait, with your forehead resting on the hot rim of the wheel, and you twist it a third time. It coughs, misses, coughs again, and then it holds, settling into a rough and lopsided idle that rattles the mirror and the loose glass in the door. It is the best sound you have heard in days.
+ [Ease out of the shed.]
  ~ intro_step = "drive"
  The roof sheet scrapes the length of the cab and slides off the tailgate behind you. Then the light hits the windshield, and the whole empty basin lies open in front of the hood.
  -> END
