# view: page
# stat: money Money
# fact: vesna_said Vesna: a new rider holds the south bend this season. His truck carries a Brann swivel.
# fact: letter_seen Mail bag: a thick letter capped with a Burnt Convoy tin seal, addressed to Karl Vosk, care of Kiln Camp.
# fact: drinkers_said Green Pit tables: the new Kiln rider asked what the courier bag carries. He had never seen the Guild paint.
# fact: read_rider South bend: the rider's swivel is bolted on but empty, and his hand shakes on the fender.
INCLUDE world.ink

VAR vesna_said = false
VAR letter_seen = false
VAR drinkers_said = false
VAR met_vesna = false
VAR asked_gun = false
VAR gun = false
VAR riding = false
VAR read_rider = false
VAR lock_way = "none"
VAR result = "none"
VAR toll = 30
VAR reward = 40
VAR lost_share = 40

=== start ===
# checkpoint: start
{
  - result != "none" or courier_fate != "none": -> after_loop
  - riding: -> post
}
Tamsin Roe leans on the fender of a truck with a blue stripe down its door, reading a letter that isn't hers. # place: Guild post, Nose
She folds it away when she sees you, without any hurry.
You're the one the Guild sent? Good. I'm Tamsin. # speaker: Tamsin
Vesna Hale rides behind me, always. She has the rifle and I have the wheel. But she's down with a fever, and the south loop won't wait for her. # speaker: Tamsin
It's the Pump Station, South Lock, Green Pit and home. The Guild pays for the whole loop, and all I need is someone in the back seat. # speaker: Tamsin
One thing first, though. I carry no gun. Not for you, not for Vesna, not for the Guild. # speaker: Tamsin
-> hub

= hub
# checkpoint: start.hub
+ {not asked_gun} [You really carry no gun at all?]
  ~ asked_gun = true
  I really don't. The Kiln riders know my truck, and they let it pass because it's unarmed. # speaker: Tamsin
  Besides, I read what people carry. In all the letters I've read, nobody ever wrote home that a gun made them braver. # speaker: Tamsin
  -> hub
