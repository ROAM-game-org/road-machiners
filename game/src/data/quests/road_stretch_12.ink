# view: page
INCLUDE world.ink

VAR stay_said = "none"
VAR pass_said = false

=== start ===
# checkpoint: start
The twelfth fort keeps a lamp burning on every wall all night. # place: The twelfth outpost # img: road_hauler
This stretch nearly killed you both. The hauler's left side is stripped to the frame, and your scout is running on one good tire. You didn't expect to live through it. You never do.
Ala counts the stretch's pay into your hand out loud, {stretch_pay(12)} M's, one disc at a time, and her hands are not steady. Then she brings the fort's relay slips to where you sit on the scout's bumper. # page
The first says Hedda Vell shut Blackwell's gates and sent every fort her confession. She sold the Yards bad water and knew it, it says. She was afraid, and that was all the truth she had left. There is no word on the reward. The hunters are owed diesel by a town that won't open to them, and nobody has told them to stop. They will keep coming, and the bar still says the trailer holds the cure. # page
The second says the people are on the road. The <term=keepers>Keepers</term> pass them north from fort to fort and feed them where they stop. The Warden will open Northgate's gate when they come. A hunter named Vale, who hunted this truck for eight stretches and lost two trucks to it, turned back with her one truck and holds the road behind them. The slip quotes her. # page # img: road_walkers
Any crew wants these families, they come through me first. # speaker: Vale
The last line of the slip is short. Maya rides with them, days back, and there is not a gun among them. # page
-> free_to_go

= free_to_go
There is a last slip, from the Keepers' own relay. Ala reads it out in the voice she uses for sums. # page
The Keepers say your escort wears a Burnt Driver's burn. Keep the road clear for the families behind you. # speaker: Keepers' relay
Ala folds the slips and puts them away. # page
You're paid up, and by the deal you're free to go. I won't hold you. # speaker: Ala
She doesn't say it as if she means it. She says it as if she's reading it.
-> fire

= fire
# checkpoint: start.fire
You don't answer. You look at the lamp on the wall, and the lamp makes you think of fire, and then of other fire. # page # img: road_tankline
A tank line, years ago: a row of dead army trucks left in the dust where the army left them. Every truck still had its link seat, fitted to the man who drove it and died in it. Plug into a seat that wasn't yours, and it burned you. You took the first one anyway, because you were Magnus, and Magnus took what he wanted. # page
The seat took hold of your neck and began to cook the socket out of you. You heard yourself scream.
Your drivers followed you into the other seats, one truck after another, because Magnus had gone first and Magnus was never wrong. By the time you screamed, each was already plugged into a seat that was not his. In the next truck, close enough to hear through both hulls, sat the youngest, barely twenty, burning, one of your own. He was screaming too, and then he was saying a name. # page
Magnus! The plug! Magnus! # speaker: Burnt Driver
You tore the plug out of your own seat with both hands. That left the ring in your neck. You didn't go back for the boy. You walked out into the badlands, and you have been walking away ever since. # page
Before the tank line there was the pass, in the years when Magnus never lost. A line of tankers slowed for the bend, and the first cab had a linked man in it, who looked up at the ridge. You gave the order. Afterward you walked down the line, and not one of the cabs had a living man in it. # page
-> ask

= ask
# checkpoint: start.ask
Ala has been watching your face for a long time. She doesn't know what she's looking at. # page # img: road_ala
At the eighth fort, an old Keeper looked at your neck and said he knew a man with a burn like that. Now the Keepers say that burn is a Burnt Driver lieutenant's. My father was driving that convoy at the pass. Were you there when it was taken? # speaker: Ala
+ [I rode with the Burnt Drivers. Your father died to us.]
  ~ ala_knows = "burnt"
  -> burnt
+ [Somebody dead.]
  ~ ala_knows = "dead"
  -> dead
+ [I led them. My name was Magnus.]
  ~ ala_knows = "magnus"
  -> magnus

