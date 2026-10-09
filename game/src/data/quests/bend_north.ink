# view: page
# stat: money Money
# fact: seen_ash North bend: Ash Kerimov stops every truck and asks to see its swivel pins.
# fact: ash_story Ash: Emil Kessel died at this bend on a single pin. Ash pays for a second pin when a driver cannot. He rode for Scrapjaw once.
# fact: heard_kaplan Kaplan: Kiln pays to see Ash gone from the bend. Kaplan asks that Ash be left alive.
INCLUDE world.ink

VAR seen_ash = false
VAR ash_story = false
VAR heard_kaplan = false
VAR silver_pay = 150
VAR kaplan_pay = 180
VAR fund = 60

=== start ===
# checkpoint: start
-> road

=== road ===
# checkpoint: road
The north road runs empty from the Yard gate. Captain Silver has named his price. # page # place: Salvage Yard
{ heard_kaplan: A Kiln rider has also said what Kaplan pays. }
+ {not heard_kaplan} [Speak to the Kiln rider who watches you from the scrap heap.]
  -> messenger
+ {not seen_ash} [Ride to the north bend and see the man.]
  -> bend
+ [Take Captain Silver's job.]
  -> silver_job
+ {heard_kaplan} [Take Kaplan's job.]
  -> kaplan_job
+ {seen_ash} [Ride back and warn Ash.]
  -> warn
+ {seen_ash} [Leave money with Ash for pins. # cost: {fund}]
  -> pins
+ [Leave it for now.]
  -> END

=== messenger ===
~ heard_kaplan = true
~ note("bendKaplan")
The rider wears a rust-red scarf and sits on a drum of oil. She waves you over without getting up. # place: Salvage Yard
Kaplan sends word. He says the man at the north bend slows the road. # speaker: Rider
A slow road feeds nobody. A truck pinned twice shoots straight, and Kiln folk bleed for it. Ain wants him gone. # speaker: Rider
Kaplan says do it clean. Move him on, and do not leave him in a ditch. He pays <b>{kaplan_pay} M</b>. # speaker: Rider
She spits and does not wait for an answer.
-> road

=== bend ===
~ seen_ash = true
~ ash_story = true
~ note("bendAsh")
The man sits on an ammunition box where the bend narrows. A grey scarf is wound round his neck. # place: North bend
He lifts a hand, and you stop. He walks the length of your truck bed and looks at the gun mount.
Show me your pins. # speaker: Ash
He crouches and puts a thumb on each one. He nods and lets you go on.
Then he looks at the wall of the bend, where Emil Kessel's wreck lies.
Emil Kessel went off here. His swivel slid on the curve and the gun came round into his cab. One pin. I found him. # speaker: Ash
So I sit here. I look at the pins. A driver with a single pin gets a choice. A second pin costs a little at the Salvage Yard. I pay it when they cannot. # speaker: Ash
The patch of a Scrapjaw outrider is cut from the sleeve of his coat. The stitches are still there.
I rode for Scrapjaw. I told robbed drivers what to buy, so they would not be robbed twice. Rook did not like it. Ain liked it less. # speaker: Ash
-> road

=== silver_job ===
~ bend_fate = "silver"
~ give_money(silver_pay)
You ride to the bend with Silver's price in your pocket. Ash watches you come. # page # place: North bend
You tell him the post wants the bend clear. You tell him the next men to come will carry rifles and not words.
Ash looks at the road and not at you. He folds his scarf and packs a tin cup into his coat.
Tell Silver it is a public road. # speaker: Ash
He walks off up the bend and does not look back.
Silver counts <b>{silver_pay} M</b> onto his table. The post will hold the bend now. # reveal: all
At dusk a Nose truck takes the bend with its gun on a single pin. Nobody asks to see it.
-> END

=== kaplan_job ===
~ bend_fate = "kiln"
~ give_money(kaplan_pay)
You ride to the bend and tell Ash what Kaplan sent. Ash listens with his eyes on the wall. # page # place: North bend
Kaplan was always the careful one. # speaker: Ash
He says he will leave on his own legs, and that Ain will hear he was driven. He packs his tin cup. He does not take the road to Kiln.
A Kiln rider counts <b>{kaplan_pay} M</b> into your hand at the Yard gate. # reveal: all
By the week's end a pair of riders sit where Ash sat. They do not ask to see pins. They ask to see your cargo.
-> END

=== warn ===
~ bend_fate = "ash"
You ride to the bend and tell Ash what both offers say. He listens without moving. # page # place: North bend
Silver would send soldiers. Kaplan would send a rider who likes me. Neither will ask twice. # speaker: Ash
He rolls the tin cup between his hands.
I will stay. A man cannot hold a bend if he runs. And somebody has to look at the pins. # speaker: Ash
You leave without the pay of either job.
-> END

=== pins ===
~ bend_fate = "ash"
You hold out the money. Ash does not take it at once. # page # place: North bend
It goes to the next driver who cannot pay. I write the name down. # speaker: Ash
He tucks it into the tin. The next truck stops at the bend, and he crouches by its mount before you are out of sight.
He does not mention Silver or Kaplan. He does not need to.
-> END
