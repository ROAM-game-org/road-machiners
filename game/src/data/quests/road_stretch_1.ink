# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The first fort north is a wall, a gate and a yard full of trucks waiting to be counted. # place: The first outpost # img: road_hauler
Hunters came out of the badlands this morning, and both trucks got through. Afterward you sat with your hands on the wheel and waited to feel something. What came was closer to disappointment than to anything else. You don't look at that too long.
The fort's clerk pays Ala the stretch's fee across his counter, and she counts your share into your hand out loud: {stretch_pay(1)} M's, one disc at a time, as if someone might argue. Every sum comes out level. # page
-> tougher

= tougher
# checkpoint: start.tougher
{ geezer_pitch == "link": A linked driver, and you're still the one driving when the shooting stops. # speaker: Ala }
{ geezer_pitch == "bullets": Six holes in you, and you keep being the one still driving. # speaker: Ala }
{ geezer_pitch == "none": You keep being the one still driving. # speaker: Ala }
You're tougher than you look. # speaker: Ala
She closes your fingers over the last M and does not look away. # page
You kept my truck on the road. So I'm asking once. The ring scar on your neck. What happened to your link? # speaker: Ala
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
That fire is years older than the mine that took your last truck. You haven't told it to anyone, and it comes out flat, as if somebody else said it.
Ala takes it in without looking away. She doesn't say she's sorry.
A burning seat, and you tore the plug out yourself. Not much of a story. It'll do. # speaker: Ala
A link seat is fitted to the man who sits in it. The wrong man in one burns, and you were the wrong man. You don't say that part.
-> maya

= dodged
Old, yes. # speaker: Ala
She turns the word over like an M she isn't sure about.
I said once. I meant once. # speaker: Ala
-> maya

= silent
You look at the gate, and then at your own boots. The Keepers count another truck in.
She waits the length of one count. Then another.
Fine. # speaker: Ala
It is not quite a refusal and not quite a favor.
-> maya

= maya
She puts the rest of the roll away, and for once she doesn't count it. # page
Since I asked you something, here is what I pay for. There's a girl at <term=the_yards>the Yards</term>, Maya, twelve years old. She drank the cheap water <term=blackwell>Blackwell</term> sold us this spring, and the fever hasn't broken. Water from the valley breaks it. Nothing else does. # speaker: Ala
She says it level, like a sum. It is the first thing she has told you that costs her something. # page
The salvagers who gave you the ride south said something else about her, in the cab, over the noise of the scrap. They said her father died on this road. It was sixteen years ago, they said, and nobody at the Yards would say how.
-> father

= father
Ala is looking at the gate again.
+ [The salvagers said your father died on the road.]
  ~ father_told = true
  -> asked
+ [Leave it.]
  -> left

= asked
She doesn't flinch. She turns her cuff over to hide the wax.
Jon. A linked tanker driver, like me. He was in the first water convoy Blackwell ever sent out. The <term=burnt_drivers>Burnt Drivers</term> took it at the pass, sixteen years ago, and nobody walked away. # speaker: Ala
You know the pass. You know which wall of it the sun leaves first, and where a convoy has to slow for the bend. You look at the Keepers' gate and count the trucks with them, one, two, three.
That's all of it. I don't say it twice. # speaker: Ala
-> close

= left
You don't ask. She nods at the gate, grateful and not saying so.
-> close

= close
# checkpoint: start.close
That evening the fort bar is full of drivers and smoke. Old bounty notices hang behind it, ink gone brown, with faces drawn on them, men the forts once wanted dead. You look them over out of habit, the way you check your gun pins. # page
The barman looks at you the way he looks at everyone, for what you might spend. He doesn't know your face. You pay for a cup anyway.
Across the room Ala is working out the next stretch's fuel on the back of a notice. She does it twice. {father_told: She does it a third time, and her pencil stops over one line.} # page
-> END
