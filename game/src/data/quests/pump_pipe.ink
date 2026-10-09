# view: page
# stat: money Money
# fact: book_read Pump book: a pipe to the Archon's terrace draws seep water every week. No meter reads it.
# fact: early_lines Pump book: the first line for the pipe is in Wendell's hand, a year before the Senate struck the meter.
# fact: margin_read Pump book, last margin, in Agnes's hand: if this reaches the Senate floor, say a driver found it.
# fact: valve_read Terrace valve: the wheel is worn bright on one side. An empty flange sits below it, its bolt holes clean.
# fact: offer_heard Household: a steward in a Marr coat offered coin to lose the bundle on the road.
# fact: canal_matches Canal book: the same weekly line for the pipe, in Mirela's hand.
# fact: report_named South Lock: Tomas Duarte wrote a patrol report on the valve. It lies on the Archon's desk.
INCLUDE world.ink

VAR taken = false
VAR book_read = false
VAR offer_heard = false
VAR canal_matches = false
VAR report_named = false
VAR early_lines = false
VAR margin_read = false
VAR valve_read = false
VAR sluice = "open"
VAR price = 100
VAR fee = 60
VAR fine = 40
VAR parts = 30
VAR toll = 50

=== function crossed() ===
~ return sluice == "passed" or sluice == "ran" or sluice == "talked" or sluice == "paid"

=== start ===
# checkpoint: start
{ taken: -> road }
Agnes keeps the Pump Station behind a wall of drums and gauges, and the whole place smells of hot iron and wet rope. # place: Pump Station
She draws a flat bundle from under her pillow. It is oilcloth tied with wire, and a wax seal sits on the knot.
It's the pump book, every line in my own hand. I copied it by lamplight over most of a winter. # speaker: Agnes
South Lock is at the far end of the canals, past Green Pit. A woman named Mirela Duarte keeps the Canal book there. # speaker: Agnes
I want this in her hands and nobody else's. The patrol watches the pump road, so a keeper on the canal road would be a story by supper. A driver's only a driver. # speaker: Agnes
+ [Take the bundle.]
  ~ taken = true
  ~ note("pipeBook")
  Agnes pushes it into your arms and goes back to her gauges without another word, as if the matter were a reading she had already written down.
  -> steward
+ [Not my road.]
  -> END

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road, its off wheel propped on a stone to ease the axle. # page # place: The Bowl road
A man in a Marr coat sits on the tailboard with his hands folded in his lap. His eyes go to the bundle under your arm before they go to your face.
I serve the household of the Archon. News of a sealed bundle travels faster than any truck on this road. # speaker: Steward
The top terraces have held their water by an old charter since the Bowl was founded, and a charter is not a theft, whatever a book may call it. A book that says otherwise is a quarrel the Bowl can't afford in a dry year. # speaker: Steward
I'd be grateful if that one were lost on the road. I don't ask you to burn it, only to lose it. I should add that the patrol at the Green Pit sluice opens every sealed bundle that passes, when I send word. # speaker: Steward
He names a sum: {price} M. # reveal: all
+ [Take the money.]
  -> sold
+ [Say you will lose it, and ask for a pass at the sluice first.]
  -> haggle
+ [Not today.]
  ~ offer_heard = true
  ~ note("pipeOffer")
  The steward shrugs, a small and courteous movement of one shoulder.
  The offer stands until you reach the Bowl. After that it doesn't. # speaker: Steward
  -> road

=== haggle ===
~ offer_heard = true
~ note("pipeOffer")
{ skill("social") >= 3:
  -> played
}
-> seen_through

=== played ===
~ sluice = "passed"
~ give_money(price / 2)
You keep your face still and your voice flat, the way a man sounds when he loses things for a living. # page # place: The Bowl road
The steward writes a line on a slip, signs it with a household mark and counts out half the sum into your hand. # speaker: Steward
That will open the sluice for you, and nobody there will ask what you're carrying. I think we understand each other. # speaker: Steward
He does not look at the bundle again. He is quite sure of you. # reveal: all
-> road

