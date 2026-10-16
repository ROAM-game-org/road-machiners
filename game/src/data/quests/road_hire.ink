# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_north = false
VAR asked_who = false

=== start ===
# checkpoint: start
The bar of the last fort before the empty road smells of diesel and wet wool. # place: The southern outpost
You sit with your back to the wall, which is how you've sat for thirty years. The <term=keepers>Keepers</term> count every truck through their gate and every man through their bar door, and so far nobody has counted you. A cup of something brown goes cold by your hand.
Two weeks ago you drove a truck that is now a black patch on the road, and the fort took you in only because you still had your boots. # page
At the next table, a woman counts brass out of a roll. She says each sum under her breath, flat and even, the way you'd read a gauge. Her coat has gone pale at the knees. A smear of red wax is still stuck to her cuff, thumbed flat, and an hour ago she came down from the Commandant's tower with a clerk bowing her out. Nobody bows to hired drivers.
Tibor, the barman, has pulled up a chair across from her. He sells the way other men sell spare axles.
Rode with Magnus, or says he did. The <term=burnt_drivers>Burnt Drivers</term>, if you're old enough to remember. Scars to prove it, and he takes the jobs nobody else will touch. # speaker: Tibor
The woman looks out of the window instead of at you. Your scout sits on the pad under the lamp, one gun on a mount, small as a dog. Behind it, the hauler fills the rest of the window, and the seal on its trailer door is the same red as the wax on her cuff. # page
That's what he drives? It wouldn't make a stretch. # speaker: Ala
-> pitch

= pitch
Tibor spreads his hands. Your move, he means. Ala still doesn't look at you. She wants a reason, so you decide what to show her first.
+ [Show her the link scar.]
  ~ geezer_pitch = "link"
  -> link_scar
+ [Show her the bullet scars.]
  ~ geezer_pitch = "bullets"
  -> bullet_scars

= link_scar
You turn your collar down and tilt your head. At the base of the skull, a ring of thick pale skin runs around a socket's worth of old burn, and the cords of the neck pull crooked around it. Most drivers get a clean contact. This one looks like it was fitted by a man who hated you.
Ala looks at it a good while. Her mouth tightens, and it isn't pity.
Linked. Deeper than I am. # speaker: Ala
You open your shirt too, because she is still frowning. -> both

= bullet_scars
You push up a sleeve, then open your shirt. Ribs, shoulder, forearm. Somebody started counting once and you stopped.
Ala counts for you. Her lips move on every one.
Six. # speaker: Ala
You turn your collar down for the last, since she's still frowning. The ring scar at the base of your skull makes her look away from the window at last. -> both

= both
# checkpoint: start.both
Link and lead, both on the table now, for what they're worth. # page
So you've been burned and shot, and you still drive a toy. Why? # speaker: Ala
She isn't being cruel. She's pricing you.
Fair question. Two weeks ago, on the road north of here, you drove a truck three times this one's size. The shell came through the engine bay, and there was one white second. Then you were lying in a ditch, watching the cab burn with the link still humming in your neck, as if the truck were calling you back in. # page
Somebody should have been dead in that ditch, and you've been sore about it since. You walked here on what was left of your boots.
You tell her so, in about that many words. The truck blew up. You didn't. Small is faster, and a small truck sees trouble before trouble sees it.
Ala listens with her chin on her fist. Tibor tries to look like he planned it. # page
Fine. Ask what you want, then. I'll answer what I answer. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
Ala flattens the roll of brass under her palm and waits. The bar goes on around you, loud and brown. # page
-> menu

= menu
+ {not asked_pay} [What does it pay?]
  ~ asked_pay = true
  By the stretch, fort to fort. {stretch_pay(1)} M's for the first, and {stretch_pay(2) - stretch_pay(1)} more for each one after. You keep my rig fitted out of it, and yours. I don't ask where the money goes. # speaker: Ala
  She pushes the sums across the table with one finger, in a neat row. She has done this before.
  -> menu
+ {not asked_north} [Why north?]
  ~ asked_north = true
  No questions. That's the price. # speaker: Ala
  She says it like a thing she has said many times, and it sounds exactly like a dodge. She isn't hiding that it's one.
  Tibor looks at his hands. Nobody in this fort will tell you what's up the road, and every one of them knows you didn't ask.
  -> menu
+ {not asked_who} [Who's coming for the truck?]
  ~ asked_who = true
  <term=blackwell>Blackwell</term> diesel is on that truck. Whoever brings the trailer back sealed gets paid at the refinery, and the driver comes back alive or dead, they don't care which. Every scavenger and out-of-work gun from here to the first ridge has heard. # speaker: Tibor
  Ala doesn't correct him. She looks at the wax on her cuff, and then she takes her hand off it.
  -> menu
+ [Sign on.]
  ~ ala_hired = true
  You put your hand flat on the table, and Ala puts hers over it for a second, which is how deals are done here. Tibor takes his cut from somewhere and is gone before the two of you have let go.
  First stretch at dawn. Count it when it comes. # speaker: Ala
  She goes out to the hauler. You go out to your scout and check both pins on the gun, the bright one and the worn one, before you sleep.
  -> END
