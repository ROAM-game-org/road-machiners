# view: page
# stat: money Money
# fact: lamps_seen Posts: every lamp is painted with a Pierce lien number. Under the flaking paint on one post an older number shows, in a thinner hand.
# fact: juno_said Juno: she sells oil to the Bowl first and lights the lamps with what is left. The last lamp is resting, she says.
# fact: tam_said Tam: the oil can is lighter every week. The last lamp is dry, and a Pierce tag is wired to its post.
# fact: slip_read Carter's slip: the Granary pays for the oil, and the coin goes to a Pierce clerk. Juno's name is not on it.
# fact: paper_seen Carter's coat: a rolled paper under a Granary seal. Its date is older than the dark lamp.
INCLUDE world.ink

VAR lamps_seen = false
VAR juno_said = false
VAR tam_said = false
VAR slip_read = false
VAR paper_seen = false
VAR guarded = false
VAR sour = false
VAR lien = 120
VAR offer = 100
VAR quarter = 40

=== function lien_due() ===
{ guarded:
  ~ return lien + quarter
}
~ return lien

=== start ===
# checkpoint: start
At the edge of the Glass Flats lies a field of open pods, rusted shells half sunk in the dust beside the fused glass, and the wind sets their hatches creaking like a congregation. # place: Glass Flats
A line of posts, welded from hull plate, follows the debris trail across it with a lamp on top of each.
An old woman sits on a stool at the foot of the first post with a rag in her lap. A young man with a stiff leg is already on the ladder.
-> foot

=== foot ===
# checkpoint: foot
The Granary cart stands at the foot of the ladder, and a man in a Pierce coat writes in a book on its tailboard. # page # place: Glass Flats
{ guarded:
  A pair of the clerk's men stand by the cart now, with their hands resting on their belts.
}
+ {not lamps_seen} [Walk the line of lamps.]
  -> lamps
+ {not juno_said} [Sit with Juno.]
  -> juno
+ {not tam_said} [Go up the ladder with Tam.]
  -> tam
+ {not slip_read} [Ask the carter for his slip.]
  -> slip