+ [I'll ride behind you.]
  ~ riding = true
  Good. Go and see Vesna if you like, since she knows the road better than I do. # speaker: Tamsin
  -> post
+ [Not this loop.]
  Then Vesna goes out sick. You'd better tell her yourself, because I won't. # speaker: Tamsin
  -> END

=== post ===
# checkpoint: post
The bay smells of oil and cold tea. Tamsin checks the strap on the mail bag, then checks it again. # page # place: Guild post, Nose
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
Vesna lies in a room above the radio shack with a blanket up to her chin and a rifle across the chair beside her. # place: Above the radio shack
She watches the window and not you. Her eyes go to the mirror on the wall every time a truck passes below.
Kiln riders take the trucks that run alone. A new one has come to the south bend this season, and I never saw his face. # speaker: Vesna
I saw his truck from a long way off, though. It carried a Brann swivel, so he didn't build it himself. # speaker: Vesna
Tamsin thinks her blue paint is a wall. It's paint. Take the rifle. # speaker: Vesna
At Green Pit you'll want to hang it on the hook by Hadiza Okon's door before you drink. Everyone does, haulers and Kiln riders alike, and that's the only reason her canteen stays peaceful. Bring it back to me afterward. # speaker: Vesna
+ [Take Vesna's rifle.]
  ~ gun = true
  She shuts her eyes. Her hand stays on the arm of the chair a moment after the rifle is gone.
  -> post
+ [Leave it with her.]
  Then you ride bare, like Tamsin. I hope the paint is enough for you. # speaker: Vesna
  -> post

=== bag ===
~ letter_seen = true
~ note("courierLetter")
Tamsin loosens the strap and lets you look. # place: Guild post, Nose
She carries other people's letters for free, and she reads every one of them. Most are small. A mother to a son at South Lock, a bill from a welder, and a note for the Pump Station with nothing on it but a date.
One thick envelope is capped with a Burnt Convoy tin seal. It's addressed to Karl Vosk, care of Kiln Camp.
Nobody writes to Kiln, so I'm carrying it myself. Someone wrote to him once, and that's all a letter ever tells you. # speaker: Tamsin
-> post

=== road ===
Tamsin pushes the loop sheet across the hood. There's a line on it for the pair, and you scratch your name there because the Guild won't send a bag out without one. # page # place: Pump Station road
{ gun: Vesna's rifle lies across your knees. Tamsin doesn't look at it. }
The road follows the old canal bank south, and dust hangs in the air all the way back to the hills.
At the Pump Station Tamsin leaves the note with only a date on it. Agnes Ondra's meter board hangs by the door, and every line on it reads lower than last spring.
-> lock

=== lock ===
South Lock stands where the canal drops through its gates, and a man in a Bowl coat steps into the road with his hand up. # place: South Lock
He has a patrol badge and a worn letter in his other hand. Behind him Mirela Duarte sits at the lock house table with the Canal book open and does not look up.
Morning, courier. The patrol's looking in every bag that goes south this season. Folks in Kiln have friends, and we'd like to know who writes to them. # speaker: Corporal
He says it kindly, which makes it worse. Tamsin keeps both hands on the wheel.
The Guild doesn't open a bag for anyone. I'd sooner lose the road. # speaker: Tamsin
+ [Let Tamsin hold her ground.]
  -> lock_refused
+ [Talk to the corporal.]
  -> lock_talk
+ {letter_seen} [Slip the thick letter into the door panel.]
  -> lock_hide
+ {letter_seen} [Tell Tamsin to show him the bag.]
  -> lock_read

= lock_refused
~ lock_way = "refused"
Tamsin says it again, slowly, and the corporal looks at her for a long moment. # place: South Lock
Then he lowers his hand and steps aside. The Guild's been good to my mother, he says, and I'd sooner not be the one who stops it.
The word will still reach the toll hut that a Guild truck wouldn't be looked into. Bowl remembers a closed bag.
-> green

= lock_talk
{ skill("social") >= 2:
  ~ lock_way = "talked"
  You ask him about the letter in his hand, and he tells you it's from his mother, who lives on a farm below the Granary. You tell him what a mother wants a courier to carry, and that the bag is full of letters just like his.
  He laughs and waves you on. Nothing in a mother's bag would help Kiln, he says.
  -> green
- else:
  ~ lock_way = "read"
  ~ letter_fate = "read"
  You talk, but you talk like a man hiding something. The corporal's eyes go to the bag.
  Sorry, courier. I'll have to look after all. # speaker: Corporal
  He opens the strap himself. The thick envelope with the Burnt Convoy seal is on top, and he reads the address aloud, twice, as if he were memorizing it.
  -> green
}

= lock_hide
{ skill("machining") >= 2:
  ~ lock_way = "hidden"
  While Tamsin argues about the Guild's rules, you pry the inside panel from the door with a fingernail and push the thick letter into the gap. The panel snaps back flat.
  The corporal searches the bag and finds a mother's letter, a welder's bill and a date. He lets you through, a little ashamed.
  -> green
- else:
  ~ lock_way = "read"
  ~ letter_fate = "read"
  You pry at the panel, and the clip snaps with a crack that carries across the lock. The corporal looks round.
  The letter is lying on the floor of the cab with the Burnt Convoy seal facing up. He picks it up and reads the address, and he gives it back with great care.
  -> green
}

= lock_read
~ lock_way = "read"
~ letter_fate = "read"
Tamsin stares at you. Then she hands the bag down without a word. # place: South Lock
The corporal goes through it as kindly as he does everything. He stops at the thick envelope and reads the address.
Karl Vosk, at Kiln. He says the name twice. I thank you, he says. The patrol's been asking after that name for a long time.
-> green

=== green ===
# checkpoint: green
Green Pit is a pump yard behind a wall of stacked drums under green tarp. Water tanks stand over it on steel legs, and the pump thuds day and night like a slow heart. Hadiza Okon's canteen leans against the tank wall. Rifles hang on iron hooks by its door, because everyone hangs their gun before they drink. That's how raiders and haulers share one room. # page # place: Green Pit
{ found("green-pit"): You know this place. Hadiza Okon fills the cups herself, as before. | Hadiza Okon fills the cups herself, and charges for them, and nobody argues with the hooks. }
+ {gun} [Hang Vesna's rifle on a hook, like everyone.]
  ~ drinkers_said = true
  ~ note("courierRider")
  The tables go on talking. A hauler says the new Kiln rider sat here last week with his coat buttoned to the neck, and he left his rifle on his truck.
  He asked what the courier bag carries. He had never seen the blue stripe.
  Tamsin sets down her cup. She doesn't say anything.
  -> bend
+ {gun} [Keep the rifle on your shoulder.]
  The talk at the tables stops when you pass. Hadiza Okon looks at the empty hook, then at you, and fills Tamsin's cup first.
  Nobody tells you anything. Tamsin drinks standing.
  -> bend
+ {not gun} [Sit down with Tamsin.]
  ~ drinkers_said = true
  ~ note("courierRider")
  A hauler says the new Kiln rider sat here last week with his coat buttoned to the neck, and he left his rifle on his truck.
  He asked what the courier bag carries. He had never seen the blue stripe.
  Tamsin sets down her cup. She doesn't say anything.
  -> bend

=== bend ===
# checkpoint: bend
South of the pit the road climbs to a bend between rock shoulders. One truck stands crosswise on the rise with a Brann swivel bolted to its bed. # place: South bend
The rider on it is alone. He wears an Army coat, and the cuff is stitched with red thread.
Tamsin stops the truck and keeps both hands on the wheel.
Courier. Guild paint. You know it. # speaker: Tamsin
He doesn't answer. He has never seen the paint.
+ {letter_seen} [Tell Tamsin to hand over the thick letter.]
  -> letter
+ {gun} [Raise Vesna's rifle.]
  -> armed
+ [Pay the rider {toll} M. # cost: {toll}]
  -> toll_paid
+ {not read_rider} [Look hard at the rider.]
  -> reading
+ [Ask Tamsin to let you take the wheel.]
  -> wheel
+ [Let Tamsin talk.]
  -> stripped

=== letter ===
~ result = "kept"
~ letter_fate = "delivered"
~ note("courierKarl")
Tamsin reaches into the bag without looking and holds out the thick letter. # place: South bend
The rider reads the seal first. Then he sits on his fender and reads the page slowly, with his lips moving.
When he stands, his face has changed. He's younger than his coat.
Tell Sefa I eat. Tell her I ride. # speaker: Rider
He waves you through, and he's still sitting on the fender when the bend is behind you.
-> home

=== toll_paid ===
~ result = "kept"
The rider takes the coins and counts them twice. He doesn't ask what the bag carries. # place: South bend
He drags his truck off the road by a length. Tamsin drives on with her eyes on the mirror.
-> home

=== reading ===
{ skill("perception") >= 2:
  ~ read_rider = true
  The rider's swivel is bolted to his bed, but no belt hangs from it and no round sits in the chamber. His hand shakes on the fender, and the red thread on his cuff has been mended more than once. # place: South bend
  He is alone because nobody else would stand there. You say so, in a low voice, and you say that whoever stitched that cuff is worried about him.
  He stares at you. Then his shoulders drop.
  I'm not supposed to do this alone. Go on, then. # speaker: Rider
  ~ result = "kept"
  He drags his truck off the road. Tamsin drives through without a word.
  -> home
- else:
  You study him and see an Army coat and a gun. You say something to him about his cuff, and it comes out like a threat.
  His face goes white and then red. He whistles twice.
  -> stripped
}

=== wheel ===
{ skill("driving") >= 2:
  ~ result = "kept"
  ~ courier_fate = "ran"
  Tamsin looks at you for a heartbeat. Then she slides across the seat. # place: South bend
  You put the truck at the shoulder, where the rock falls away in a slope of loose shale, and you keep the wheels on the ledge. The rider's swivel swings after you and finds nothing.
  Behind you he fires a shot into the air. Nobody follows. Tamsin says nothing for the next mile, and then she laughs once.
  -> home
- else:
  Tamsin slides across the seat. You take the shoulder at speed, and the shale slides out from under the rear wheels. # place: South bend
  The truck ends in the ditch with its nose in the rock. The mail bag is on the rise, and the rider is already walking toward it.
  -> stripped
}

=== armed ===
~ result = "armed"
~ courier_fate = "armed"
You bring Vesna's rifle up over the cab. # place: South bend
The rider looks at the muzzle, then at the swivel on his own bed, which he hasn't touched.
He backs his truck off the road by a length. Nobody fires.
Tamsin drives through without a word. She doesn't look at the rifle on your knees.
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
  A rider goes through your pockets and leaves you less. {lost_share} M is gone. # reveal: all
}
-> home

=== home ===
Nose lies under its smoke at dusk. # page # place: Guild post, Nose
Vesna sits at the top of the stairs in her blanket. She has watched the road since noon.
The loop sheet lies on the post desk. Under the line for the pair, Tamsin has written your name in her round hand. Beside the bag line she has written nothing. A copy of the sheet goes to the Guild board, and the board sells what it holds.
{
  - result == "stripped":
    Tamsin carries what is left of the truck inside. The Guild writes the loop off.
    Vesna looks at your empty hands. { gun: That was my father's rifle. She says it once, quietly. | She says nothing. }
    -> END
  - result == "armed":
    ~ give_money(reward)
    Vesna takes her rifle back and checks it. Tamsin pays you at the bay door and doesn't look up while she counts out {reward} M. # reveal: all
    I said no gun. Now Kiln's seen one on a Guild truck. I'll ride with Vesna again, but not behind a gun I didn't choose. # speaker: Tamsin
    -> END
  - else:
    ~ give_money(reward)
    { gun: Vesna takes her rifle back and checks it. She finds it as she left it. }
    The Guild pays {reward} M for the loop. Vesna looks at the stripe on the truck and says it's still only paint. # reveal: all
    You rode behind me and nobody died. That's all I ask of a pair. # speaker: Tamsin
    -> END
}

=== after_loop ===
Tamsin is under the truck with a wrench, and Vesna is up and watching the road from the bay door. # place: Guild post, Nose
{
  - result == "kept": The loop is quiet. The new rider on the south bend lets the blue stripe through now.
  - courier_fate == "armed": Tamsin hasn't spoken of the bend. Other Guild trucks went out with rifles on their racks this week.
  - courier_fate == "stripped": Tamsin runs the loop with a hired rifle now. She doesn't meet your eye.
}
{ letter_fate == "delivered": A Bowl patrol rider was asking at the Guild board for the name on a loop sheet. The clerk sold it to him. }
{ letter_fate == "read": Tamsin says the Bowl patrol has been asking after Karl Vosk at every post since the corporal read that address. }
-> END
