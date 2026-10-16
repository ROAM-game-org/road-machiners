# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The first fort north is a wall, a gate and a yard full of trucks waiting to be counted. # place: The first outpost
A truck came for the hauler out of the badlands this morning, and it never got back up. You went at it straight, and when it stopped moving you sat with your hands on the wheel and waited to feel something. What came was closer to disappointment than to anything else. You don't look at that too long.
The fort's clerk pays Ala the stretch's fee across his counter, and she counts your share into your hand out loud: {stretch_pay(1)} M's, one disc at a time, as if someone might argue. Every sum comes out level. # page
-> tougher

= tougher
# checkpoint: start.tougher
{ geezer_pitch == "link": A linked driver, and you put your bumper into a gun truck like it owed you something. # speaker: Ala }
{ geezer_pitch == "bullets": Six holes in you, and you still drive straight at the muzzle. # speaker: Ala }
{ geezer_pitch == "none": You drove straight at a gun. # speaker: Ala }
You're tougher than you look. # speaker: Ala
She closes your fingers over the last M and does not look away. # page
You saved my life. So I'm asking once. The ring scar on your neck. What happened to your link? # speaker: Ala
-> ask

= ask
She waits. Behind her the Keepers count trucks through the gate, one by one, in a flat voice.
+ [A seat was burning. I pulled the plug out myself.]
  ~ ring_told = "told"
  -> told
+ [Old wound.]
  ~ ring_told = "dodged"
  -> dodged
+ [Say nothing.]
  ~ ring_told = "silent"
  -> silent

= told
That fire is years older than the truck that burned two weeks ago. You haven't told it to anyone, and it comes out flat, as if somebody else said it.
Ala takes it in without looking away. She doesn't say she's sorry.
A burning seat, and you tore the plug out yourself. Not much of a story. It'll do. # speaker: Ala
A link seat is fitted to the man who sits in it. The wrong man in one burns, and you were the wrong man. You don't say that part.
-> close

= dodged
Old, yes. # speaker: Ala
She turns the word over like an M she isn't sure about.
I said once. I meant once. # speaker: Ala
-> close

= silent
You look at the gate, and then at your own boots. The Keepers count another truck in.
She waits the length of one count. Then another.
Fine. # speaker: Ala
It is not quite a refusal and not quite a favor.
-> close

= close
# checkpoint: start.close
That evening the fort bar is full of drivers and smoke. Old bounty notices hang behind it, ink gone brown, with faces drawn on them, men the forts once wanted dead. You look them over out of habit, the way you check your gun pins. # page
The barman looks at you the way he looks at everyone, for what you might spend. He doesn't know your face. You pay for a cup anyway.
Across the room Ala is working out the next stretch's fuel on the back of a notice. She does it twice. # page
-> END
