# view: page
# stat: money Money
# fact: log_read Gate log: every armed truck chalked as it crossed, and a sack owed to Kiln for each. Both columns agree.
# fact: store_read Store book: more sacks left the store this week than the boards add up to.
# fact: carter_said Carter: the collector at the drop keeps the tally on his own stick. The carters never see it.
# fact: drop_seen Kiln drop: the collector notched his stick for sacks that never left a cart. A second wagon waits behind the rocks.
# fact: weigher_said Night weigher: he signs sacks out after the sentry goes off. His cousin eats from the store.
# fact: beam_read Weighing block: the poise weight on the beam is lighter than its stamp. The file marks on its edge are bright.
# fact: stick_taken Collector's stick: a row of notches for the carts, and a second row with no cart behind it.
INCLUDE world.ink

VAR log_read = false
VAR store_read = false
VAR carter_said = false
VAR drop_seen = false
VAR weigher_said = false
VAR beam_read = false
VAR stick_taken = false
VAR warned = false
VAR pin_bent = false
VAR bribe = 60
VAR reward = 70
VAR board_cost = 10
VAR hush = 40
VAR toll = 40
VAR mend_fee = 50
VAR pin_cost = 20
VAR beating = 60

=== function collector_proof() ===
~ return log_read + store_read + carter_said + 2 * drop_seen + 3 * stick_taken

=== start ===
# checkpoint: start
Odile Marsh keeps the weigh house over the Granary gate, and a tally stick hangs from her belt like a second set of fingers. # place: The Granary
A pair of boards hangs on the gate post, chalked in her hand. One counts the sacks paid to Kiln Camp, and the other counts the tenants' share for the road patrol.
I count every sack at night with my own eyes. Every night more sacks have left the store than both boards add up to. # speaker: Odile
Somebody's taking the difference, and I can't stand at the store and at the drop both. # speaker: Odile
I need you to find out who, and quietly. If the tenants hear I'm short, they'll say I'm short on purpose. # speaker: Odile
If it's a small man, I can put him out of the gate and the tenants will see it done. A large one is another matter. # speaker: Odile
+ [I will count with you.]
  ~ note("sackGate")
  -> desk
+ [Not my business.]
  -> END

=== desk ===
# checkpoint: desk
The weigh house smells of dust and sacking, and the yard beyond is crowded with carts and the noise of mules being backed into shafts. # page # place: The Granary
+ {not log_read} [Read the gate log and the store book against the boards.]
  -> books
+ {not carter_said} [Ask a carter in the yard.]
  -> carter
+ {not weigher_said} [Ask the night weigher.]
  -> weigher
+ {not beam_read and not pin_bent} [Check the beam on the weighing block.]
  -> beam
+ {not drop_seen} [Watch the Kiln drop.]
  -> drop
