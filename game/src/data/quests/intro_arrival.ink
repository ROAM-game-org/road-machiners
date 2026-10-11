# view: page
# stat: money M's
INCLUDE world.ink

VAR arrival_rope = false

=== start ===
# checkpoint: start
The canteen has been empty since dawn. You shake it by your ear anyway, as if the water might be hiding in there. It isn't. # place: The rim # img: arrival_rim
You have walked since the stars were out, and the sun has been burning through the cloth on your head since it came up. Walking east was stupid. Not that the west had anything better. Your shirt is stiff with salt, and your lips have split at the corners, and you try not to lick them, because that only makes it worse.
The rock you have been climbing all morning ends at an edge. Below it lies a basin so wide that the far side is only a paler line in the haze. # page
To the north a thin line might be a road. Past it, something in the haze might be a town, or might be the heat playing tricks again. It has done that twice today.
At the foot of the slope stands a water tower over a few roofs. No smoke, and nothing moves. But a tower means a well. Or it used to.
You go down sideways, heels dug in, and the stones slide out from under your boots and clatter away ahead of you. # page
Halfway down you stop sweating. You know what that means. If you sit down now, you might not get up, so you don't sit down.
Up close the tank is rusted brown and stands on thin iron legs. A gun mount is bolted to the rail at the top, with no gun in it. Somebody kept watch from up there, and then somebody stopped. # page # place: The farm
The house has lost its roof. The fence posts lean every which way, like drunks holding each other up. The goat pen holds dry droppings and no goats.
The tap under the tower squeals when you work the handle. The pipe coughs a thread of rust onto your boots and gives nothing else. You hold the handle down a while longer anyway, as if the pipe might change its mind.
A rope lies coiled beside the well, with a knot tied every arm's length.
Behind the tower, what's left of a shed has folded in on itself. Something long and square sits under the fallen roof sheet. The house is closer, though, and a house might have a jar of something in a corner.
-> farm

= farm
# checkpoint: start.farm
+ {not arrival_rope} [Drop the rope down the well.]
  -> rope
+ [Go into the house.]
  -> house
+ [Go to the shed.]
  -> shed

= rope
~ arrival_rope = true
You drop the end down the shaft and let it run through your hands until it goes slack. Then you haul it back up, knot by knot.
Not one knot is wet. Somebody measured water with this rope, back when there was water to measure.
-> farm

= house
# checkpoint: start.house
You step through the doorway into a room with no roof. Sand has drifted into the corners. A table and a stove are left, and a cot with no blanket. Whoever lived here took everything light enough to carry. # page # place: The house # img: arrival_house
+ [Look around.]
  -> look
+ [Go out to the shed.]
  -> shed

= look
~ give_money(50)
No jar of anything. The stove is cold and empty, and the table drawer holds a dead beetle. But under the cot, one floorboard sits a little higher than the rest, and when you get your fingers under it, it comes up with a squeak.
In the hollow lies a tobacco tin. Inside, wrapped in a strip of oilcloth, is a short stack of M's that clink when you lift the tin. Somebody hid this from somebody. Well, they're not here to argue.
You put it in your shirt and go out to the shed.
-> shed

= shed
Under the fallen roof sheet, in the shade, sits a pickup. # page # place: The farm # img: arrival_pickup
It's old and square, the kind of truck that outlives its owners. The sun has bleached the paint to the color of sand, and rust shows through it in patches. Bars are welded over the windows, and a heavy grille guard covers the lamps. The tires are soft but whole. A few empty cans roll around in the bed.
A machine gun stands on a turning mount on the hood, its barrel wrapped in rag against the dust. Two steel pins lock the mount. One pin is bright and new and the other worn dull, as if somebody fixed half a problem.
The hinge shrieks when you pull the door, and something small scrabbles out from under the bed. The cab smells of engine oil and old cigarettes. And the key is in the ignition. Just sitting there, with a brass tag on its ring, like somebody stepped out for a minute and meant to come right back.
Behind the seat there's a tin box, and in it a food ration wrapped in greased paper. Your stomach clenches at the sight of it. You hold it a while, then put it back in the box. Eat it now and it's gone. Keep it, and it might be the difference between reaching that town and not. # page
You twist the key. The starter grinds, slows and quits.
You twist it again. The engine catches for a breath, shakes the whole cab and dies. "Come on, you rusted pig," you tell it.
You lean your forehead on the hot wheel and wait. Then you try once more, and it coughs, misses, coughs again, and holds. It runs rough and lopsided, and the mirror shakes with it. It's the best sound you have heard in your life, or at least since the stars went out this morning.
You ease out of the shed. The roof sheet scrapes the length of the cab and slides off the tailgate, and the basin opens up in front of the hood. # page
The fuel needle sits a little under a quarter, and your tongue sticks to your teeth. The town in the haze had better be real, and it had better be close.
-> END
