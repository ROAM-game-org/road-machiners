# view: page
# stat: money Money
# fact: saw_cut North bend: Emil's wreck is bare. The ring under the gun was torched off at the base, and the bolts still stand in the bed.
# fact: boots North bend: the boot prints of soldiers lie under the stripper's tracks.
# fact: yard_tally Yard tally: a Nose steel ring, torch cut, bought as scrap the week Emil died and sold on to a Kiln hauler.
# fact: otto_read Otto: a Nose ring carries the gate stamp on its flat and a single pin hole. A Brann ring has a small mark and a second pin hole.
# fact: saw_roster Crane office: Captain Silver's patrol roster lies in a drawer, copied twice in one small hand. The corner of one copy says M. Kessel.
# fact: post_ahead Yard tally: a Nose soldier stood at the end of the bench and wrote nothing.
# fact: has_ring Kiln: the ring with the gate stamp and a single pin hole.
INCLUDE world.ink

VAR saw_cut = false
VAR boots = false
VAR yard_tally = false
VAR otto_read = false
VAR saw_roster = false
VAR has_ring = false
VAR post_ahead = false
VAR through_gate = false
VAR wrong_buy = false
VAR ring_way = "none"
VAR gate_way = "none"
VAR ring_price = 40
VAR rush_price = 80
VAR talk_fee = 10
VAR plate_fee = 20
VAR seize_fine = 30
VAR silver_pay = 80
VAR silver_extra = 40
VAR sully_pay = 40
VAR mara_pay = 40
VAR pierce_pay = 30

=== function watched() ===
~ return has_ring and post_ahead and not through_gate

=== start ===
# checkpoint: start
-> desk

