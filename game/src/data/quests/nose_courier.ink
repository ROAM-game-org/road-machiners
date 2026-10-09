# view: page
# stat: money Money
# fact: vesna_said Vesna: Kiln riders take the trucks that run alone. A new rider holds the south bend this season.
# fact: letter_seen Mail bag: a thick letter capped with a Burnt Convoy tin seal, addressed to Karl Vosk, care of Kiln Camp.
# fact: drinkers_said Green Pit tables: the new Kiln rider asked what the courier bag carries. He had never seen the Guild paint.
INCLUDE world.ink

VAR vesna_said = false
VAR letter_seen = false
VAR drinkers_said = false
VAR met_vesna = false
VAR asked_gun = false
VAR gun = false
VAR riding = false
VAR result = "none"
VAR toll = 30
VAR reward = 60
VAR lost_share = 40

=== start ===
# checkpoint: start
{
  - result != "none" or courier_fate != "none": -> after_loop
  - riding: -> post
}
Tamsin Roe leans on the fender of a truck with a blue stripe, reading a letter that is not hers. # place: Guild post, Nose
She folds it away when she sees you.
You are the one the Guild sent. # speaker: Tamsin
Vesna Hale rides behind me, always. She has the rifle and I have the wheel. # speaker: Tamsin
Vesna is down with fever. The south loop will not wait for her. # speaker: Tamsin
Pump Station, South Lock, Green Pit and home. The Guild pays for the whole loop. # speaker: Tamsin
Hear this first. I carry no gun. Not for you, not for Vesna, not for the Guild. # speaker: Tamsin
-> hub

= hub
# checkpoint: start.hub
+ {not asked_gun} [Why no gun?]
  ~ asked_gun = true
  Kiln riders know my truck. They let it pass, and they let it pass because it is unarmed. # speaker: Tamsin
  I read what people carry. Nobody ever wrote home that a gun made them braver. # speaker: Tamsin
  -> hub
+ [I will ride behind you.]
  ~ riding = true
  Good. Go and see Vesna if you like. She knows the road better than I do. # speaker: Tamsin
  -> post
+ [Not this loop.]
  Then Vesna goes out sick. Tell her yourself. # speaker: Tamsin
  -> END

=== post ===
# checkpoint: post
The bay smells of oil and cold tea. Tamsin checks the strap on the mail bag. # page # place: Guild post, Nose
+ {not met_vesna} [See Vesna first.]
  -> vesna
+ {not letter_seen} [Ask to see the mail bag.]
  -> bag
+ [Ride out.]
  -> road