=== seen_through ===
~ sluice = "watched"
The steward listens to the end with his head slightly tilted. He does not smile. # page # place: The Bowl road
A man who asks for a pass wants to cross the sluice carrying something he means to keep. # speaker: Steward
He raises a hand toward the rise, and a rider in a grey coat starts his buggy and goes down the road toward Green Pit.
The offer's closed now, I'm afraid, and my rider will reach the sluice well before you do. # speaker: Steward
-> road

=== road ===
# checkpoint: road
The bundle rides on the seat beside you, and the oilcloth has already taken the shape of your arm. # page # place: The road
+ {not book_read} [Cut the seal and read the book.]
  -> read
+ [Climb to the top terrace.]
  -> terrace
+ [Take the canal road toward South Lock.]
  -> sluice_post
+ [Take it to the Granary gate.]
  -> gate
+ {offer_heard and sluice != "passed"} [Find the steward's cart and take his money.]
  -> sold
+ [Drop it in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ margin_read = true
~ note("pipeDraw")
You cut the wax with a knife and unfold the oilcloth on your knee. Agnes writes small and square, in ink that has gone brown at the edges. # place: The road
Week; Seep reading; Terrace pipe # head
First; lower; no meter # row
Second; lower; no meter # row
Third; lower again; meter struck out # row
Fourth; lowest yet; no meter # row
{ skill("perception") >= 2:
  ~ early_lines = true
  The first line for the pipe is in a different hand, an old man's, cramped and slanted to the right. It is Wendell's, and the ink on it is a year older than the line that strikes the meter.
}
Her margin note says the Senate ordered the meter off. Every week after that she wrote the line again.
The last margin line is meant for the Canal people. If this reaches the Senate floor, say a driver found it, and do not say the Pump Station.
-> road

=== terrace ===
A whitewashed wall runs along the top terrace, and the gate stands open for the hands who come to water the orchard. # page # place: The top terrace
A pipe as thick as a thigh comes up out of the rock and ends in a valve wheel under a canvas hood. Somewhere above you a bucket knocks against a tree.
-> terrace_hub

= terrace_hub
+ {not valve_read} [Read the valve and the housing.]
  -> valve_try
+ [Bolt a spare meter to the valve. # cost: {parts}]
  -> meter
+ [Climb back down.]
  -> road

=== valve_try ===
{ skill("machining") >= 2:
  -> valve
}
-> fumble

=== valve ===
~ valve_read = true
You lift the hood and look at the thing the way a mechanic looks at a stranger's engine.
The wheel is worn bright on one side only, by a hand that opens it each week. The housing is old, but the bolts that hold it are new.
Below the valve an empty flange sits where a meter once bolted on. The bolt holes are clean and oiled.
Nobody stops you, and the water goes up toward the orchard, quiet and steady.
-> terrace.terrace_hub

=== fumble ===
~ sluice = "watched"
You lay a hand on the wheel and find you do not know what you are looking at.
A terrace hand with a hoe asks what you want at the Archon's valve, and you cannot find a good answer.
He walks you to the gate and asks your name and your truck, and he writes both on his palm with a pencil stub.
-> road

=== meter ===
You set the spare meter against the flange and reach for the first bolt. # place: The top terrace
{ skill("machining") >= 3:
  -> fitted
}
-> sheared

=== fitted ===
~ pipe_fate = "metered"
~ marr_regard = "enemy"
You seat each bolt in its hole and draw them down one after another until the face sits square, and the needle climbs and settles.
You angle the dial toward the lower path, where a tenant with a glass can read it from the pump track.
The housing belongs to the household, but the meter does not, and it cannot come off now without cutting the pipe.
By morning Agnes will have a number she did not write herself, and by noon a steward will be asking who stood on the terrace. # reveal: all
-> END

=== sheared ===
~ sluice = "watched"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
The flange does not take the fitting. It shears with a crack, and seep water sprays across the terrace stones in a bright fan.
Hands come running down the rows with their buckets still swinging. You leave the spare in the wet and drive off with a hand on the horn.
The household sends a bill for the stones and the wall, and it comes to {due} M. # reveal: all
-> road

=== sluice_post ===
{ crossed():
  -> through
}
A pair of Bowl patrolmen hold the sluice at Green Pit, with a cart drawn across the cut and a kettle steaming on the sill. # page # place: The Green Pit sluice
{ sluice == "watched":
  A rider in a grey coat leans on his buggy behind them. He has plainly been here since morning.
}
They look at the bundle under your arm, and they do not look at your face.
+ [Run the dry cut round the sluice.]
  -> cut
+ [Talk the patrolmen through.]
  -> talk
+ [Pay the patrolmen to look at the water. # cost: {toll}]
  -> bought

=== through ===
{ sluice == "passed":
  The patrolmen read the household's slip, and one of them lifts the cart out of your way. # place: The Green Pit sluice
  They look at the slip and then at the sky, and neither of them looks at the bundle.
- else:
  The patrolmen remember your truck, and the cart is already out of the way. # place: The Green Pit sluice
}
{ found("south-lock"):
  -> lock
}
Past the sluice the canal splits into dry cuts, and none of them is marked, so you cannot tell which one leads to a lock.
Someone at Green Pit may know where South Lock lies.
-> road

=== cut ===
~ temp need = 2
{ sluice == "watched":
  ~ need = 3
}
{ skill("driving") >= need:
  -> ran
}
-> rammed

=== ran ===
~ sluice = "ran"
The dry cut is a ditch the canal families dug and then forgot. You take it at speed with one hand holding the bundle down on the seat.
Dust rises behind you in a long yellow flag. A shout follows it, and then a shot into the air, but nobody follows the truck down the cut.
-> through

=== rammed ===
~ sluice = "ditched"
The cut is deeper than it looked from the road. The truck comes down on a buried slab and stays there with its nose in the dirt and one wheel spinning.
The patrolmen walk up unhurried, still holding their kettle mugs, and one of them reaches in and lifts the bundle off the seat.
-> seized

=== talk ===
~ temp need = 2
{ sluice == "watched":
  ~ need = 3
}
{ skill("social") >= need:
  -> talked
}
-> read_through

=== talked ===
~ sluice = "talked"
You say the bundle is a pump keeper's monthly returns for the Canal book, dull paper and already late. You say it a second time, bored, as if it were the hundredth.
The older patrolman has carried returns himself, and the memory shows on his face. He waves the cart aside.
-> through

=== read_through ===
The older patrolman asks what a pump keeper's returns are doing in a stranger's hands, and you have no answer that holds.
He flips the bundle over and finds the wax, and he breaks it with his thumb.
-> seized

=== bought ===
~ sluice = "paid"
~ marr_regard = "enemy"
The older patrolman takes the coin without counting it and studies the water in the cut as if it were something he had never seen.
The cart rolls aside. The rider behind him, if there is one, will see nothing today and write down all of it.
-> through

=== seized ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
They read the first page standing in the road, with the wind lifting the corner of it. Then they close the book and put it in a saddlebag. # page # place: The Green Pit sluice
The pump book goes to the Archon's desk. Nobody will ask the pump keeper for her first book, and nobody needs to.
They fine you {due} M for carrying a bundle without a patrol leave. # reveal: all
Your name is in their report before you reach your truck.
-> END

=== lock ===
South Lock is a lock house on a dry cut, with a sluice gate and a long beam to lift it, and the stone smells of cold mud. # page # place: South Lock
A woman stands on the beam with her sleeves rolled to the elbow. She reads the bundle's seal before she reads you.
Agnes sent you. She doesn't trust the road, and she's right not to. # speaker: Mirela
{ book_read:
  The seal is cut. Good, then you know what you carry. # speaker: Mirela
}
She lays the copy beside a long book chained to the sill. The weekly lines run side by side, hers and Agnes's, line for line.
{ early_lines:
  She finds the old man's hand at the top of the column and taps it. That's a year before the order. Either the order was a cover, or Wendell wrote early and never told a soul why. I don't know which. # speaker: Mirela
}
{ valve_read:
  You tell her about the bright wheel and the empty flange, and she stops listening to anything else for a moment.
}
A young man in a Bowl coat whitewashes the sluice stones a little way off. He does not look up.
That's my cousin Tomas. He serves the patrol at my own lock because he scraped the chalk off a meter. # speaker: Mirela
He wrote a report on that valve. It's lying on the Archon's desk and nobody reads it. # speaker: Mirela
The water came out of our seep, and we'll count every drop of it. But a book with nobody's name on it is only a rumor. Put yours beside Agnes's line and say a driver found it on the road. # speaker: Mirela
+ [Sign the Canal book as the driver who found it.]
  -> signed
+ [Leave your name off.]
  -> filed

=== signed ===
~ pipe_fate = "delivered"
~ canal_matches = true
~ report_named = true
~ marr_regard = "enemy"
~ note("pipeCanal")
~ give_money(fee)
You sign. Mirela blots the page with her sleeve and counts {fee} M out of the lock box. # page # place: South Lock
The Canal families pay for their own proof, and we remember who stood beside it. Any truck that carries your name will find water at this lock. # speaker: Mirela
As you go, a cart with a Marr lantern stops at the lock gate. The man on it asks for Tomas Duarte by name. # reveal: all
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ report_named = true
~ note("pipeCanal")
~ give_money(fee)
Mirela stares at you, and then she shrugs. She chains the copy beside her own book. # page # place: South Lock
Then it's a Canal word against the household's, and they'll call it a forgery by a pump keeper with a grudge. # speaker: Mirela
She counts {fee} M out of the lock box and does not say your name aloud again. # reveal: all
Nobody comes to the lock that day, and nothing moves on the dry cut but the wind.
-> END

=== gate ===
~ pipe_fate = "read"
~ marr_regard = "enemy"
The weigh house stands over the Granary gate, and tenants queue below it with their sacks on their shoulders. # page # place: The Granary gate
Counts hang on boards by the post, chalked in a steward's hand.
{ not book_read:
  You cut the wax and open the book on the weighing block.
}
You read Agnes's lines aloud: the week, the reading, and the pipe with no meter.
The queue goes quiet. A woman in the weigh house door watches without moving, a tally stick in her hand.
By the last line the tenants are repeating it to the ones at the back.
A pair of patrolmen in Bowl coats shoulder through the crowd.
{ skill("social") >= 2:
  -> held
}
-> fined

=== held ===
You keep your voice even and give the tenants nothing to be afraid of.
The tenants close round the patrolmen without being asked. A man at the front chalks the lines on the board as you read them.
The patrolmen look at the crowd, and at each other, and then they go back the way they came.
The tenants do not let go of the lines, and by dusk the pipe is a word at every sack. # reveal: all
-> END

=== fined ===
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
One of them takes the book out of your hands.
Posting on the gate needs a steward's leave, and you haven't got one. # speaker: Patrolman
He takes {due} M for the disorder and carries the book away toward the terraces. # reveal: all
The tenants do not let go of the lines, and by dusk the pipe is a word at every sack.
-> END

=== sold ===
~ pipe_fate = "sold"
~ marr_regard = "bought"
~ give_money(price)
The steward does not open the bundle. He flips it over once and hands you a purse. # page # place: The Bowl road
{ book_read: He looks at the cut seal and pays the same. }
He asks your name and writes it on a slip. Friends of the household drink first, he says, and he folds the slip into his coat.
The cart rolls toward the terraces with the bundle on his knee. # reveal: all
You count {price} M. Behind you, a lamp comes on at the top terrace.
-> END

=== dropped ===
~ taken = false
Water stands in the ditch, green and still, with a skin of dust on it. # page # place: The road
The oilcloth floats a moment, then the wire drags it under. The wax seal is the last thing to go.
Nobody saw, and the pipe goes on running.
-> END
