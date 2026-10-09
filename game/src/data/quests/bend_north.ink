# view: page
# stat: money Money
# fact: seen_ash North bend: Ash Kerimov stops every truck and asks to see its swivel pins.
# fact: ash_story Ash: Emil Kessel died at this bend on a single pin. Ash pays for a second pin when a driver cannot. He rode for Scrapjaw once.
# fact: heard_kaplan Kaplan: Kiln pays to see Ash gone from the bend. Kaplan asks that Ash be left alive.
# fact: saw_rise The rise above the bend: a Nose cart left a crate of greased rifles in the rocks at dusk, with a bundle of Kiln red cloth on the lid.
# fact: scarf You hold a Kiln red scarf, new and uncreased, from the crate.
INCLUDE world.ink

VAR seen_ash = false
VAR ash_story = false
VAR heard_kaplan = false
VAR saw_rise = false
VAR scarf = false
VAR kiln_shut = false
VAR silver_pay = 80
VAR kaplan_pay = 80
VAR fund = 60
VAR crew_fee = 40
VAR bench_fee = 40

=== start ===
# checkpoint: start
-> road

=== road ===
# checkpoint: road
The north road runs empty from the Yard gate, shimmering in the heat, and somewhere out along it a man is sitting on an ammunition box and looking at the pins of every truck that passes. Captain Silver has named his price for moving him. # page # place: Salvage Yard
{ heard_kaplan: A Kiln rider has also told you what Kaplan would pay. }
+ {not heard_kaplan and not kiln_shut and kiln_word != "named"} [Speak to the Kiln rider who watches you from the scrap heap.]
  -> messenger
+ {not heard_kaplan and not kiln_shut and kiln_word == "named"} [Speak to the Kiln rider who watches you from the scrap heap.]
  -> shut
+ {not seen_ash} [Ride to the north bend and see the man.]
  -> bend
+ {seen_ash and not saw_rise} [Lie up on the rise above the bend until dusk.]
  -> rise
