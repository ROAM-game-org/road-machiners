# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_north = false
VAR asked_who = false
VAR asked_trailer = false
VAR walked_out = false

=== start ===
# checkpoint: start
The bar of the last fort before the empty road smells of diesel and wet wool. # place: The southern outpost
You sit with your back to the wall, which is how you've sat for thirty years. The <term=keepers>Keepers</term> who hold this fort write down every truck through the gate and every man through the bar door. You're in their book as a name and a night's rent, nothing more.
Two weeks ago you drove a truck that is now a black patch on the road. You walked here, and the fort's yard sold you a scout, the smallest thing on four wheels, for nearly all the M's you had left. # page
At the next table, a woman counts M's out of a roll, brass discs each stamped with an M. She says every sum under her breath, flat and even, the way you'd read a gauge. Her coat has gone pale at the knees. A smear of red wax is still stuck to her cuff, and an hour ago she came down from the Commandant's tower with a clerk bowing her out. Nobody bows to hired drivers.
Tibor, the barman, has pulled up a chair across from her. He sells men the way other men sell spare axles.
Rode with Magnus, they say, and the scars say so too. The <term=burnt_drivers>Burnt Drivers</term>, if you're old enough to remember. He takes the jobs nobody else will touch. # speaker: Tibor
The woman looks out of the window instead of at you. Your scout sits on the pad under the lamp with one gun on its mount, small as a dog. Behind it the hauler fills the rest of the window, a mammoth eighteen-wheeler, and the seal on its trailer door is the same red as the wax on her cuff. # page
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
So you've been burned and shot, and you still drive a toy. Why? # speaker: Ala # page
She isn't being cruel. She's pricing you.
Fair question. Two weeks ago, on the road north of here, you drove a truck three times the size of this one. A shell came through the engine bay, and there was one white second. Then you were lying in a ditch, watching your cab burn while the link in your neck still hummed, as if the truck were calling you back in. # page
You should have been dead in that ditch, and you've been sore about it since.
You tell her so, in about that many words. The truck blew up. You didn't. The scout was what the yard had left, and a small truck is quick, and sees trouble before trouble sees it.
Ala listens with her chin on her fist. Tibor tries to look like he planned all this. # page
Fine. Ask what you want. I'll answer what I answer. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
Ala stacks her M's in front of her and waits. The bar goes on around you, loud and brown. # page
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
  Sealed. By the Keepers, and they don't seal for nothing. That's all I know that I'll say, and it's more than they told me. # speaker: Ala
  She says it too quickly. Tibor, for once, has nothing to add.
  -> menu
+ {not asked_north} [Why north?]
  ~ asked_north = true
  No questions about that. That's the price of the job. # speaker: Ala
  She says it like something she has said many times, and it sounds exactly like a dodge. She doesn't try to hide that it's one.
  Tibor suddenly finds something interesting in his hands. He sold you the job, not the road.
  -> menu
+ {not asked_who} [Who's coming for the truck?]
  ~ asked_who = true
  <term=blackwell>Blackwell</term> wants that truck. The refinery posted a reward in diesel. Whoever brings the trailer back sealed gets it, and nobody there cares if the woman driving it comes back alive or dead. Every scavenger and out-of-work gun from here to the first ridge has heard. # speaker: Tibor
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
  You put your hand flat on the table, and Ala puts hers over it for a second, which is how deals are done here. She slides Tibor his finder's fee without looking, and he is gone before the two of you have let go.
  First stretch at dawn. You're paid at the next fort's gate. # speaker: Ala
  She goes out to the hauler. You go out to your scout and check the two pins that lock the gun mount. A loose pin will swing your own gun into your cab. Then you sleep.
  -> END
