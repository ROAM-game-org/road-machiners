# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The twelfth fort has a lamp burning on every wall, and nobody has put one out in years. # place: The twelfth outpost
This stretch nearly took you both. The hauler's left side is stripped to the frame, and your scout is running on one good tire and a promise. You didn't plan to live through it. You never do.
Ala brings the relay slip to where you sit on the scout's bumper. The Oilmistress called the bounty off, it says. The hunters haven't stopped coming. # page
She reads the second slip aloud, in a flat voice. Two hundred people in old trucks have left the forts behind us, a day back, with nobody to guard them. The Keepers pushed them out the gate this morning. # page
Then she counts the pay out to you, brass by brass, and her hands aren't steady at all. The sum is exactly right. # page
You're free to go. The deal was by the stretch, and I owe you nothing past this one. Nobody would blame you. # speaker: Ala
She isn't asking you to stay. She is making sure you know the door is open. # page
-> fire

= fire
# checkpoint: start.fire
You don't answer. You are looking at the lamp on the wall, and the lamp makes you think of fire, and then of other fire. # page
A tank line, years ago. A row of dead army trucks in the dust, each seat wired to a dead man's nerves. You took the seat of the first one because you were Magnus, and Magnus took what he wanted. # page
It burned. Nobody had said it would burn the next man who sat in it. The seat took hold of your neck and began to cook the link out of you, and you heard yourself make a noise you had never made at anyone else's death.
Beside you a boy in the next truck was burning too, one of your own, the youngest, barely twenty. He was screaming, and then he was saying a name. # page
Magnus! The plug! Magnus! # speaker: Burnt Driver
You tore the plug out of your own seat with both hands, and that left the ring in your neck. You didn't go back for the boy. You walked into the badlands, and you never went back for anyone. # page
-> ask

= ask
# checkpoint: start.ask
Ala has been watching your face for a long time. She doesn't know what she's looking at. # page
That man at the gate. The one who knew a burn like yours. Who was he? # speaker: Ala
+ [I rode with the Burnt Drivers.]
  ~ ala_knows = "burnt"
  -> burnt
+ [Somebody dead.]
  ~ ala_knows = "dead"
  -> dead
+ [Magnus. I was Magnus.]
  ~ ala_knows = "magnus"
  -> magnus

= burnt
It comes out without the name. The Burnt Drivers, you tell her, and the tank line, and the winter.
The Burnt Drivers took Blackwell's first water convoy, sixteen years ago. They killed everyone with it. I was eighteen, at the gate, when the news came. # speaker: Ala
She says it as a plain fact. She doesn't ask whether you were there.
And you tore a plug out of a burning seat. That's the same man, then. Or the same road. # speaker: Ala
-> stay

= dead
Somebody dead, you say. It's even true.
There are a lot of those on this road. # speaker: Ala
But dead men don't make your hand shake. She lets it lie, because the road is long and she has learned how to leave things where they are.
-> stay

= magnus
The name is out before you can decide, and then it's in the air between you like a dropped tool.
Ala doesn't move. A long time passes, maybe three counts of the gate.
Magnus burned at the tank line. Tibor tells it every night, and the barmen of six forts. # speaker: Ala
Yes, you say. They tell it very well.
She looks at the scar. She looks at your hands. She does not say what she thinks, and for once she does not count anything.
-> stay

= stay
# checkpoint: start.stay
Out on the road, in the dark, two hundred people in old trucks are coming north behind her. You don't have a reason to give. You've looked for one all the way up the stretch, and what you have is a feeling like a seat belt. # page
You tell her you're staying. That's all you can say about it, and she doesn't ask for more. She nods once.
Same pay. # speaker: Ala
She counts it for the thirteenth stretch, {stretch_pay(13)} M's, out loud, and then she counts it again. You go and check the pins. # page
-> END
