# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The first fort north is a wall, a gate and a yard full of trucks waiting to be counted. # place: The first outpost
The truck that came for her out of the badlands this morning didn't get up. You went at it straight, the way you go at everything, and when it stopped moving you sat with your hands on the wheel and waited to feel something. What came was closer to disappointment than to anything else. You don't look at that too long.
Ala has the hauler's door open and one boot on the step. She counts the pay into your hand, in brass, out loud, and every sum is level. # page
-> tougher

= tougher
# checkpoint: start.tougher
{ geezer_pitch == "link": Ala: Linked that deep, and you put your bumper into a gun truck like it owed you money. # speaker: Ala }
{ geezer_pitch == "bullets": Ala: Six holes in you, and you drive straight at the muzzle. Count them again, you'd say. # speaker: Ala }
{ geezer_pitch == "none": Ala: You drove straight at a gun. # speaker: Ala }
You're tougher than you look. # speaker: Ala
She drops the last coin into your palm and closes your fingers over it. Then she doesn't let go. # page
You saved my life. So I'm asking once. The ring scar. What happened to your link? # speaker: Ala
-> ask

= ask
She waits. Behind her the Keepers' count goes on at the gate, truck by truck, in a flat voice.
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
That's more than you've said to a living person in years. You hear it come out of you in a flat voice.
Ala takes it in without looking away. She doesn't say she's sorry.
A seat, and a plug, and you did it yourself. All right. That's a sentence. # speaker: Ala
She lets go of your hand. -> close

= dodged
Old, yes. # speaker: Ala
She turns the word over like a coin she isn't sure about.
I said once. I meant once. # speaker: Ala
She lets go of your hand. -> close

= silent
You look at the gate, and then at your own boots. The Keepers count another truck in.
She waits the length of one count. Then another.
Fine. # speaker: Ala
She lets go of your hand, and it's not quite a refusal and not quite a favor. -> close

= close
# checkpoint: start.close
Old notices still hang behind the bar of this fort, ink gone brown, with faces on them. You look at them the way you look at pins, out of habit, and the barman looks at you the way he looks at everyone, for what you might spend. # page
He doesn't know your face. You pay for a cup anyway.
Ala counts the second stretch's fuel twice, out loud. You go and check the pins. # page
-> END
