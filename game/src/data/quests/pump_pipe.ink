# view: page
# stat: money Money
# fact: book_read Pump book: a pipe to the Archon's terrace draws seep water every week. No meter reads it.
# fact: offer_heard Household: a steward in a Marr coat offered coin to lose the bundle on the road.
# fact: canal_matches Canal book: the same weekly line for the pipe, in Mirela's hand.
# fact: report_named South Lock: Tomas Duarte wrote a patrol report on the valve. It lies on the Archon's desk.
INCLUDE world.ink

VAR taken = false
VAR book_read = false
VAR offer_heard = false
VAR canal_matches = false
VAR report_named = false
VAR price = 150
VAR fee = 80
VAR fine = 40

=== start ===
# checkpoint: start
{ taken: -> road }
Agnes keeps the Pump Station behind a wall of drums and gauges. # place: Pump Station
She takes a flat bundle from under her pillow. Oilcloth, tied with wire, a wax seal on the knot.
It is the pump book, every line in my hand. # speaker: Agnes
South Lock lies at the far end of the canals, past Green Pit. Mirela Duarte keeps the Canal book there. # speaker: Agnes
Put it in her hands. No one else's. # speaker: Agnes
+ [Take the bundle.]
  ~ taken = true
  ~ note("pipeBook")
  Agnes pushes it at you and goes back to her gauges without another word.
  -> steward
+ [Not my road.]
  -> END

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road. # page # place: The Bowl road
A man in a Marr coat sits on the tailboard with his hands folded. His eyes go to the bundle under your arm.
I serve the household of the Archon. News of a sealed bundle travels faster than a truck. # speaker: Steward
He would pay to see it lost on the road. Not burned. Lost. Nobody asks where. # speaker: Steward
He names a sum: <b>{price} M</b>. # reveal: all
+ [Take the money.]
  -> sold
+ [Not today.]
  ~ offer_heard = true
  ~ note("pipeOffer")
  The steward shrugs. # speaker: Steward
  The offer stands until you reach Bowl. After that it does not. # speaker: Steward
  -> road

=== road ===
# checkpoint: road
The bundle rides on the seat beside you. # page # place: The road
+ {not book_read} [Cut the seal and read the book.]
  -> read
+ {found("south-lock")} [Carry it to South Lock.]
  -> lock
+ [Take it to the Granary gate.]
  -> gate
+ {offer_heard} [Find the steward's cart and take his money.]
  -> sold
+ [Drop it in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ note("pipeDraw")
You cut the wax with a knife. Agnes writes small and square. # place: The road
Week; Seep reading; Terrace pipe # head
First; lower; no meter # row
Second; lower; no meter # row
Third; lower again; meter struck out # row
Fourth; lowest yet; no meter # row
Her margin note says the Senate ordered the meter off. Every week after it she wrote the line again.
-> road

=== lock ===
~ pipe_fate = "delivered"
~ canal_matches = true
~ report_named = true
~ note("pipeCanal")
~ give_money(fee)
South Lock is a lock house on a dry cut, with a sluice and a beam to lift it. # page # place: South Lock
A woman stands on the beam with her sleeves rolled. She reads the bundle's seal before she reads you.
Agnes sent you. She does not trust the road, and she is right. # speaker: Mirela
{ book_read:
  The seal is cut. Good. Then you know what you carry. # speaker: Mirela
}
She lays the copy beside a long book chained to the sill. The weekly lines run side by side, hers and Agnes's, line for line.
A young man in a Bowl coat whitewashes the sluice stones a little way off. He does not look up.
My cousin Tomas. He serves the patrol at my own lock for scraping the chalk off a meter. # speaker: Mirela
He wrote a report on that valve. It lies on the Archon's desk, and nobody reads it. # speaker: Mirela
The water came from our seep, and we will count every drop of it. # speaker: Mirela
She counts <b>{fee} M</b> out of the lock box. The Canal families pay for their own proof. # reveal: all
-> END

=== gate ===
~ pipe_fate = "read"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
The weigh house stands over the Granary gate. Tenants queue below it with their sacks. # page # place: The Granary gate
Counts hang on boards by the post, chalked in a steward's hand.
{ not book_read:
  You cut the wax and open the book on the weighing block.
}
You read Agnes's lines aloud. Week, reading, and the pipe with no meter.
The queue goes quiet. A woman in the weigh house door watches without moving. She holds a tally stick.
By the last line the tenants are repeating it to the ones at the back.
A pair of patrolmen in Bowl coats push through. One takes the book out of your hands.
Posting on the gate needs a steward's leave. # speaker: Patrolman
He takes <b>{due} M</b> for the disorder and lets you go. # reveal: all
The tenants do not let go of the lines. By dusk the pipe is a word at every sack.
-> END

=== sold ===
~ pipe_fate = "sold"
~ give_money(price)
The steward does not open the bundle. He flips it over once and hands you a purse. # page # place: The Bowl road
{ book_read: He looks at the cut seal and pays the same. }
The cart rolls toward the terraces with the bundle on his knee. # reveal: all
You count <b>{price} M</b>. Behind you, a lamp comes on at the top terrace.
-> END

=== dropped ===
~ taken = false
Water stands in the ditch, green and still. # page # place: The road
The oilcloth floats a moment, then the wire pulls it under. The wax seal is the last thing to go.
Nobody saw. The pipe keeps running.
-> END