+ {slip_read} [Pay the clerk the lien on the dark lamp. # cost: {lien_due()}]
  -> paid
+ {lamps_seen and not guarded} [Cut the lien plate off the dry lamp's post and bring up the old number.]
  -> plate
+ {slip_read and not guarded} [Stand in the track and refuse the clerk's cart.]
  -> hold
+ {slip_read and not sour} [Talk the carter into a lease instead of a sale.]
  -> lease
+ {slip_read} [Send the carter away without oil.]
  -> kept
+ {slip_read and tam_said and not sour} [Take the Granary's offer for the lamps.]
  -> sold
+ [Let it go.]
  -> END

=== lamps ===
~ lamps_seen = true
~ note("lampsLien")
You walk the line in the low light, and each post carries a number in fresh yellow paint on a plate welded below the lamp. # place: Glass Flats
Post; Lien paint; Oil tank # head
First; 4417; full # row
Second; 4418; full # row
Third; 4419; half # row
Fourth; 4420; half # row
Fifth; 4421; low # row
Last; 4422; empty # row
On the third post the paint has flaked, and under it an older number shows in a thinner hand. It is not the yellow one.
The lien plates are riveted over the hull, and the old numbers were stamped into the hull itself long before any paint.
-> foot

=== juno ===
~ juno_said = true
Juno Pell does not get up. Her hands are knotted like roots, and she keeps working the rag between them. # place: Glass Flats
I know every pod on this field by its number, child. I knew them long before Pierce came and painted over them. # speaker: Juno
The Granary buys our oil. I sell to them first so the roof holds over our heads, and the lamps get whatever's left. # speaker: Juno
The last one's resting. Every lamp is a pod and every pod is somebody, and not one of them goes dark while I'm alive. # speaker: Juno
-> foot

=== tam ===
~ tam_said = true
~ note("lampsOil")
The ladder is cold iron, and Tam climbs it one rung at a time with his bad leg dragging behind him. # place: The last lamp
A Scrapjaw rider shot me in this leg when they took the fuel truck. Now I climb because she can't. # speaker: Tam
The can was heavier last year. Every week since, it's come up lighter. # speaker: Tam
The last lamp is dry to the wick, and there's a tag from the Pierce office wired to its post. She doesn't know. If that lamp goes, she goes with it. # speaker: Tam
-> foot

=== slip ===
~ slip_read = true
The carter holds the slip out without being asked twice. # place: Glass Flats
Item; Paid by; Paid to # head
Lamp oil, per can; The Granary; Pierce office, lien book # row
{ skill("perception") >= 2:
  ~ paper_seen = true
  A paper is rolled in his coat under the slip. It carries the Granary's seal, and the ink on it is older than the dark lamp.
}
The clerk does not look up from his book.
The Granary pays by the can, and the Corporation takes the coin and writes it against her mother's tag. # speaker: Clerk
A lien is a debt written against a thing, and this one grows every quarter faster than the oil pays it down. The dark lamp falls due before the next cart comes. # speaker: Clerk
If you pay what's owed on it, the Corporation will leave the post alone. # speaker: Clerk
-> foot

=== paid ===
~ lamps_fate = "paid"
~ lien_standing = "debtor"
~ temp due = lien_due()
The clerk takes {due} M and dips a brush. # page # place: The last lamp
He paints a plain stroke over the yellow number, and the tag of Pierce paper comes off the post.
He writes in his book as well. It is your name and your truck, set down beside the number, and Juno never sees the line.
Tam fills the tank from the can on his back. At dusk he lights the wick, and the last lamp burns with the rest.
Juno watches from her stool. She says nothing, but her lips move as if she were counting.
-> END

=== plate ===
You climb the ladder behind Tam with a torch and a chisel on your belt. # page # place: The last lamp
The clerk's plate sits under the dry lamp, yellow on grey, riveted to the hull. The old number lies beneath it, stamped into the plate itself.
{ skill("machining") >= 2:
  -> plated
}
-> burnt

=== plated ===
~ lamps_fate = "plated"
~ lien_standing = "enemy"
You cut the rivets one at a time and ease the plate away before the metal can ring. The old number comes up clean under the grinder, stamped deep.
The clerk climbs a few rungs, sees the bare hull and the stamp, and stops. He has a number in his book and no plate to put it on.
I'll write the post down as unknown and send for a surveyor. He'll come after the next cart. # speaker: Clerk
Tam fills the tank and lights the wick, and the last lamp burns with the rest.
The clerk writes your truck on a page by itself. # reveal: all
-> END

=== burnt ===
~ guarded = true
~ temp due = quarter
{ money() < due:
  ~ due = money()
}
~ pay(due)
The torch bites the tank seam and oil weeps down the post. Tam beats out the flame with his coat.
The clerk climbs the ladder faster than a man his age should, and a pair of his men follow him. # place: The last lamp
He sends a bill for the tank and the seam, and it comes to {due} M. The lien on the post grows by a quarter. # reveal: all
-> foot

=== hold ===
You walk out to where the cart must pass and stand in the track. # page # place: Glass Flats
The clerk's pair comes up with their hands on their belts. Tam watches from the ladder, and Juno does not look up.
{ skill("toughness") >= 3:
  -> held
}
-> shoved

=== held ===
~ lamps_fate = "held"
~ lien_standing = "enemy"
You stay where you are and let them look at you. Neither of them has been paid enough for what it would take to move you.
The clerk looks at the sky and writes in his book, and the cart goes back the way it came.
The Corporation will send armed men next quarter. I say so only as a courtesy. # speaker: Clerk
That night every lamp burns, the last one too, and it burns well. # reveal: all
-> END

=== shoved ===
~ guarded = true
~ temp due = quarter
{ money() < due:
  ~ due = money()
}
~ pay(due)
A rifle butt finds your ribs and a boot finds the rest of you. They take {due} M from your coat for obstructing a lawful cart. # reveal: all
The clerk writes in his book. The lien on the post grows by a quarter, and the cart rolls on.
-> foot

=== lease ===
~ temp need = 3
{ paper_seen:
  ~ need = 2
}
{ skill("social") >= need:
  -> leased
}
-> sour_deal

=== leased ===
~ lamps_fate = "leased"
The carter does not meet your eye. # page # place: Glass Flats
{ paper_seen:
  You say you can read a seal across a tailboard, and that a paper dated before the lamp went dark is a paper the Senate will want explained.
}
You tell him a sale is a quarrel and a lease is a cart that comes every week. He flips the paper over and writes a word in the margin.
The Granary will light the lamps with its own crew and rope, pay Juno rent in oil, and pay the clerk down from that rent. Juno and Tam keep the ladder.
Juno signs, and then she asks what a lease is. Tam tells her it's a sale that lets her keep her stool. # speaker: Tam
At dusk a Bowl crew lights the lamps beside Tam. The old woman stays on her stool and looks out over the field. # reveal: all
-> END

=== sour_deal ===
~ sour = true
The carter listens to the end. Then he rolls the paper and puts it back in his coat. # place: Glass Flats
Odile didn't send me here to be taught my own trade. # speaker: Carter
He tells the yard what you said. By the time you reach the ladder, Tam has gone up it and will not come down.
-> foot

=== kept ===
~ lamps_fate = "kept"
The carter looks at the old woman, then at you. # page # place: Glass Flats
He shrugs and swings the cart round, and the oil stays on the field.
That night every lamp burns, the last one too, thin and yellow. Far off at the Granary the weigh house runs on tallow.
The clerk writes in his book. The lien grows by a quarter.
-> END

=== sold ===
~ lamps_fate = "sold"
~ give_money(offer)
The carter unrolls a paper. The Granary will take the lamps and keep them lit with its own crew and rope. # page # place: Glass Flats
Nobody climbs the ladder with a bad leg after that, and Tam can say that much for it.
Juno signs her mother's name with a hand that shakes. She does not ask what the paper says.
The carter asks for a witness's mark under hers, and you give it. Tam reads it from the ladder and spits.
The carter counts {offer} M into your palm for carrying it. # reveal: all
At dusk a Bowl crew lights the lamps. The old woman stays on her stool and looks at the field.
-> END