= burnt
It comes out without the name. You rode with the Burnt Drivers, you tell her, and they took and killed on this road until the winter that ended them. Her father died to them.
{ father_told:
  I told you how he died. I didn't tell you that I'd know the man if I met him. # speaker: Ala
- else:
  Sixteen years. I was eighteen, at the Yards, when the news came. # speaker: Ala
}
She says it as a plain fact.
I won't ask whether you were at the pass. If you were, tell me before you leave, not after. # speaker: Ala
{ ring_told == "told":
  You told me about a burning seat, and now this. It adds up. # speaker: Ala
- else:
  So that's what the scar is. # speaker: Ala
}
-> pass_pick

= pass_pick
+ [I was at the pass.]
  ~ pass_said = true
  You say it and nothing else. You don't say whose order, and she doesn't ask. Her hand closes on her cuff, and opens again.
  Then you owe me the rest. Not tonight. # speaker: Ala
  -> stay
+ [Say nothing.]
  You say nothing, and she lets you.
  -> stay

= dead
Somebody dead, you say. The man the Keeper knew is dead, in a way. It is the truest lie you have.
There are a lot of those on this road. # speaker: Ala
But your hand did not shake at a stranger. She lets it lie, because the road is long and she has learned to leave things where they are.
-> stay

= magnus
You say it, and it sits between you on the step.
Ala doesn't move for a long time.
Magnus burned in his seat at the tank line. Tibor tells it every night, and the barmen of six forts. # speaker: Ala
Yes, you say. They tell it very well.
She looks at the scar. She looks at your hands. She does not ask about the pass, and you do not say it. You both know where the road narrows.
-> stay

= stay
# checkpoint: start.stay
She should send you away. You can see her know it, and you can see her do the sum. # page
Out on the road, days behind, a girl with a fever is riding north among two hundred people with no gun. You are one gun on one good tire. Against what hunts them, that is nothing. It is what there is. # page
So. Are you riding on? # speaker: Ala
-> say

= say
+ [I'm riding on.]
  ~ stay_said = "plain"
  You say it flat, the way you say everything. She nods once.
  I thought so. # speaker: Ala
  -> close
+ {promised} [Until Maya drinks from the spring.]
  ~ stay_said = "people"
  You said it once, at the fourth fort, and you say it again. Her hands are steadier than they were.
  Then we're both fools. # speaker: Ala
  -> close
+ [Same pay, then.]
  ~ stay_said = "pay"
  A pause, and then something that is nearly a laugh.
  Same pay. # speaker: Ala
  -> close
+ [Say you ought to leave.]
  ~ stay_said = "left"
  You tell her you ought to go. It is true. It just isn't the reason.
  Ought to. Not the same as will. # speaker: Ala
  She leaves the gate of the yard standing open behind her, in case. You don't use it.
  -> close

= close
# checkpoint: start.close
{ ala_knows == "burnt":
  She looks at the scar again.
  { pass_said: I'm paying the man in front of me, and I'll want the rest of it. # speaker: Ala }
  { not pass_said: I'm paying the man in front of me, whoever he rode with. # speaker: Ala }
}
{ ala_knows == "dead": She doesn't ask who the dead man was. She has learned to leave things where they lie. }
{ ala_knows == "magnus":
  She puts her hand flat on the step to steady herself.
  Then Tibor tells it wrong. Good. # speaker: Ala
}
{ hand_shook: You remember your hand shaking against the scar at the eighth fort, and you keep it flat on your knee now. }
Later you sit up on the wall, facing south, where two hundred people are driving in the dark. No lights show on the road, and you look anyway. # page
{ ala_knows == "dead": Ala climbs up with one cup, sets it down between you, and says nothing about the dead man. }
{ ala_knows == "burnt": Ala climbs up with two cups. She sits a little way off. }
{ ala_knows == "magnus":
  Ala climbs up with two cups and sits close enough to touch.
  Tell me the rest some night. Not tonight. # speaker: Ala
}
The next stretch pays {stretch_pay(13)} M's. Drink first. # speaker: Ala
-> END
