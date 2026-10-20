# view: page
INCLUDE world.ink

VAR asked_pay = false

=== start ===
# checkpoint: start

This is not the worst bar you have seen. Far from it. # place: The southern outpost # img: road_bar

Still, you sit with your back to the wall. But force of habit.

You reminisce about the beautiful truck you drove just two weeks ago. Now it is nothing but a black patch beside a crater. All it takes is one unlucky landmine. As if there is such a thing as a lucky landmine.

What's really lucky is that a crew of salvagers came out to strip what was left. They had good manners and gave you a ride south on top of the black scrap. The fort's yard had no manners and ripped you off on a scout pick-up. # page

Still, this bar is not the worst thing to see after a landmine, and the tinnitus is almost gone.

You glance at a table across the room. The table, the one attracting the most attention here.

It houses two: Tibor, the barman, and a woman. A linked woman driver is rare, but not unheard of.
The conversation they are having is evidently not going well. More obviously so when the woman glances your way. And then Tibor turns around in his chair to wave for you. You two go way back, though not exactly friends.

As you approach, you hear a piece of a phrase.

"Yes, but if you knew who he rode with..." # speaker: Tibor

Hastily cut short at the sound of your heavy boots. Tibor's eyes are welcoming, but, as always, a little watery and darting in your presence. Like a ferret's. You saw a ferret in a book, once. 

Ala is ? # img: road_ala # page

The woman takes a moment to size you up, but then her eyes go past you, out of the window, to the pad under the lamp. Your scout is parked there. Next to it stands the biggest hauler you have seen in years, a mammoth eighteen-wheeler, and your scout looks like a pup next to it. 

The great machine and the tiny woman that drives it have been the talk of the fort. Both were rare to find around the Northern Road. People here are more landmine-oriented, which doesn't attract the prettiest women. # img: road_hauler # page

"This pickup can barely cover two wheels of my Bertha." # speaker: Ala

She is not wrong. You had the same thought when the yard took your M's. She is also not speaking to you, which grates your nerves. 

"It's not about the truck, it's about the man, Ala. Geezer is straight edge. In your situation, there is no one better." # speaker: Tibor

Must be a shit situation then. But you keep your mouth shut, for now. Tibor has sold your services before, he is good at it.

Finally, Ala does not look at the trucks, or Tibor. She looks at you.

"I need protection up North. Far North. I can pay by the stretch, but the job is tough. Can you handle it?" # speaker: Ala
-> pitch

= pitch
Tibor spreads his hands. Your move, he means. She wants a reason to hire you, and you have two. 
+ [Show her the burn.]
  ~ geezer_pitch = "link"
  -> link_scar
+ [Show her the scars.]
  ~ geezer_pitch = "bullets"
  -> bullet_scars

= link_scar
You turn your collar down and tilt your head. A linked driver has a socket at the base of the skull. The cable from the seat plugs into it. Around yours runs a ring of thick pale skin, where the flesh once cooked around the metal.
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
Ala stacks her M's in front of her and waits. # page # img: road_ala
-> menu

= menu
+ {not asked_pay} [What does it pay?]
  ~ asked_pay = true
  I drive the hauler. You ride ahead and take what comes. I pay by the stretch, fort to fort: {stretch_pay(1)} M's for the first, and {stretch_pay(2) - stretch_pay(1)} more for each stretch after that. # speaker: Ala
  Fuel, repairs, guns, tires: they come out of that, for my rig and for yours. It covers both, if you're careful. The first stretch's fuel comes out of what you have left. After that, the pay carries you. # speaker: Ala
  She pushes three stacks across the table with one finger, to show you what the first three stretches pay: {stretch_pay(1)}, {stretch_pay(2)}, {stretch_pay(3)}. It is only a demonstration. The M's are paid at the far gate.
  -> menu
+ [Sign on.]
  ~ ala_hired = true
  You put your hand flat on the table, and Ala puts hers over it for a second, which is how deals are done here.
  I know who you rode with. I don't care. # speaker: Ala
  She says it loud enough for the whole bar, and the whole bar hears it. She slides Tibor his finder's fee without looking, and he is gone before the two of you have let go.
  First stretch at dawn. You're paid at the next fort's gate. # speaker: Ala
  She goes out to the hauler. You go out to your scout and check the wheel nuts on every wheel. A loose nut will put a wheel in the ditch. Then you sleep.
  -> END
