# view: page
INCLUDE world.ink

VAR stay_said = "none"

=== start ===
# checkpoint: start
The twelfth fort keeps a lamp burning on every wall all night. # place: The twelfth outpost
This stretch nearly killed you both. The hauler's left side is stripped to the frame, and your scout is running on one good tire. You didn't expect to live through it. You never do.
Ala counts the stretch's pay into your hand out loud, {stretch_pay(12)} M's, coin by coin, and her hands are not steady. Then she brings the fort's relay slips to where you sit on the scout's bumper. # page
The first says Hedda Vell has called off the reward on the truck. Ala reads on. The hunters were promised diesel and nobody has told them to stop, and the bar talk says the trailer carries Blackwell's secret. They will keep coming. # page
The second says the well crews, who were shut in Blackwell's yard, broke out and reached the southern forts, and the Keepers passed them through toll-free. Two hundred people in old trucks, families and all, are on the open road north, a day behind us, and not a gun among them. # page
The hunters are all around us. The people are a day behind us, and they have no gun. # speaker: Ala
She folds the slips and waits. # page
-> fire

= fire
# checkpoint: start.fire
You don't answer. You look at the lamp on the wall, and the lamp makes you think of fire, and then of other fire. # page
A tank line, years ago: a row of dead army trucks left in the dust where the army left them. Every truck still had its link seat, fitted to the man who drove it and died in it. Plug into a seat that wasn't yours, and it burned you. You took the first one anyway, because you were Magnus, and Magnus took what he wanted. # page
The seat took hold of your neck and began to cook the socket out of you. You heard yourself scream.
The boys followed. They had not heard you scream yet, and by the time they did, each was already strapped into a seat that was not his either. In the next truck, close enough to hear through both hulls, sat the youngest, barely twenty, burning, one of your own. He was screaming too, and then he was saying a name. # page
Magnus! The plug! Magnus! # speaker: Burnt Driver
You tore the plug out of your own seat with both hands. That left the ring in your neck. You didn't go back for the boy. You walked out into the badlands, and you have been walking away ever since. # page
-> ask

= ask
# checkpoint: start.ask
Ala has been watching your face for a long time. She doesn't know what she's looking at. # page
At the eighth fort, an old Keeper looked at your neck and said he knew a man with a burn like that. Who was that man? # speaker: Ala
+ [A man I rode with. A Burnt Driver.]
  ~ ala_knows = "burnt"
  -> burnt
+ [Somebody dead.]
  ~ ala_knows = "dead"
  -> dead
+ [Me. My name was Magnus.]
  ~ ala_knows = "magnus"
  -> magnus

= burnt
It comes out without the name. You rode with the Burnt Drivers, you tell her, and they ended at the tank line, in one winter.
The Burnt Drivers took a Blackwell water convoy, sixteen years ago. They killed everyone who was with it. I was eighteen, at the gate, when the news came. # speaker: Ala
She says it as a plain fact.
I won't ask whether you were there. If you were, tell me before you leave, not after. # speaker: Ala
{ ring_told == "told":
  You told me about a burning seat. I can add. # speaker: Ala
- else:
  So that's what the scar is. # speaker: Ala
}
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
She looks at the scar. She looks at your hands. She does not say what she thinks.
-> stay

= stay
# checkpoint: start.stay
Out on the dark road, two hundred people in old trucks are coming north behind her. You are one gun on one good tire. Against what hunts them, that is nothing. It is what there is. # page
So. Are you riding on? # speaker: Ala
-> say

= say
+ [I'm staying.]
  ~ stay_said = "plain"
  You say it flat, the way you say everything. She nods once.
  I thought so. # speaker: Ala
  -> close
+ [I'm staying for the people behind us.]
  ~ stay_said = "people"
  You can't say more than that, and you don't try. Her hands are steadier than they were.
  Then we're both fools. # speaker: Ala
  -> close
+ [Same pay, then.]
  ~ stay_said = "pay"
  A pause, and then something that is nearly a laugh.
  Same pay. # speaker: Ala
  -> close
+ [Say you ought to leave.]
  ~ stay_said = "left"
  You tell her you ought to go. It is the nearest you can come to the truth that is not the truth.
  Ought to. Not the same as will. # speaker: Ala
  -> close

= close
# checkpoint: start.close
{ ala_knows == "burnt":
  She looks at the scar again.
  I'm paying the man in front of me, whoever he rode with. # speaker: Ala
}
{ ala_knows == "dead": She doesn't ask who the dead man was. She has learned to leave things where they lie. }
{ ala_knows == "magnus":
  She puts her hand flat on the step to steady herself.
  Then Tibor tells it wrong. Good. # speaker: Ala
}
Later you sit up on the wall, facing south, where two hundred people are driving in the dark. No lights show on the road, and you look anyway. # page
{ ala_knows == "dead": Ala climbs up with one cup, sets it down between you, and says nothing about the dead man. }
{ ala_knows == "burnt": Ala climbs up with two cups. She sits a little way off. }
{ ala_knows == "magnus":
  Ala climbs up with two cups and sits close enough to touch.
  Tell me the rest some night. Not tonight. # speaker: Ala
}
The next stretch pays {stretch_pay(13)} M's. Drink first. # speaker: Ala
-> END