+ {log_read and store_read} [Chalk the true counts on a new board. # cost: {board_cost}]
  -> posted
+ [Tell Odile who it is.]
  -> accuse
+ [Let it go.]
  -> END

=== books ===
~ log_read = true
~ store_read = true
~ note("sackStore")
The sentry keeps the gate log on a slate behind the post, and the store book lies open on the weighing block in a tenant's careful hand. # place: The weigh house
Day; Armed trucks through; Sacks owed Kiln; Sacks out of the store; Boards add up to # head
First; 4; 4; 19; 14 # row
Second; 3; 3; 17; 12 # row
Third; 5; 5; 22; 17 # row
Odile's columns match the sentry's line for line, so whatever goes missing goes missing after the gate.
Each day the same few sacks fall between the store and the boards.
-> desk

=== carter ===
~ carter_said = true
A carter sits on his tailboard, picking dust out of a length of rope with a patience that suggests he has been doing it all morning. # place: The cart yard
{ pipe_fate == "read":
  Since a book was read at this gate, the carters talk to anyone who asks.
}
We load the carts full and hand the sacks over at the drop. The collector counts them down, and he keeps his count on his own stick. # speaker: Carter
Not one of us has ever seen that stick. He wears a Kiln collar and he shouts if you ask. # speaker: Carter
His own wagon stands behind the rocks, off the road. I never asked what's in it, and I'd advise you not to. # speaker: Carter
-> desk

=== weigher ===
~ weigher_said = true
The night weigher scratches his neck and does not meet your eye. # place: The weigh house
I sign sacks out after the sentry goes off. Odile knows it. My cousin's got no work, and she eats from the store. # speaker: Weigher
It's a sack here and a pair on a bad week. I know that's not enough to fill the gap you're asking about. # speaker: Weigher
-> desk

=== beam ===
The weighing block stands in the middle of the weigh house, an iron beam balanced on a knife edge and worn bright where hands have steadied it. # place: The weigh house
You set the poise weight on its arm and watch the tongue.
{ skill("machining") >= 2:
  -> beam_true
}
-> beam_bent

=== beam_true ===
~ beam_read = true
~ note("sackBeam")
The beam swings true and settles. Then you weigh the poise itself against a stamped bolt from your own kit.
It is a hand lighter than its stamp. Bright file marks run along its edge, and the filings are not in the dust.
Every sack on this block reads heavier than the sack is, and the boards add up short by the same margin, day after day.
The filing does not account for the whole gap, though it would hide a part of it. Who held the file, the iron does not say.
-> desk

=== beam_bent ===
~ pin_bent = true
~ temp due = pin_cost
{ money() < due:
  ~ due = money()
}
~ pay(due)
You press on the arm to see how it moves, and the knife edge slips and the pin bends with a small sound like a dropped coin.
The sentry looks up from the door. A stranger has taken the steward's block apart, and it no longer hangs true. The tenants in the yard stop talking.
The smith by the cart yard charges {due} M for a new pin. # reveal: all
-> desk

=== drop ===
The drop is a flat place on the road where the carts stop and the Kiln collector waits, with nothing around it but dust and a few tilted rocks. # place: The Kiln drop
{ warned:
  The rocks are bare now. The second wagon is gone, and the collector notches his stick for every cart out loud, where everyone can hear it.
  He knows your truck, and he does not look at it.
  -> desk
}
~ drop_seen = true
~ note("sackDrop")
He wears a Kiln collar and carries a notched stick. He notches it for every sack the carters hand down.
Then he notches it again, for sacks that never left a cart.
A second wagon waits behind the rocks. The collector walks the extra sacks over to it a few at a time, while the carters look carefully at the road.
He sees you watching, and he does not hurry.
Kiln is owed what the gate says. The rest is a fee for the walking. Nobody counts it, and I'd prefer that nobody started. # speaker: Collector
He holds out an envelope, and it is thick. # reveal: all
+ [Take the envelope.]
  -> cut
+ [Offer to write his walking fee on the gate, so everyone can see it.]
  -> parley
+ [Take his stick.]
  -> grab
+ [Shake your head and go.]
  -> desk

=== parley ===
{ skill("social") >= 2:
  -> struck
}
-> refused

=== struck ===
~ sack_fate = "dealt"
The collector listens with his head on one side. You keep your hands open and talk about famine and long roads, and about what a fee costs when nobody is allowed to say it aloud. # page # place: The Kiln drop
You say that a fee which is written is a fee which is paid, and that a fee which is stolen makes a tenant with a rifle.
He looks at the second wagon, and then at the road. He names a sack for every cart. # speaker: Collector
Kaplan will hear of it from me and not from a carter. # speaker: Collector
You carry the number to the weigh house. Odile reads it twice and says nothing, and then she chalks a third column on the gate board in her own hand.
The tenants' board is shorter than it was. The skimming is a fee now, and it is written down. # reveal: all
-> END

=== refused ===
~ warned = true
~ temp due = toll
{ money() < due:
  ~ due = money()
}
~ pay(due)
The collector laughs, and not kindly. A rider comes out from the rocks and leans on your fender. # place: The Kiln drop
A man who wants things written down will end up with something written about him. # speaker: Collector
The rider takes {due} M for the walking, and by evening the second wagon will be gone from the rocks. # reveal: all
-> desk

=== grab ===
{ skill("toughness") >= 3:
  -> seized_stick
}
-> beaten

=== seized_stick ===
~ stick_taken = true
You close a hand over the stick and pull. The collector holds on for a breath, and you do not let go.
A pair of riders step out from the rocks and stop. They look at your shoulders, and at your truck, and at each other.
He lets go. He says nothing, and the way he says it is a promise. # speaker: Collector
The stick holds a row of notches for the carts and a second row with no cart behind it.
-> desk

=== beaten ===
~ warned = true
~ temp due = beating
{ money() < due:
  ~ due = money()
}
~ pay(due)
You close a hand over the stick. A rider hits you in the ribs, and another hits you where you fall.
They take {due} M from your coat and slam your truck's door on your boot. # reveal: all
By evening the second wagon will be gone from the rocks.
-> desk

=== accuse ===
Odile waits at the weigh house door with her stick held in both hands. # place: The weigh house
Then who is it? # speaker: Odile
+ [The Kiln collector.]
  -> name_collector
+ [The night weigher.]
  -> name_weigher
+ {beam_read} [The poise weight on your own block.]
  -> mended
+ [Not yet.]
  -> desk

=== name_collector ===
{ collector_proof() >= 4:
  -> closed
}
Odile shakes her head. # place: The weigh house
A collector in a Kiln collar isn't a name I can say to Kiln on a guess. Bring me more than that. # speaker: Odile
-> desk

=== name_weigher ===
{ not weigher_said:
  Odile shakes her head. # place: The weigh house
  Why him? I haven't heard a reason yet. # speaker: Odile
  -> desk
}
-> blamed

=== closed ===
~ give_money(reward)
{ stick_taken:
  ~ sack_fate = "forced"
- else:
  ~ sack_fate = "closed"
}
Odile sends a pair of carters and the sentry to the drop with her own tally stick. # page # place: The Kiln drop
{ stick_taken:
  The sentry lays the collector's own stick against the gate log, notch by notch. The second row has nothing to stand on.
- else:
  The collector reaches for his stick. The sentry holds it up, notch by notch, against the gate log.
}
He goes back to the camp on foot. Kiln's riders get what the gate says, and no more.
The tenants' board grows by a few sacks. Odile does not smile.
She counts {reward} M into your hand from the steward's purse. # reveal: all
{ stick_taken:
  By dawn a Kiln rider has been and gone. A pair of Granary carts stand stripped on the east road, and nobody is hurt.
- else:
  By dawn a notched stick lies on the gate post. Nobody saw who left it.
}
-> END

=== cut ===
~ sack_fate = "cut"
~ give_money(bribe)
The envelope holds {bribe} M. # reveal: all # page # place: The Kiln drop
The collector nods once. He walks the next sacks to the second wagon and does not look at the carters.
He knows your truck now, and he knows what it costs. Next time he will not need to ask.
You tell Odile the count is only dust and bad chalk, and she believes you for a while.
The tenants' board stays short.
-> END

=== posted ===
~ sack_fate = "posted"
You buy a board and chalk from the cart yard. # page # place: The Granary gate
Under the boards you chalk a new one. Sacks out of the store, sacks owed Kiln, sacks in the tenants' share, and the ones that fall between them in a column of their own.
The queue stops to read it. Someone says the number aloud, and then the man behind him does.
Odile stands in the weigh house door. She does not wipe it off, and she does not thank you.
By dusk the carters are asking at the drop who holds the stick, and by night the second wagon is gone from the rocks.
-> END

=== blamed ===
~ sack_fate = "blamed"
~ give_money(hush)
Odile sends the sentry to the weigh house. # page # place: The weigh house
The night weigher does not argue. He puts his stick on the block and walks out through the gate with his cousin behind him.
Odile presses {hush} M into your hand for your trouble, and she does not meet your eye. # reveal: all
The tenants see a man put out of the gate. The count is short the next night, and the night after.
<color=blood>The collector's wagon behind the rocks does not mind.</color>
-> END

=== mended ===
~ sack_fate = "mended"
~ give_money(mend_fee)
Odile weighs the poise herself, twice, against the stamped bolt you set on her block. # page # place: The weigh house
She says nothing for a long while. Then she takes a file from a nail and drops it in the stove.
She hangs a true poise on the arm, and the next night's boards add up closer than they have in a year.
The gap isn't closed. A smaller one stays, and nobody says whose it is. # speaker: Odile
She counts {mend_fee} M into your hand and asks you to say nothing of the file. # reveal: all
-> END
