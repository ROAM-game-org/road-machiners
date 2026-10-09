# view: page
# stat: money Money
# fact: saw_cut North bend: Emil's wreck is bare. The ring under the gun was torched off at the base. The bolts still stand in the bed.
# fact: yard_tally Yard tally: a Nose steel ring, torch cut, bought as scrap the week Emil died. Sold on to a Kiln hauler.
# fact: otto_read Otto: a Nose ring carries the gate stamp on its flat and a single pin hole. A Brann ring has a small mark and a second pin.
# fact: saw_roster Crane office: Captain Silver's patrol roster lies in a drawer, copied twice in one small hand. The corner of one copy says M. Kessel.
# fact: has_ring Kiln: the ring with the gate stamp and a single pin hole. Bought from a rider.
INCLUDE world.ink

VAR saw_cut = false
VAR yard_tally = false
VAR otto_read = false
VAR saw_roster = false
VAR has_ring = false
VAR ring_price = 40
VAR silver_pay = 150
VAR silver_extra = 100
VAR sully_pay = 90
VAR mara_pay = 60

=== start ===
# checkpoint: start
-> desk

=== desk ===
# checkpoint: desk
The crane hangs over the stacked wrecks. The north road waits beyond the gate. # page # place: Salvage Yard
Mara wants a ring of Nose steel with a single pin hole. Someone cut it off Emil's truck and sold it.
+ {not saw_cut} [Ride out to Emil's wreck on the north bend.]
  -> wreck
+ {not yard_tally} [Ask at the yard tally.]
  -> tally
+ {not saw_roster} [Ask the Administrator what the yard knows.]
  -> crane
+ {found("ridge-wrecks") and not otto_read} [Drive to Ridge Wrecks and ask Otto Brann.]
  -> ridge
+ {found("kiln") and yard_tally and otto_read and not has_ring} [Find the Kiln truck that bought the ring.]
  -> kiln
+ {has_ring} [Take the ring to Mara.]
  -> to_mara
+ {has_ring} [Take the ring to Captain Silver.]
  -> to_silver
+ {has_ring} [Take the ring to the Administrator.]
  -> to_sully
+ [Leave it for now.]
  -> END

=== wreck ===
~ saw_cut = true
The north bend is a shelf of cut rock with a drop on its left. # place: North bend
Emil Kessel's truck lies against the wall, burnt black. The bed is bare.
The ring that held the gun is gone. A torch cut it off at the base, and the cut is clean. The bolts still stand in the steel.
Farther up the bend a man sits on an ammunition box. He watches you and says nothing.
-> desk

=== tally ===
~ yard_tally = true
The tally boy keeps a slate on a chain. He wets his thumb and runs it down the lines. # place: Yard tally
Bought; From; Sold on # head
Cab door, Army; Pierce depot; Yard crane # row
Nose steel ring, torch cut; A stripper off the north road; A Kiln hauler # row
Water drum, dented; Green Pit hauler; Bowl trader # row
The Kiln hauler drove a rust-red cab with a stripe down the door. He comes by for scrap each week.
-> desk

=== crane ===
~ saw_roster = true
~ note("pinRoster")
The Administrator's office sits high in the crane frame, with glass on every side. # place: Crane office
Sully Okafor flips a coin across his knuckles. He stops when you look at it.
A Nose ring does not sit in my yard, friend. If one turned up, I would want it kept dry. # speaker: Sully
He talks about the weather while you look around. A drawer stands open under the window.
Captain Silver's patrol roster lies in it, stamped with the post seal. Under it lies the same roster in a small slanted hand. A corner says <i>M. Kessel</i>.
Sully closes the drawer with his knee.
I care for my people as I can. Everyone here is somebody's people. # speaker: Sully
-> desk

=== ridge ===
~ otto_read = true
~ note("pinStamp")
Otto Brann works at a bench under a sheet of hull plate. His granddaughter Lenka holds the other end of a ring. # place: Ridge Wrecks
You describe the ring from the yard tally. Otto stops welding.
Nose steel. It will have the gate stamp on the flat. And one hole, where a second pin should go. # speaker: Otto
They copied my swivel and cut the pin. A pin is a pin, they said. # speaker: Otto
Lenka sets down her tongs. Emil Kessel came here the winter before. He asked what a second pin would cost. # speaker: Lenka
He said payday. He said it twice. # speaker: Otto
Otto signs every weld with a small mark. He looks at the bench and does not sign anything while you are there.
-> desk

=== kiln ===
Kiln Camp smells of hot iron and burnt oil. # place: Kiln Camp
A rust-red cab stands by the furnace. A Nose ring is bolted into its bed, with a fresh gun on it.
The rider wipes her hands. She does not stand.
Good steel. It came off a dead Nose man. They are all dead Nose men, in the end. # speaker: Rider
The gate stamp is on the flat. The single pin hole runs through it.
+ [Buy the ring for {ring_price} M. # cost: {ring_price}]
  ~ has_ring = true
  The rider unbolts it while you watch. She does not ask why you want it.
  Take it and go. The furnace does not like questions. # speaker: Rider
  -> desk
+ [Walk away.]
  -> desk

=== to_mara ===
~ pin_fate = "mara"
~ give_money(mara_pay)
Mara takes the ring in both hands and holds it to the light. # page # place: Post gate desk
She runs her thumb over the gate stamp. Then over the single hole.
Nose handed him this and called it safe. # speaker: Mara
She counts <b>{mara_pay} M</b> into your palm. It is what the ring cost, and a little more. # reveal: all
She wraps the ring in oilcloth and puts it in her own locker under the desk.
-> pact_mara

= pact_mara
# checkpoint: to_mara.pact_mara
Mara lowers her voice and thanks you again.
{ saw_roster: She watches your face. She has the look of a woman counting. }
+ {saw_roster} [Tell her what you saw in the crane office.]
  She is quiet a long time. Then she nods.
  Then you know. Nobody else does, and nobody will. # speaker: Mara
  -> END
+ {saw_roster} [Say nothing.]
  -> END
+ {not saw_roster} [Leave.]
  -> END

=== to_silver ===
~ pin_fate = "silver"
~ give_money(silver_pay)
Captain Silver receives you in the post's long room. He does not offer a seat. # page # place: Post command
He holds the ring up by one finger and reads the gate stamp. His face does not change.
Nose steel. A lot of folk would like to hold this and say what it proves. # speaker: Silver
He walks to the yard forge and drops the ring in the slag drum. It sags and goes red, then orange, then nothing.
He counts <b>{silver_pay} M</b> onto the table. # reveal: all
That ring is gone. So is anything anyone says about it. # speaker: Silver
-> pact_silver

= pact_silver
# checkpoint: to_silver.pact_silver
{ saw_roster: Silver does not look at the forge. He looks at you. | Silver goes back to his table. }
{ saw_roster:
  My patrol roster leaves this post and comes back. A yard boy says you sat in the crane office today. Whose hand was on the paper there? # speaker: Silver
}
+ {saw_roster} [Tell him it was Mara Kessel.]
  -> told_silver
+ {saw_roster} [Say you saw nothing.]
  He holds your eyes a moment too long. Then he nods.
  -> END
+ {not saw_roster} [Leave.]
  -> END

=== told_silver ===
~ pin_pact = "silver"
~ give_money(silver_extra)
Silver says nothing for a while. Then he calls for a pair of soldiers. # page # place: Post command
They take Mara Kessel from her desk at dusk. She does not look at you. She carries both ledgers, one under each arm.
Silver counts <b>{silver_extra} M</b> more onto the table. # reveal: all
-> END

=== to_sully ===
~ pin_fate = "sully"
~ give_money(sully_pay)
Sully Okafor takes the ring and weighs it in his hand. He does not flip a coin. # page # place: Crane office
Gate stamp. A single hole. A paper a judge can hold, if a judge ever sits here. # speaker: Sully
He opens a drawer and sets the ring beside a thick book with a Pierce seal. He locks the drawer.
Silver wants it in the slag drum. I want it where it can be shown. # speaker: Sully
He counts <b>{sully_pay} M</b> onto the desk. # reveal: all
The yard keeps what it is given. That is the only law I trust. # speaker: Sully
-> END