=== desk ===
# checkpoint: desk
{ watched(): -> gate }
The crane hangs over the stacked wrecks with its hook swaying in the dry wind. Beyond the gate the north road runs off between rows of rusted hulls. # page # place: Salvage Yard
{ has_ring: The ring lies wrapped in a rag on the seat of your truck. Mara, the captain, the Administrator and the Pierce office would each be glad to hold it. | Mara wants a ring of Nose steel with a single pin hole. Someone cut it off Emil's truck and sold it. }
+ {not saw_cut} [Ride out to Emil's wreck on the north bend.]
  -> wreck
+ {not yard_tally} [Ask at the yard tally.]
  -> tally
+ {not saw_roster} [Ask the Administrator what the yard knows.]
  -> crane
+ {not otto_read} [Walk over to Otto Brann's bench and ask him.]
  -> ridge
+ {found("kiln") and (saw_cut or yard_tally) and not has_ring} [Find the Kiln truck that bought the ring.]
  -> kiln
+ {has_ring} [Take the ring to Mara.]
  -> to_mara
+ {has_ring} [Take the ring to Captain Silver.]
  -> to_silver
+ {has_ring} [Take the ring to the Administrator.]
  -> to_sully
+ {has_ring} [Carry the ring up to the Pierce office at Nose.]
  -> to_pierce
+ [Leave it for now.]
  -> END

=== wreck ===
~ saw_cut = true
The north bend is a shelf of cut rock with a drop on its left. The wind that comes up the gorge carries a taste of old smoke. # place: North bend
Emil Kessel's truck lies against the wall, burnt black, its bed picked bare to the floor plates. The ring that held the gun is gone. A torch cut it off at the base, and the cut is clean. The bolts still stand in the steel like stumps.
Farther up the bend a man sits on an ammunition box with a grey scarf wound round his neck. He watches you walk the shelf and says nothing.
-> look

= look
+ {not boots} [Read the ground round the wreck.]
  { skill("perception") >= 2:
    ~ boots = true
    ~ note("pinBoots")
    Marks from different visits cross the shelf. A heavy cab with a wide tread came at night and stood close against the bed. Under its tracks lie the boot prints of soldiers, a pair of them, deep and square and already filling with dust.
    The soldiers came first. They stood at the ring a while, then walked back down the bend and left it where it was.
    -> look
  - else:
    You walk the shelf from one end to the other and see wind, dust and a burnt truck. The man on the ammunition box watches you look at nothing in particular.
    -> look
  }
+ [Ask the man on the box.]
  I found Emil, so I know this wreck better than most. A cart of soldiers came up the next morning with a clerk. They took the cab door and stood a long while looking at the ring. # speaker: Man
  After dark a woman in a rust-red cab came and cut the ring off with a torch. She didn't hurry. If you want to know who buys scrap from a rust-red cab, ask at the Yard tally. # speaker: Man
  He says no more, and he doesn't give you a name.
  -> look
+ [Ride back to the Yard.]
  -> desk

=== tally ===
~ yard_tally = true
~ post_ahead = true
The tally boy keeps a slate on a chain round his neck. He wets his thumb each time he runs it down the lines. # place: Yard tally
Bought; From; Sold on # head
Cab door, Army; Pierce depot; Yard crane # row
Nose steel ring, torch cut; A stripper off the north road; A Kiln hauler # row
Water drum, dented; Green Pit hauler; Bowl trader # row
The Kiln hauler drives a rust-red cab with a stripe down the door. The boy says she comes by for scrap every week.
At the far end of the bench a Nose soldier stands with a pencil in his hand and writes nothing at all. He looks up from the slate exactly when the boy reads out the second line.
-> desk

=== crane ===
~ saw_roster = true
~ note("pinRoster")
The Administrator's office sits high in the crane frame with glass on every side. Sully Okafor can watch the whole yard from his chair. # place: Crane office
He flips a coin across his knuckles and stops when he sees you looking at it.
You're asking about a Nose ring, friend. The captain's sergeant asked me the very same question this morning. I told him what I tell everybody. The yard keeps what it's given and gives nothing back. # speaker: Sully
He talks about the weather and the price of fuel while you look around. A drawer stands open under the window. In it lies Captain Silver's patrol roster, stamped with the post seal. Beneath it lies the same roster again, copied out in a small slanted hand. The corner of the copy says <i>M. Kessel</i>.
Sully closes the drawer with his knee, without looking at it.
I care for my people as I can, and everyone in this yard is somebody's people. That includes the ones who sit at desks by the gate. # speaker: Sully
-> desk

=== ridge ===
~ otto_read = true
~ note("pinStamp")
Otto Brann works at a bench under a sheet of hull plate that keeps the sun off his hands. His granddaughter Lenka holds the far end of a half-finished ring. # place: Salvage Yard
You describe the ring from the yard tally. Otto stops welding and lifts his visor.
A ring of Nose steel carries the gate stamp on its flat side, and it has one hole where the second pin ought to go. They copied my swivel and cut the second pin out. It saved a little steel and an hour of a machinist's time. A pin is a pin, they said. # speaker: Otto
Lenka sets down her tongs. Emil Kessel came to this bench the winter before he died. He asked Grandfather what a second pin would cost him, and Grandfather quoted the price. # speaker: Lenka
He said he'd pay on payday. He said it twice, as if he were practicing how to say it to someone else. # speaker: Otto
Otto signs every weld he makes with a small mark. While you stand there he looks at the bench and doesn't sign anything.
-> desk

=== kiln ===
Kiln Camp smells of hot iron and burnt oil. Heat shimmers over the furnace at its middle. # place: Kiln Camp
A rust-red cab stands beside the furnace, with a Nose ring bolted into its bed and a fresh gun mounted on the ring. The rider wipes her hands on a rag and doesn't get up.
{ post_ahead: A soldier from the post was here this morning and asked after rings. She quoted him a price and watched him count. }
It's good steel, and it came off a dead Nose man. Then again, they're all dead Nose men in the end, aren't they? # speaker: Rider
An old woman works the furnace behind her and doesn't look round. Everyone here seems to know better than to ask her anything.
-> deal

= deal
+ {not post_ahead} [Buy the ring for {ring_price} M. # cost: {ring_price}]
  -> buy
+ {post_ahead} [Outbid the post for {rush_price} M. # cost: {rush_price}]
  -> buy
+ [Tell her what the ring did on the bend.]
  -> talk
+ [Offer to rebuild her mount.]
  -> mount
+ [Walk away.]
  -> desk

= buy
{ otto_read or wrong_buy or skill("perception") >= 2:
  ~ has_ring = true
  ~ ring_way = "bought"
  The gate stamp is cut into the flat of the ring. The single pin hole runs straight through it, just as Otto described.
  The rider unbolts it while you watch and doesn't ask why you want it. Take it and go. Don't stand around asking questions, because the furnace doesn't like them. # speaker: Rider
  -> desk
- else:
  ~ wrong_buy = true
  The rider takes your coin and hands you a ring. You tilt it in the light. It carries a small mark on the rim and a second pin hole beside the first.
  That's a Brann ring. A Brann ring off a Nose bed is a different story from the one you came for. Next time look for the stamp. # speaker: Rider
  She grins at the first fool of her week.
  -> deal
}

= talk
{ skill("social") >= 2:
  ~ has_ring = true
  ~ ring_way = "told"
  You tell her how a driver died on a bend, on a ring the line sold him with one hole. You tell her he'd asked for the second pin and was waiting for payday.
  The rider looks down at her own mount for a long moment. Then she gets to her feet and unbolts the ring herself.
  Nose sold him a short pin and a gun, and I'd have sold him his coffin. Take it, and keep your coin. # speaker: Rider
  A soldier asked me about it this morning. I told him it had gone into the furnace. He believed me for about as long as it takes to count a handful of coins. # speaker: Rider
  -> desk
- else:
  You talk about the bend and the pin. She listens with her head tilted, like a woman pricing a coat.
  Who sent you, though? A soldier comes asking, then a driver comes asking. Somebody wants a dead man's ring very badly. # speaker: Rider
  She whistles for a boy and sends him running toward the Yard gate. News sells well there.
  ~ post_ahead = true
  { money() >= talk_fee:
    ~ pay(talk_fee)
    She holds out her hand for the listening, and you put {talk_fee} M into it. # reveal: all
  }
  -> deal
}

= mount
{ skill("machining") >= 2:
  ~ has_ring = true
  ~ ring_way = "rebuilt"
  The fresh gun sits on the Nose ring on a single pin. On the first hard bend it will slide. You tell her so and show her the hole, and she goes quiet.
  You cut a new ring from a hull plate on her scrap heap and bore it for a pin on each side. The old woman from the furnace comes over and checks your weld with her thumbnail.
  She nods once. The rider swaps the gun over to your ring and hands you the old one without another word.
  -> desk
- else:
  You cut a ring from her scrap and bore it, working fast. The weld cracks the moment she puts the gun's weight on it.
  The old woman from the furnace looks at the crack, then at you, and goes back to her fire.
  { money() >= plate_fee:
    ~ pay(plate_fee)
    The rider charges you for the ruined plate. {plate_fee} M leaves your pocket. # reveal: all
  }
  -> deal
}

=== gate ===
# checkpoint: gate
The post gate stands between you and the crane. A sergeant walks along the line of waiting trucks with an iron rod, running it under each bed and tapping the rails. # page # place: Post gate
The ring lies in a rag under your seat. Your truck sits a few lengths back in the line.
+ [Take the scrap lane round the crane yard.]
  -> lane
+ [Bolt the ring into the bed rail as a bracket.]
  -> bracket
+ [Talk to the sergeant.]
  -> sergeant
+ {saw_roster} [Call to the crane crew by the fence.]
  -> crew
+ [Drive up to the gate and open the bed.]
  -> seized

= lane
{ skill("driving") >= 2:
  ~ through_gate = true
  ~ gate_way = "lane"
  You pull out of the line at the crane footing and put the truck down a lane of broken concrete. The back end slides round the stacked wrecks. The sergeant's rod finds only air.
  A soldier shouts and a whistle sounds. You're already among the hulls on the far side, and the whistle comes from a long way behind.
  -> desk
- else:
  You pull out of the line at the crane footing and take the scrap lane. It's rubble, and the front wheel catches a bollard hard enough to shake the cab.
  The soldiers are at the bed before the dust has settled.
  -> seized
}

= bracket
{ skill("machining") >= 2:
  ~ through_gate = true
  ~ gate_way = "bracket"
  You weld the ring to the bed rail with a few quick beads. A coat of rust-colored paint from the can behind your seat covers them. It looks like part of the truck.
  The sergeant's rod rings against it, pauses and moves on down the line.
  -> desk
- else:
  You weld the ring to the bed rail, but the beads are bright and new, and the paint is still wet.
  The sergeant's rod rings against it and stops. He taps the paint with a fingernail and looks at the nail.
  -> seized
}

= sergeant
{ skill("social") >= 2:
  ~ through_gate = true
  ~ gate_way = "word"
  You talk about the road, the dust and the price of fuel. You ask whether a man can still get a decent meal at the Nose canteen. The sergeant is young and bored and has a mother in the town.
  He waves you through without once lifting the rag.
  -> desk
- else:
  You talk, and the sergeant listens with his head on one side and his rod across his arm. You talk a little too long about nothing. A man who talks that long about nothing has something under his seat.
  He reaches for the rag.
  -> seized
}

= crew
~ through_gate = true
~ gate_way = "crew"
A pair of Sully's crane hands stand at the fence with a hook on a chain. One of them glances up at the Administrator's window. The hook swings out over the gate, catches your truck bed by the rail and lifts it a hand's width into the air.
The soldiers watch the crane and not the bed. Nobody asks what the Administrator's men are lifting. The gate is behind you before the sergeant finishes his count.
-> to_sully

=== seized ===
~ has_ring = false
~ pin_fate = "silver"
~ yard_power = "post"
~ post_file = "named"
The sergeant takes the rag and unwraps it. He holds the ring up high so the whole line of trucks can see it. # page # place: Post gate
Captain Silver comes down from the post without hurrying. He doesn't look at you. He looks at the gate stamp for a long time.
Write down the name of this driver, and write it carefully. This post has a long memory. # speaker: Silver
{ money() >= seize_fine:
  ~ pay(seize_fine)
  A clerk takes {seize_fine} M from you for crossing the gate without a pass. # reveal: all
}
That night the yard forge runs hot until dawn. The ring is gone, and so is anything anyone might have said about it.
-> END

=== to_mara ===
~ pin_fate = "mara"
~ yard_power = "yard"
~ give_money(mara_pay)
Mara takes the ring in both hands and holds it to the light from the gate. For a while she says nothing at all. # page # place: Post gate desk
She runs her thumb over the gate stamp. Then she runs it over the single hole.
{ ring_way == "rebuilt": She notices the soot of a Kiln furnace in the grooves and a clean new weld on the bolts. She raises one eyebrow and doesn't ask. }
{ ring_way == "told": You tell her the rider gave it up when she heard how Emil died. Mara looks at the wall for a moment. }
Nose handed him this and told him it was safe. # speaker: Mara
She counts {mara_pay} M into your palm. It's what the ring cost, and a little more. # reveal: all
She wraps the ring in oilcloth and puts it into her own locker under the desk.
-> pact_mara

= pact_mara
# checkpoint: to_mara.pact_mara
Mara lowers her voice and sets a pair of pages on the desk. Both hold the same words in her small slanted hand.
Bought of a Kiln hauler, for the Bureau, by the hand written below. A name goes here, and the same name goes here, if you'd be so kind. # speaker: Mara
{ saw_roster: She watches your face while she says it, like a woman counting something. }
+ [Sign both pages.]
  -> signed
+ {saw_roster} [Tell her what you saw in the crane office, and sign.]
  She's quiet for a long time. Then she nods.
  So you know. Nobody else in this yard does, and nobody else will, as long as you keep it that way. # speaker: Mara
  -> signed
+ [Tell her you keep your name to yourself.]
  She puts the pages away without any change in her face.
  Then I'll carry this alone. A ring with no witness is a ring I can't show anyone. Thank you for bringing it all the same. # speaker: Mara
  -> END

= signed
~ pin_pact = "signed"
~ post_file = "named"
She blots both pages and folds one inside her coat.
At the gate a boy from the crane is waiting with a sack. She passes him the oilcloth bundle through the bars without looking at it. He walks off toward the crane office with the sack on his shoulder.
-> END

=== to_silver ===
~ pin_fate = "silver"
~ yard_power = "post"
~ give_money(silver_pay)
Captain Silver receives you in the long room of the post. He doesn't offer you a seat. # page # place: Post command
He holds the ring up on one finger and reads the gate stamp. His face doesn't change.
{ gate_way == "bracket": His thumb finds the fresh bead where you cut the ring from the rail. He says nothing about it. }
{ ring_way == "told": He asks who sold it to you. When you say she asked for no coin, he writes that on a page. }
Nose steel. A great many people would like to hold this and tell the world what it proves. # speaker: Silver
He walks to the yard forge and drops the ring into the slag drum. It sags, goes red, then orange, and then it's nothing but a glow in the drum.
He counts {silver_pay} M onto the table. # reveal: all
That ring is gone, and so is anything anyone might say about it. # speaker: Silver
-> pact_silver

= pact_silver
# checkpoint: to_silver.pact_silver
Silver slides a page across the table with the post seal already on it.
Bought of a Kiln rider, off the wreck of a Nose driver. There's a line for your name. # speaker: Silver
The post has use for a driver who'll say plainly where the steel came from. Kiln strips our dead. The Committee should hear it from an honest hauler and not from a soldier. # speaker: Silver
+ [Sign the page.]
  ~ kiln_word = "named"
  Silver blows on the ink and files the page in the post book.
  A bad bend and a bad rider. The book will say what the book says, and no more than that. # speaker: Silver
  -> silver_asks
+ [Refuse to sign.]
  ~ post_file = "named"
  Then you sold me a ring and no story. The post remembers who sells to it. # speaker: Silver
  -> silver_asks
+ [Leave.]
  -> END

= silver_asks
{ saw_roster:
  Silver looks at you a moment longer than he needs to.
  My patrol roster leaves this post and comes back to it. A yard boy tells me you sat in the crane office today. Whose hand was on the paper in that drawer? # speaker: Silver
  ++ [Tell him it was Mara Kessel.]
     -> told_silver
  ++ [Say you saw nothing.]
     He holds your eyes a moment too long. Then he nods.
     -> END
- else:
  -> END
}

=== told_silver ===
~ pin_pact = "silver"
~ give_money(silver_extra)
Silver says nothing for a while. Then he calls for a pair of soldiers. # page # place: Post command
They take Mara Kessel from her desk at dusk. She doesn't look at you. She carries both of her ledgers, one under each arm.
Silver counts {silver_extra} M more onto the table. # reveal: all
-> END

=== to_sully ===
~ pin_fate = "sully"
~ yard_power = "yard"
~ post_file = "named"
~ give_money(sully_pay)
Sully Okafor takes the ring and weighs it in his hand. For once he doesn't flip a coin. # page # place: Crane office
{ gate_way == "crew": He watched his crane lift your bed over the gate from this window. He gives you the nod of a man who pays his hands well. }
{ gate_way == "lane": A yard boy has already told him a truck took the scrap lane at speed with soldiers behind it. }
A gate stamp and a single hole. That's a paper a judge could hold, if a judge ever sat in this yard. # speaker: Sully
He opens a drawer and sets the ring beside a thick book with a Pierce seal on its cover. Then he locks the drawer.
Silver would put it in the slag drum. I'd like it where it can be shown. # speaker: Sully
He counts {sully_pay} M onto the desk. # reveal: all
The captain will ask who brought it, and a boy at the gate will tell him. So be sure that what you say is true, because I'll say the same. # speaker: Sully
This yard keeps what it's given. It's the only law I've ever trusted. # speaker: Sully
-> END

=== to_pierce ===
~ pin_fate = "pierce"
~ give_money(pierce_pay)
The Pierce office at Nose keeps its blinds drawn against the dust. The only sound in it is the scratch of a pen. # page # place: Pierce office
Constance Pierce rolls the ring in her fingers. She finds the gate stamp, then the single hole.
{ gate_way != "none": You came past the Yard post with it, and Constance doesn't ask how. }
Pierce writes no paper on a mount with one pin. Now I can show a board what such a ring looks like, and what it did to a man who trusted it. # speaker: Constance
She counts {pierce_pay} M onto the desk and writes your name in a small book. # reveal: all
I never forget a favor, and I never forgive a debt either. You may count on both. Nobody at the Yard post will hear that this ring came to me. # speaker: Constance
-> END
