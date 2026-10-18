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
At the foot of the slope a water tank stands on legs over a few low roofs. No smoke, and nothing moves. But a tank means a pump, and a pump means a well. Or it used to.
You go down sideways, heels dug in, and the stones slide out from under your boots and clatter away ahead of you. # page
Halfway down you stop sweating. You know what that means. If you sit down now, you might not get up, so you don't sit down.
-> farm

= farm
# checkpoint: start.farm
Up close the tank is rusted brown and stands on thin iron legs. A gun mount is bolted to the rail at the top, with no gun in it. Somebody kept watch from up there, and then somebody stopped. # page # place: The pump shack
Trucks used to stop here for water on the way down from the rim. A tin pump shack stands under the tank, and a depot office leans against its wall with its roof fallen in. Empty drums lie in the dirt where the trucks filled up. The fence posts lean every which way, like drunks holding each other up.
The pump in the shack squeals when you work the handle. The pipe coughs a thread of rust onto your boots and gives nothing else. You hold the handle down a while longer anyway, as if the pipe might change its mind.
A rope lies coiled beside the well head, with a knot tied every arm's length.
Behind the shack, what's left of a shed has folded in on itself. Something long and square sits under the fallen roof sheet. The office is closer, though, and an office might have a jar of something in a corner.
-> yard

= yard
+ {not arrival_rope} [Drop the rope down the well.]
  -> rope
+ [Go into the office.]
  -> house
+ [Go to the shed.]
  -> shed

= rope
~ arrival_rope = true
You drop the end down the shaft and let it run through your hands until it goes slack. Then you haul it back up, knot by knot.
Not one knot is wet. Somebody measured water with this rope, back when there was water to measure.
-> yard

= house
# checkpoint: start.house
You step through the doorway into a room with no roof. Sand has drifted into the corners. A table and a stove are left, and a cot with no blanket, where whoever kept the pump slept between trucks. They took everything light enough to carry. # page # place: The office # img: arrival_house
+ [Look around.]
  -> look
+ [Go out to the shed.]
  -> shed

= look
~ give_money(50)
No jar of anything. The stove is cold and empty, and the table drawer holds a dead beetle. But under the cot, one floorboard sits a little higher than the rest, and when you get your fingers under it, it comes up with a squeak.
In the hollow lies a tobacco tin. Inside, wrapped in a strip of oilcloth, is a short stack of brass coins, each stamped with a big M, that clink when you lift the tin. Somebody hid this from somebody and never came back for it. Their loss.
You put it in your shirt and go out to the shed.
-> shed

= shed
# checkpoint: start.shed
Under the fallen roof sheet, in the shade, sits a pickup. # page # place: The pump shack # img: arrival_pickup
It's old and square, the kind of truck that outlives its owners. The sun has bleached the paint to the color of sand, and rust shows through it in patches. Bars are welded over the windows, and a heavy grille guard covers the lamps. The tires are soft but whole. A few empty cans roll around in the bed.
A machine gun stands on a turning mount on the hood, its barrel wrapped in rag against the dust. One heavy bolt locks the mount, its head gone brown with rust.
The hinge shrieks when you pull the door, and something small scrabbles out from under the bed. The cab smells of engine oil and old cigarettes. And the key is in the ignition. Just sitting there, with a brass tag on its ring, like somebody stepped out for a minute and meant to come right back.
Then you see the driver's seat, and you forget about the key. # page # img: cab_link
It is deep and padded in dark leather. Down the middle of the backrest runs a row of small pale knobs, each with a gold dot in its center, right where a spine would lie. At the top they run up into a hard headrest of pale ceramic and dark metal. Where the back of a driver's skull would rest, it holds a round plug ringed with fine gold pins. Two hinged metal clamps stand open on either side of it, for the neck. Braided cables run out of the back of it and down through the floor.
Everything else in this truck is rust and patches. The seat is smooth, careful work, the kind nobody can do anymore.
You know what it is. It's a <color=rust>link</color>. It joins a driver's nerves to the truck, so the truck becomes an extension of their body. Or the body an extension of the truck, depending on who you ask. The people who drive linked for a living are called <color=rust>Machiners</color>. On the roads in the west you watched them roll past for years.
You have never sat in one. They say the first time is the worst, and it gets easier once your body gets used to it.
Behind the seat, between the cables, there's a tin box, and in it a food ration wrapped in greased paper. Your stomach clenches at the sight of it. But dry food with no water only makes the thirst worse, and you have no water. You put it back in the box for later.
+ [Sit down and close the clamps.]
  -> link

= link
You climb in and sit back. Even in the shade the leather has soaked up the day's heat, and it burns through your shirt. The knobs press into your back in a hard line, all the way up your spine from the small of your back to the base of your skull. You lean your head back onto the plug, and the gold pins bite at the base of your skull. You close the clamps around your neck and wait. # page
Nothing happens. You sit with your hands on the wheel and feel stupid. Maybe it's broken, like everything else at this pump.
Then your back starts to <shake>tingle</shake>, like a foot that went to sleep and is waking up. The tingling crawls up to the base of your skull and down your arms to the tips of your fingers.
Then the truck is there, all of it at once, and it's <pop>too much</pop>. # page # speed: slow # reveal: word
The gun on the hood is a heavy fifth arm you never knew you had, stiff in the shoulder where the mount sticks. It's indescribable, but you can feel that the fuel tank is nearly empty. Not like hunger or anything else in your body. It's a totally different feeling, outside yourself, like seeing a new color. The engine, the gearbox, the axles and every loose bolt come the same way, each one a new color, all at once.
You grip the wheel with both hands and breathe through your teeth. <shake>It doesn't stop. It keeps coming, more than one head can hold.</shake> # speed: slow # reveal: word
And then, <pause>slowly, <pause>it settles. <pause>The new colors sort themselves out and stop shouting. The truck is simply there, the way your hands are there when you aren't looking at them. # page # reveal: word
You feel whole, as if a piece of you had been missing all your life and you never noticed. # speed: slow # reveal: word
<now>You twist the key.</now> <pause><pause>The starter grinds, and you feel the tired battery behind it. It slows and quits. # page # reveal: char
<pause><now>You twist it again.</now> <pause>The engine catches for a breath, kicks once like a second heart and dies. # reveal: char
You lean your forehead on the hot wheel and wait. Then you try once more, and it coughs, misses, coughs again, <pause>and holds. <pause>It runs rough and lopsided, and you feel every missed beat of it. It's the best sound you have heard in your life, or at least since the stars went out this morning. # reveal: word
You don't have to think about the pedals. Your feet find them on their own, and the truck rolls forward because you want it to. The roof sheet scrapes the length of the cab and slides off the tailgate. The basin opens up in front of the hood. # page
The fuel needle sits a little under a quarter. You didn't need to look, because you can feel the empty tank. Your tongue sticks to your teeth. The town in the haze had better be real, and it had better be close.
-> END
