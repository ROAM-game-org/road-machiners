# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_north = false
VAR asked_who = false
VAR asked_trailer = false
VAR walked_out = false

=== start ===
# checkpoint: start
The bar of the last fort before the empty road smells of diesel and wet wool. # place: The southern outpost # img: road_bar
You sit with your back to the wall, which is how you've sat for thirty years. The <term=keepers>Keepers</term> who hold this fort write down every truck through the gate and every man through the bar door. You're in their book as a name and a night's rent, nothing more.
Two weeks ago you drove a truck up the north road that is now a black patch beside a crater. Somebody had buried a mine for somebody else's wheels, and yours were first. A crew of salvagers came out from <term=the_yards>the Yards</term> to strip what was left, and they gave you a ride south on top of the scrap. They talked the whole way about an old hauler and the woman who drives it. # page
The fort's yard sold you a scout, the smallest thing on four wheels, for nearly all the M's you had left.
At the next table, a woman counts M's out of a roll, brass discs each stamped with an M. She says every sum under her breath, flat and even, the way you'd read a gauge. Her coat has gone pale at the knees. A smear of red wax is still stuck to her cuff, and an hour ago she came down from the Commandant's tower with a clerk bowing her out. Nobody bows to hired drivers. # img: road_ala
Tibor, the barman, has pulled up a chair across from her. He sells men the way other men sell spare axles.
Rode with Magnus, they say, and the scars say so too. The <term=burnt_drivers>Burnt Drivers</term>, if you're old enough to remember. He takes the jobs nobody else will touch. # speaker: Tibor # img: road_geezer
The bar has talked of nothing else since noon. The trailer on the pad carries the cure, they say, for the <term=black_water>black-water sickness</term>, and every man with a gun and a debt has put down his cup to think about that. # page # img: road_hauler
A woman with a hunter's hands sits down at Ala's table without being asked. She doesn't look at Ala. She looks out of the window at your scout.
That scout's got one driver. One. # speaker: Vale
Out. # speaker: Ala
She says it with two fingers lifted, as if shooing a fly. The hunter goes, slowly, and takes her time over the door. # page
The woman looks out of the window instead of at you. Your scout sits on the pad under the lamp with one gun on its mount, small as a dog. Behind it the hauler fills the rest of the window, a mammoth eighteen-wheeler, and the seal on its trailer door is the same red as the wax on her cuff. # img: road_hauler
That's what he drives? A toy like that won't last a stretch, fort to fort. # speaker: Ala
-> pitch

= pitch
Tibor spreads his hands. Your move, he means. She wants a reason to hire you, and you have two. The burn at your neck says the link went deep in you, and you lived. The bullet scars say you have been shot at and kept driving. Which one does she hear first?
+ [Show her the burn on your neck.]
  ~ geezer_pitch = "link"
  -> link_scar
+ [Show her the bullet scars.]
  ~ geezer_pitch = "bullets"
  -> bullet_scars

= link_scar
You turn your collar down and tilt your head. A linked driver has a socket at the base of the skull. The cable from the seat plugs into it, and the truck answers like an arm. Around yours runs a ring of thick pale skin, where the flesh once cooked around the metal.
When she bent over the M's you saw her own socket under her hair, small and clean. She looks at yours a good while. Her mouth tightens, and it isn't pity.
Linked. Deeper than I am. # speaker: Ala
She doesn't need you to open your shirt. The old holes show through the torn cloth at your ribs, and she counts them anyway. -> both

= bullet_scars
You push up a sleeve, then open your shirt. Ribs, shoulder, forearm. Somebody started counting the holes once, and you stopped.
Ala counts them for you. Her lips move on every one.
Six. # speaker: Ala
You shrug your shirt closed, and your collar slips. The ring of old burn around the socket at the base of your skull shows, where a seat's cable plugs in. She looks at it a good while. -> both

