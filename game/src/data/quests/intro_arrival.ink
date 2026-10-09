# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The canteen is empty. You shake it anyway. # place: The rim
Nothing slaps inside. The cap burns your fingers.
Heat lifts off the rock in sheets. Your shirt dried on you hours ago.
+ [Wipe your mouth.]
  ~ intro_step = "walk"
  Your lips are split. The back of your hand comes away gritty.
  -> rim
+ [Tuck the canteen away.]
  ~ intro_step = "walk"
  It knocks against your hip as you walk. The sound is hollow.
  -> rim

=== rim ===
# checkpoint: rim
The rock ends. You stop at the edge. # page
Below you the land opens wide and flat and pale. Dust hangs over it like breath on glass.
A thread of road runs through the dust. Far off, something stands up from the flat.
+ [Look back the way you came.]
  Only rock and the shimmer over it. Nothing there wants you back.
  -> slope
+ [Look down.]
  The slope is loose scree, a long way. Further down it is only dirt.
  -> slope

=== slope ===
# checkpoint: slope
You go down. Stones skate away from your boots. # page
The sun finds your neck and stays there. Sweat runs, then stops running.
Your tongue is thick. Every breath tastes of dust.
+ [Rest in the shade of a boulder.]
  The shade is thin as paper. You count your breaths until they slow, then you make yourself stand.
  -> farm
+ [Keep walking.]
  You do not stop. Stopping feels like something you would not get up from.
  -> farm

=== farm ===
# checkpoint: farm
The thing on the flat is a water tower. # page # place: The farm
It stands alone, red with rust, its tank on thin legs. Under it lies a farm nobody tends.
Fence posts lean. A house sits with its roof on its floor. A loose sheet of tin knocks in the wind.
+ [Try the tap on the tower.]
  It gives one cough and a thread of rust. Then nothing.
  -> shed
+ [Call out.]
  Your voice goes out and nothing sends it back.
  -> shed

=== shed ===
# checkpoint: shed
Behind the tower a shed has folded in on itself. # page
One wall leans on the other. Under the fallen roof sheet, something has wheels.
An old pickup. Dust to the windows. The tires are soft but whole.
+ [Pull the door open.]
  The hinge screams. A little cool air falls out of the cab.
  -> truck
+ [Wipe the glass first.]
  Behind the dust, the seat is sprung and the dash is bare. The key is in it.
  -> truck

=== truck ===
# checkpoint: truck
The seat is hot and smells of oil and old rope. # page
The key is in the dash, as if the last hand only stepped out.
You twist it. The starter grinds and quits.
You twist it again. The engine catches for a breath and dies.
The third time it starts. It coughs, misses, coughs again, and settles to a rough idle.
The whole cab shakes. It runs.
+ [Ease out of the shed.]
  ~ intro_step = "drive"
  The roof sheet scrapes along the cab. Then the light hits you, and the flat lies open all around.
  -> END
