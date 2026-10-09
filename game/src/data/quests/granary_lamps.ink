# view: page
# stat: money Money
# fact: lamps_seen Posts: every lamp is painted with a Pierce lien number. Under the flaking paint on one post an older number shows, in a thinner hand.
# fact: juno_said Juno: she sells oil to the Bowl first and lights the lamps with what is left. The last lamp is resting, she says.
# fact: tam_said Tam: the oil can is lighter every week. The last lamp is dry, and a Pierce tag is wired to its post.
# fact: slip_read Carter's slip: the Granary pays for the oil, and the coin goes to a Pierce clerk. Juno's name is not on it.
INCLUDE world.ink

VAR lamps_seen = false
VAR juno_said = false
VAR tam_said = false
VAR slip_read = false
VAR lien = 120
VAR offer = 100

=== start ===
# checkpoint: start
Podfield is a field of open pods, rusted shells half sunk in the dust. # place: Podfield
A line of posts, welded from hull plate, follows the debris trail across it. A lamp sits on top of each.
An old woman sits on a stool at the foot of the first post with a rag in her lap. A young man with a stiff leg is already on the ladder.
-> foot

=== foot ===
# checkpoint: foot
The Granary cart stands at the foot of the ladder. A man in a Pierce coat writes in a book on its tailboard. # page # place: Podfield
+ {not lamps_seen} [Walk the line of lamps.]
  -> lamps
+ {not juno_said} [Sit with Juno.]
  -> juno
+ {not tam_said} [Go up the ladder with Tam.]
  -> tam
+ {not slip_read} [Ask the carter for his slip.]
  -> slip
+ {slip_read} [Pay the clerk the lien on the dark lamp. # cost: {lien}]
  -> paid
+ {slip_read} [Send the carter away without oil.]
  -> kept
+ {slip_read and tam_said} [Take the Granary's offer for the lamps.]
  -> sold
+ [Let it go.]
  -> END

=== lamps ===
~ lamps_seen = true
~ note("lampsLien")
You walk the line. Each post carries a number in fresh yellow paint, on a plate welded below the lamp. # place: Podfield
Post; Lien paint; Oil tank # head
First; 4417; full # row
Second; 4418; full # row
Third; 4419; half # row
Fourth; 4420; half # row
Fifth; 4421; low # row
Last; 4422; empty # row
On the third post the paint has flaked. Under it an older number shows, in a thinner hand. It is not the yellow one.
-> foot

=== juno ===
~ juno_said = true
Juno Pell does not get up. Her hands are knotted like roots. # place: Podfield
I know every pod on this field by its number. I knew them before Pierce painted over them. # speaker: Juno
The Granary buys our oil. I sell first, so the roof holds. The lamps get what is left. # speaker: Juno
The last one is resting. Every lamp, every pod, and not one goes dark while I am alive. # speaker: Juno
-> foot

=== tam ===
~ tam_said = true
~ note("lampsOil")
The ladder is cold iron. Tam climbs it one rung at a time, his bad leg dragging. # place: The last lamp
A Scrapjaw rider shot me in this leg when they took the fuel truck. I climb because she cannot. # speaker: Tam
The can was heavier last year. Every week it is lighter. # speaker: Tam
The last lamp is dry to the wick. A tag of Pierce paper is wired to its post.
She does not know. If that lamp goes, she goes with it. # speaker: Tam
-> foot

=== slip ===
~ slip_read = true
The carter holds the slip out without being asked twice. # place: Podfield
Item; Paid by; Paid to # head
Lamp oil, per can; The Granary; Pierce office, lien book # row
The clerk does not look up from his book.
The Granary pays by the can. The Corporation takes the coin and writes it against her mother's tag. # speaker: Clerk
The lien grows each quarter faster than the oil pays it down. The dark lamp falls due before the next cart. # speaker: Clerk
Pay what is owed on it and the Corporation leaves it be. # speaker: Clerk
-> foot

=== paid ===
~ lamps_fate = "paid"
The clerk takes <b>{lien} M</b> and dips a brush. # page # place: The last lamp
He paints a plain stroke over the yellow number. The tag of Pierce paper comes off the post.
Tam fills the tank from the can on his back. At dusk he lights the wick, and the last lamp burns with the rest.
Juno watches from her stool. She says nothing. Her lips move, as if she were counting.
-> END

=== kept ===
~ lamps_fate = "kept"
The carter looks at the old woman, then at you. # page # place: Podfield
He shrugs and swings the cart round. The oil stays on the field.
That night every lamp burns, the last one too, thin and yellow. Far off at the Granary the weigh house runs on tallow.
The clerk writes in his book. The lien grows by a quarter.
-> END

=== sold ===
~ lamps_fate = "sold"
~ give_money(offer)
The carter unrolls a paper. The Granary will take the lamps and keep them lit with its own crew and rope. # page # place: Podfield
Nobody climbs the ladder with a bad leg after that. Tam can say that much for it.
Juno signs her mother's name with a hand that shakes. She does not ask what the paper says.
The carter counts <b>{offer} M</b> into your palm for carrying it. # reveal: all
At dusk a Bowl crew lights the lamps. The old woman stays on her stool and looks at the field.
-> END