= both
# checkpoint: start.both
{ geezer_pitch == "link": It's the burn she's been reading, you can tell. The bullets are only a bonus. }
{ geezer_pitch == "bullets": It's the bullets she's been counting, you can tell. The burn is a question she hasn't asked yet. }
So you've been burned and shot, and you still drive a toy. Why? # speaker: Ala # page # img: road_geezer
She isn't being cruel. She's pricing you.
Fair question. Two weeks ago, on the road north of here, you drove a truck three times the size of this one. The ground under the front axle went up, and there was one white second. Then you were lying in a ditch, watching your cab burn while the link in your neck still hummed, as if the truck were calling you back in. # page
You should have been dead in that ditch, and you've been sore about it since.
You tell her so, in about that many words. The truck blew up on a mine. You didn't. The scout was what the yard had left, and a small truck is quick, and sees trouble before trouble sees it.
Ala listens with her chin on her fist. Tibor tries to look like he planned all this. # page
Fine. Ask what you want. I'll answer what I answer. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
Ala stacks her M's in front of her and waits. The bar goes on around you, loud and brown. # page # img: road_ala
-> menu

= menu
+ {not asked_pay} [What does it pay?]
  ~ asked_pay = true
  I drive the hauler. You ride ahead and take what comes. I pay by the stretch, fort to fort: {stretch_pay(1)} M's for the first, and {stretch_pay(2) - stretch_pay(1)} more for each stretch after that. # speaker: Ala
  Fuel, repairs, guns, tires: they come out of that, for my rig and for yours. It covers both, if you're careful. You front the first stretch yourself, from what you have left. # speaker: Ala
  She pushes three stacks across the table with one finger, to show you what the first three stretches pay: {stretch_pay(1)}, {stretch_pay(2)}, {stretch_pay(3)}. It is only a demonstration. The M's are paid at the far gate.
  -> menu
+ {not asked_trailer} [What's in the trailer?]
  ~ asked_trailer = true
  Sealed. The Commandant's wax. That's all I'll say, and it's all the Commandant said to me. # speaker: Ala
  She says it too quickly. Tibor, for once, has nothing to add.
  -> menu
+ {not asked_north} [Why north?]
  ~ asked_north = true
  Somebody's waiting on it. No more questions than that. # speaker: Ala
  She says it like something she has said many times, and it sounds like a dodge. The crack in it is somebody's name.
  Tibor suddenly finds something interesting in his hands. He sold you the job, not the road.
  -> menu
+ {not asked_who} [Who's coming for the truck?]
  ~ asked_who = true
  <term=blackwell>Blackwell</term> wants that truck. The refinery posted a reward in diesel for the crates, and nobody there cares what state the driver's in. # speaker: Tibor
  And half this bar thinks there's a cure in there. Those would come for it with no reward at all. # speaker: Tibor
  Ala doesn't correct him. She turns her cuff over so the wax doesn't show.
  -> menu
+ {asked_pay and not walked_out} [Hold out for more.]
  ~ walked_out = true
  You tell her it isn't enough, and you stand up.
  Then go. # speaker: Ala
  She doesn't look up. You get as far as the door. Outside it is raining, and the scout sits on the pad with everything you own in it, which is nothing. You can barely pay for the scout, you have no pay yet and you have no other road. You stand there a while with the water running down your collar.
  When you come back in, nobody has moved. Ala is still counting. Tibor is still smiling.
  I'd have thought less of you if you hadn't tried. The offer is the offer. Sit down. # speaker: Ala
  -> menu
+ [Sign on.]
  ~ ala_hired = true
  You put your hand flat on the table, and Ala puts hers over it for a second, which is how deals are done here.
  I know who you rode with. I don't care. # speaker: Ala
  She says it loud enough for the whole bar, and the whole bar hears it. She slides Tibor his finder's fee without looking, and he is gone before the two of you have let go.
  First stretch at dawn. You're paid at the next fort's gate. # speaker: Ala
  She goes out to the hauler. You go out to your scout and check the two pins that lock the gun mount. A loose pin will swing your own gun into your cab. Then you sleep.
  -> END
