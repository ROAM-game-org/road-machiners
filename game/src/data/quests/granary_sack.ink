# view: page
# stat: money Money
# fact: log_read Gate log: every armed truck chalked as it crossed, and a sack owed to Kiln for each. Both columns agree.
# fact: store_read Store book: more sacks left the store this week than the boards add up to.
# fact: carter_said Carter: the collector at the drop keeps the tally on his own stick. The carters never see it.
# fact: drop_seen Kiln drop: the collector notched his stick for sacks that never left a cart. A second wagon waits behind the rocks.
# fact: weigher_said Night weigher: he signs sacks out after the sentry goes off. His cousin eats from the store.
INCLUDE world.ink

VAR log_read = false
VAR store_read = false
VAR carter_said = false
VAR drop_seen = false
VAR weigher_said = false
VAR bribe = 60
VAR reward = 90
VAR board_cost = 10

=== function collector_proof() ===
~ return log_read + store_read + carter_said + 2 * drop_seen

=== start ===
# checkpoint: start
Odile Marsh keeps the weigh house over the Granary gate. A tally stick hangs from her belt. # place: The Granary
A pair of boards hangs on the gate post, chalked in her hand. One counts the sacks paid to Kiln Camp. One counts the tenants' share for the road patrol.
I count every sack at night. Every night the sacks that left the store are more than both boards add up to. # speaker: Odile
Someone is taking between them. I cannot stand at the store and at the drop both. # speaker: Odile
Find who. Quietly. If the tenants hear I am short, they will say I am short on purpose. # speaker: Odile
+ [I will count with you.]
  ~ note("sackGate")
  -> desk
+ [Not my business.]
  -> END

=== desk ===
# checkpoint: desk
The weigh house smells of dust and sacking. The yard beyond is full of carts. # page # place: The Granary
+ {not log_read} [Read the gate log.]
  -> log
+ {not store_read} [Count the store book against the boards.]
  -> store
+ {not carter_said} [Ask a carter in the yard.]
  -> carter
+ {not weigher_said} [Ask the night weigher.]
  -> weigher
+ {not drop_seen} [Watch the Kiln drop.]
  -> drop
+ {log_read and store_read} [Chalk the true counts on a new board. # cost: {board_cost}]
  -> posted
+ [Tell Odile who it is.]
  -> accuse
+ [Let it go.]
  -> END

=== log ===
~ log_read = true
The sentry keeps the gate log on a slate behind the post. # place: The Granary gate
Day; Armed trucks through; Sacks owed Kiln # head
First; 4; 4 # row
Second; 3; 3 # row
Third; 5; 5 # row
Odile's columns match the sentry's. Whatever is missing goes missing after the gate.
-> desk

=== store ===
~ store_read = true
~ note("sackStore")
The store book lies open on the weighing block, in a tenant's careful hand. # place: The weigh house
Day; Sacks out; Boards add up to # head
First; 19; 14 # row
Second; 17; 12 # row
Third; 22; 17 # row
Each day the same few sacks fall between the store and the boards.
-> desk

=== carter ===
~ carter_said = true
A carter sits on his tailboard, picking dust out of a rope. # place: The cart yard
{ pipe_fate == "read":
  Since a book was read at this gate, the carters talk to anyone who asks.
}
We load full. We hand over at the drop. The collector counts, and the collector keeps the count on his own stick. # speaker: Carter
We never see the stick. He wears a Kiln collar and he shouts if you ask. # speaker: Carter
His own wagon stands behind the rocks, off the road. I never asked what is in it. # speaker: Carter
-> desk

=== weigher ===
~ weigher_said = true
The night weigher scratches his neck and does not meet your eye. # place: The weigh house
I sign sacks out when the sentry goes off. Odile knows. My cousin has no work, and she eats from the store. # speaker: Weigher
A sack here and there. A pair on a bad week. It is not enough to fill the gap. # speaker: Weigher
-> desk

=== drop ===
~ drop_seen = true
~ note("sackDrop")
The drop is a flat place on the road where the carts stop and the Kiln collector waits. # place: The Kiln drop
He wears a Kiln collar and carries a notched stick. He notches it for every sack the carters hand down.
Then he notches it again, for sacks that never left a cart.
A second wagon waits behind the rocks. The collector walks the extra sacks over, a few at a time, while the carters look at the road.
He sees you watching. He does not hurry.
Kiln is owed what the gate says. The rest is a fee for the walking. Nobody counts it. # speaker: Collector
He holds out an envelope. It is thick. # reveal: all
+ [Take the envelope.]
  -> cut
+ [Shake your head and go.]
  -> desk

=== accuse ===
Odile waits at the weigh house door with her stick held in both hands. # place: The weigh house
Who? # speaker: Odile
+ [The Kiln collector.]
  -> name_collector
+ [The night weigher.]
  -> name_weigher
+ [Not yet.]
  -> desk

=== name_collector ===
{ collector_proof() >= 3:
  -> closed
}
Odile shakes her head. # place: The weigh house
A collector in a Kiln collar is not a name I can say to Kiln on a guess. Bring me more. # speaker: Odile
-> desk

=== name_weigher ===
{ not weigher_said:
  Odile shakes her head. # place: The weigh house
  Why him? # speaker: Odile
  -> desk
}
-> blamed

=== closed ===
~ sack_fate = "closed"
~ give_money(reward)
Odile sends a pair of carters and the sentry to the drop with her own tally stick. # page # place: The Kiln drop
The collector reaches for his stick. The sentry holds it up, notch by notch, against the gate log.
He goes back to the camp on foot. Kiln's riders get what the gate says, and no more.
The tenants' board grows by a few sacks. Odile does not smile.
She counts <b>{reward} M</b> into your hand from the steward's purse. # reveal: all
-> END

=== cut ===
~ sack_fate = "cut"
~ give_money(bribe)
The envelope holds <b>{bribe} M</b>. # reveal: all # page # place: The Kiln drop
The collector nods once. He walks the next sacks to the second wagon and does not look at the carters.
You tell Odile the count is only dust and bad chalk. She believes you for a while.
The tenants' board stays short.
-> END

=== posted ===
~ sack_fate = "posted"
You buy a board and chalk from the cart yard. # page # place: The Granary gate
Under the boards you chalk a new one. Sacks out of the store, sacks owed Kiln, sacks in the tenants' share. The ones that fall between them you chalk in a column of their own.
The queue stops to read it. Someone says the number aloud, and then the one behind him does.
Odile stands in the weigh house door. She does not wipe it off. She does not thank you.
By dusk the carters are asking at the drop who holds the stick.
-> END

=== blamed ===
~ sack_fate = "blamed"
Odile sends the sentry to the weigh house. # page # place: The weigh house
The night weigher does not argue. He puts his stick on the block and walks out through the gate with his cousin behind him.
The count is short the next night, and the night after.
<color=blood>The collector's wagon behind the rocks does not mind.</color>
-> END