=== vesna ===
~ met_vesna = true
~ vesna_said = true
~ note("courierVesna")
Vesna lies in a room above the radio shack with a blanket to her chin. A rifle rests across the chair. # place: Above the radio shack
She watches the window, not you.
Kiln riders take the trucks that run alone. # speaker: Vesna
A new one rides the south bend this season. I never saw his face. I saw his truck, and it carried a Brann swivel. # speaker: Vesna
Tamsin thinks her paint is a wall. It is paint. # speaker: Vesna
Take the rifle. Hang it on a hook when you drink, and bring it back to me. # speaker: Vesna
+ [Take Vesna's rifle.]
  ~ gun = true
  She shuts her eyes. Her hand stays on the chair arm a moment after the rifle is gone.
  -> post
+ [Leave it with her.]
  Then you ride bare, like her. I hope the paint is enough. # speaker: Vesna
  -> post

=== bag ===
~ letter_seen = true
~ note("courierLetter")
Tamsin loosens the strap and lets you look. She carries other people's letters for free, and she reads every one. # place: Guild post, Nose
Most are small. A mother to a son at South Lock. A bill from a welder. A note for the Pump Station with only a date on it.
One thick envelope is capped with a Burnt Convoy tin seal. It is addressed to Karl Vosk, care of Kiln Camp.
Nobody writes to Kiln, so I carry it. # speaker: Tamsin
Someone wrote to him once. That is all a letter tells you. # speaker: Tamsin
-> post

=== road ===
Tamsin drives. You ride behind her, rifle or no rifle. # page # place: Pump Station road
{ gun: Vesna's rifle lies across your knees. Tamsin does not look at it. }
The road follows the old canal bank south. Dust hangs from the Pump Station back to the hills.
At the Pump Station Tamsin leaves the note with only a date. Agnes Ondra's meter board hangs by the door, and every line on it reads lower than last spring.
At South Lock she hands a letter to a man in a Bowl coat on the gate. His mother wrote it. He reads it standing, then walks off without a word. # place: South Lock
Mirela Duarte keeps the Canal book open on the lock house table. She does not look up as the truck passes.
-> green

=== green ===
# checkpoint: green
Green Pit lies in a dip, a well with a roof and an inn beside it. The hooks by the door hold many rifles. # place: Green Pit
{ found("green-pit"): You know this place. Hadiza Okon fills the cups herself, as before. | A cracked pit with a roof over the well. Hadiza Okon fills the cups herself, and nobody argues with the hooks. }
+ {gun} [Hang Vesna's rifle on a hook, like everyone.]
  ~ drinkers_said = true
  ~ note("courierRider")
  The tables go on talking. A hauler says the new Kiln rider sat here last week with his coat buttoned to the neck and his rifle left on his truck.
  He asked what the courier bag carries. He had never seen the blue stripe.
  Tamsin sets down her cup. She does not say anything.
  -> bend
+ {gun} [Keep the rifle on your shoulder.]
  The talk at the tables stops when you pass. Hadiza Okon looks at the hook, then at you, and fills Tamsin's cup first.
  Nobody tells you anything. Tamsin drinks standing.
  -> bend
+ {not gun} [Sit down with Tamsin.]
  ~ drinkers_said = true
  ~ note("courierRider")
  A hauler says the new Kiln rider sat here last week with his coat buttoned to the neck and his rifle left on his truck.
  He asked what the courier bag carries. He had never seen the blue stripe.
  Tamsin sets down her cup. She does not say anything.
  -> bend

=== bend ===
# checkpoint: bend
South of the pit the road climbs to a bend between rock shoulders. One truck stands crosswise on the rise with a Brann swivel bolted to its bed. # place: South bend
The rider on it is alone. He wears an Army coat, and the cuff is stitched with red thread.
Tamsin stops the truck. She keeps both hands on the wheel.
Courier. Guild paint. You know it. # speaker: Tamsin
He does not answer. He has never seen the paint.
+ {letter_seen} [Tell Tamsin to hand over the thick letter.]
  -> letter
+ {gun} [Raise Vesna's rifle.]
  -> armed
+ [Pay the rider {toll} M. # cost: {toll}]
  -> toll_paid
+ [Let Tamsin talk.]
  -> stripped

=== letter ===
~ result = "kept"
~ note("courierKarl")
Tamsin reaches into the bag without looking and holds out the thick letter. # place: South bend
The rider reads the seal first. Then he sits on his fender and reads the page slowly, his lips moving.
When he stands, his face has changed. He is younger than his coat.
Tell Sefa I eat. Tell her I ride. # speaker: Rider
He waves you through. He is still sitting on the fender when the bend is behind you.
-> home

=== toll_paid ===
~ result = "kept"
The rider takes the coins and counts them twice. He does not ask what the bag carries. # place: South bend
He drags his truck off the road by a length. Tamsin drives on with her eyes on the mirror.
-> home

=== armed ===
~ result = "armed"
~ courier_fate = "armed"
You bring Vesna's rifle up over the cab. # place: South bend
The rider looks at the muzzle, then at the swivel on his own bed, which he has not touched.
He backs his truck off the road by a length. Nobody fires.
Tamsin drives through without a word. She does not look at the rifle on your knees.
-> home

=== stripped ===
~ result = "stripped"
~ courier_fate = "stripped"
Tamsin talks. She names the Guild, the blue stripe and the riders who know her. # place: South bend
It does nothing. More trucks come over the rise behind you.
They take the mail bag, the fuel can and the spare water.
{ gun: They take Vesna's rifle from your knees, and they take it gently. }
{ money() >= lost_share:
  ~ pay(lost_share)
  A rider goes through your pockets and leaves you less. <b>{lost_share} M</b> is gone. # reveal: all
}
-> home

=== home ===
Nose lies under its smoke at dusk. # page # place: Guild post, Nose
Vesna sits at the top of the stairs in her blanket. She has watched the road since noon.
{
  - result == "stripped":
    Tamsin carries what is left of the truck inside. The Guild writes the loop off.
    Vesna looks at your empty hands. { gun: That was my father's rifle. She says it once, quietly. | She says nothing. }
    -> END
  - result == "armed":
    ~ give_money(reward)
    Vesna takes her rifle back and checks it. Tamsin pays you at the bay door, counting out <b>{reward} M</b> without looking up. # reveal: all
    I said no gun. Now Kiln has seen one on a Guild truck. # speaker: Tamsin
    I will ride with Vesna again. Not behind a gun I did not choose. # speaker: Tamsin
    -> END
  - else:
    ~ give_money(reward)
    { gun: Vesna takes her rifle back and checks it. She finds it as she left it. }
    The Guild pays <b>{reward} M</b> for the loop. Vesna looks at the stripe on the truck and says it is still only paint. # reveal: all
    You rode behind me and nobody died. That is all I ask of a pair. # speaker: Tamsin
    -> END
}

=== after_loop ===
Tamsin is under the truck with a wrench, and Vesna is up and watching the road from the bay door. # place: Guild post, Nose
{
  - result == "kept": The loop is quiet. The new rider on the south bend lets the blue stripe through now.
  - courier_fate == "armed": Tamsin has not spoken of the bend. Other Guild trucks went out with rifles on their racks this week.
  - courier_fate == "stripped": Tamsin runs the loop with a hired rifle now. She does not meet your eye.
}
-> END