+ [Take Captain Silver's job.]
  -> silver_job
+ {heard_kaplan} [Take Kaplan's job.]
  -> kaplan_job
+ {seen_ash} [Ride back and warn Ash.]
  -> warn
+ {seen_ash} [Leave money with Ash for pins. # cost: {fund}]
  -> pins
+ {seen_ash} [Set up a boring bench at the bend.]
  -> bench
+ {saw_rise} [Take what you saw to the Administrator.]
  -> exposed
+ {saw_rise} [Take what you saw to Captain Silver.]
  -> hush
+ [Leave it for now.]
  -> END

=== messenger ===
~ heard_kaplan = true
~ note("bendKaplan")
The rider wears a rust-red scarf and sits on a drum of oil with one boot up on the rim. She waves you over without getting up, as though she were calling a dog. # place: Salvage Yard
Kaplan sends word that the man at the north bend is slowing the road. A slow road feeds nobody, and a truck with a second pin shoots straighter, which means more Kiln folk bleed for it, so Ain wants him gone. # speaker: Rider
Kaplan said to tell you to do it clean. Move him on, and do not leave him in a ditch, because Kaplan will not pay for a body. He pays {kaplan_pay} M for a man who walks away. # speaker: Rider
She spits over the rim of the drum and does not wait to hear what you say.
-> road

=== shut ===
~ kiln_shut = true
The rider on the oil drum looks you over and does not wave. # place: Salvage Yard
Ain read a page with your name at the bottom of it, which says that Kiln strips the dead. Kaplan sends nothing to a hand that signed such a page. # speaker: Rider
You can ride out to the bend if you like. Kiln will remember which side your hand was on when you did. # speaker: Rider
She puts her back to you and goes on polishing the stock of her rifle.
-> road

=== bend ===
~ seen_ash = true
~ ash_story = true
~ note("bendAsh")
The man sits on an ammunition box where the bend narrows, with a grey scarf wound twice round his neck and a tin cup hanging from his belt. # place: North bend
He lifts a hand, and you stop. He walks the length of your truck bed, looks closely at the gun mount, and says only one thing.
Show me your pins. # speaker: Ash
He crouches and puts a thumb on each pin one after another, nods, and lets you go on. Then he looks at the wall of the bend, where Emil Kessel's wreck lies burnt against the rock.
Emil Kessel went off here last winter. His swivel slid on the curve, and the gun came round into his cab, and I was the one who found him. It had one pin, and a gun on one pin will do that on a bad bend. # speaker: Ash
So I sit here and look at the pins. A driver with a single pin gets a choice from me, and a second pin costs only a little at the Salvage Yard, and I pay it myself when the driver cannot. # speaker: Ash
The patch of a Scrapjaw outrider has been cut from the sleeve of his coat, but the stitches are still there.
I rode for Scrapjaw once, and I used to tell the drivers we robbed what to buy so that they would not be robbed twice. Rook did not like that, and Ain liked it less. # speaker: Ash
Soldiers came up this bend after Emil with a clerk. They wrote the wreck down, but they never wrote me down, and I am the one who stayed. # speaker: Ash
-> road

=== rise ===
You leave the truck at the foot of the bend and climb the loose rock above the narrow corner, where a man can lie flat and see the whole shelf. # place: The rise above the bend
{ skill("perception") >= 2:
  ~ saw_rise = true
  ~ note("bendRise")
  The light goes red and long, and a cart comes up the north road with a Nose sergeant and a pair of soldiers on the board.
  They carry a crate into the rocks above the narrowest part of the corner and prop its lid open. Army rifles lie inside it wrapped in fresh grease paper.
  The sergeant drops a bundle of red cloth on top of the rifles and walks the line of the drop with his eyes, from the crate to the road and back. Then the cart goes down the way it came.
  -> crate
- else:
  You lie in the dust until the light goes. You see a cart, a great deal of rock and a lizard, and nothing else that you can explain.
  At the foot of the bend a soldier leans on your truck and writes a line in a small book.
  A driver on the rise at dusk. Remember that, because I shall. # speaker: Soldier
  ~ post_file = "named"
  -> road
}

= crate
+ [Climb down to the crate and take a red scarf.]
  ~ scarf = true
  The cloth is new and stiff, and it has never been worn. You fold it inside your coat and leave the lid exactly as it was.
  -> road
+ [Go back down as you are.]
  -> road

=== silver_job ===
~ bend_fate = "silver"
~ yard_power = "post"
You ride to the bend with Silver's word in your pocket, and Ash watches you come all the way up the shelf. # page # place: North bend
You tell him that the post wants the bend clear, and that the next men to come will carry rifles and not words.
{ skill("toughness") >= 2:
  You park the truck across the road and stand in front of it with your hands open and your feet apart. Ash looks at your shoulders for a long time, and then he looks at the road.
  He folds his scarf, packs the tin cup into his coat and stands up from the box.
  Tell Silver it is a public road. # speaker: Ash
  He walks off up the bend and does not look back.
  { post_file == "named":
    ~ post_file = "clean"
    Silver strikes a line out of his file with a pencil and does not thank you.
  - else:
    ~ give_money(silver_pay)
    Silver counts {silver_pay} M onto his table. The post will hold the bend now. # reveal: all
  }
  At dusk a Nose truck takes the bend with its gun on a single pin, and nobody stops it to ask.
  -> END
- else:
  You park the truck across the road and stand in front of it, and Ash does not so much as blink.
  A Nose truck with a single pin comes up behind you, and its driver leans on the horn. Ash takes his eyes off you, walks to the other truck and crouches by its mount as though you were not there.
  Silver hears of it by dusk. A pair of soldiers who do not talk walk up the bend, and Ash comes down it between them.
  Silver pays nothing and calls it excuses. # speaker: Silver
  At dusk a Nose truck takes the bend with its gun on a single pin, and nobody stops it to ask.
  -> END
}

=== kaplan_job ===
~ bend_fate = "kiln"
You ride to the bend and tell Ash what Kaplan sent, and Ash listens with his eyes on the wall. # page # place: North bend
{ skill("social") >= 2:
  You tell him that Kaplan asked for him to be left alive and that Ain asked for nothing of the kind. You tell him which man will send the next rider.
  Kaplan was always the careful one. # speaker: Ash
  He says he will leave on his own legs, and that Ain will hear he was driven out. He packs his tin cup, and he does not take the road toward Kiln.
  ~ give_money(kaplan_pay)
  A Kiln rider counts {kaplan_pay} M into your hand at the Yard gate. # reveal: all
  By the end of the week a pair of riders sit where Ash sat. They do not ask to see pins. They ask to see your cargo.
  -> END
- else:
  You say what Kaplan said, and you say it badly. Ash laughs once, short and dry.
  Kaplan sends a message and Ain sends the riders. Which one did you think was coming? # speaker: Ash
  He does not move from the box. By dusk a pair of Kiln riders have taken the bend and Ash is gone from it, and nobody will tell you how.
  A Kiln rider leans on the Yard gate and does not pay you. Kaplan asked for it to be clean, and clean did not happen. # speaker: Rider
  They sit where Ash sat. They do not ask to see pins. They ask to see your cargo.
  -> END
}

=== warn ===
~ bend_fate = "ash"
You ride to the bend and tell Ash what both offers say. He listens without moving. # page # place: North bend
Silver would send soldiers, and Kaplan would send a rider who likes me, and neither one of them will ask twice. # speaker: Ash
He rolls the tin cup between his hands.
I will stay. A man cannot hold a bend if he runs, and somebody has to look at the pins. # speaker: Ash
You leave without the pay of either job.
-> END

=== pins ===
~ bend_fate = "ash"
You hold out the money, and Ash does not take it at once. # page # place: North bend
It will go to the next driver who cannot pay for his second pin, and I will write the name down. # speaker: Ash
He tucks it into the tin cup. The next truck stops at the bend, and he is crouched by its mount before you are out of sight.
He does not mention Silver or Kaplan, because he does not need to.
-> END

=== bench ===
You carry a drill, a clamp and a bar of hull plate up the bend and set them on a flat rock in the shade of the wall. # place: North bend
Ash watches without a word. A truck with a single pin rolls up and stops for him.
{ skill("machining") >= 2:
  ~ bend_fate = "bench"
  You clamp the Nose ring and bore the second hole true to the first, then ream it and set a pin. The driver tries the lock twice and grins.
  The next truck is a Yard hauler with a Nose mount. Ash puts out his hand for the coin and gives it back, because the bench takes no fee.
  By dusk the road behind you is full of trucks that do not need a thumb on their pins. Silver can say nothing against a mount that holds, the Administrator loses a fee on every one, and Ash loses his reason to sit here.
  -> END
- else:
  You clamp the ring and bore the hole, and it runs off the mark by a hair that you do not see.
  The truck rolls on, and a little way up the bend the pin walks and the gun swings across the bed. The driver wrestles it back and curses your name at the top of his lungs.
  Ash climbs the road to find him and comes back with a new ring on his shoulder.
  { money() >= bench_fee:
    ~ pay(bench_fee)
    The ring comes out of your pocket, and {bench_fee} M goes into Ash's tin. # reveal: all
  }
  Ash takes the drill from the rock and puts it back in your truck.
  Look at pins, friend. Do not make them. # speaker: Ash
  -> road
}

=== exposed ===
Sully Okafor listens with his back to the window and his coin still in his hand. # page # place: Crane office
{ scarf:
  ~ bend_fate = "exposed"
  ~ yard_power = "yard"
  ~ post_file = "named"
  You lay the red scarf on his desk, and he flips it over. The edges are cut straight, and it has never seen a day of wind.
  A pair of crane crews climb the bend before midnight. The crate is gone from the rocks when they reach them, and the sergeant is standing by the bare stone asking what they came for. # place: North bend
  They show him the scarf. He looks at it for a long moment and says nothing, and then he looks at you.
  Back in the crane office, Sully hangs the scarf in his window where the post can see it. # place: Crane office
  I show what I am given, and the captain will know whose hand gave it to me. I cannot stop that, and I will not pretend I tried. # speaker: Sully
  -> END
- else:
  You tell him what you saw from the rise, and he hears it out without a word.
  A pair of crane crews climb the bend before midnight, and when they reach the rocks there is only dust and stone.
  I cannot show a soldier's shadow, friend, and a story without a thing to hold is only weather. # speaker: Sully
  { money() >= crew_fee:
    ~ pay(crew_fee)
    He charges for the crews and does not smile, and {crew_fee} M goes onto his desk. # reveal: all
  }
  -> road
}

=== hush ===
Captain Silver listens to you with his hands behind his back. # page # place: Post command
{ scarf:
  ~ bend_fate = "hush"
  ~ yard_power = "post"
  ~ post_file = "clean"
  ~ give_money(silver_pay)
  You put the red scarf on his table. He looks at it for a long time, and then he opens the stove door and drops it in.
  The post keeps what the post keeps. You will say nothing of this to anyone, and the bend will stay as it is until I have need of it. # speaker: Silver
  He counts {silver_pay} M onto the table. # reveal: all
  -> END
- else:
  ~ post_file = "named"
  You tell him what you saw from the rise, and he hears you to the end.
  A story needs a thing to go with it, and you have brought me only the story. # speaker: Silver
  He calls a soldier to walk you to the gate, and the soldier writes your name in a small book as you go.
  -> road
}
