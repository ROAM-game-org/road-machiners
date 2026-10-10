# view: page
# stat: money Money
# fact: book_read Pump book: a pipe to the Archon's terrace draws seep water every week. No meter reads it.
# fact: early_lines Pump book: the first line for the pipe is in Wendell's hand, a year before the Senate struck the meter.
# fact: margin_read Pump book, last margin, in Agnes's hand: if this reaches the Senate floor, say a driver found it, and do not name her.
# fact: offer_heard Household: the steward Aurel Brede offered coin to lose the bundle on the road.
# fact: reserve_known Steward: half of what the pipe draws fills a cistern under the terrace, the Senate's dry-year store. Only the Archon may open it.
# fact: valve_read Terrace valve: the wheel is worn bright on one side. An empty flange sits below it, its bolt holes clean.
# fact: canal_matches Canal book: the same weekly line for the pipe, in Mirela's hand.
# fact: report_named Bowl lock house: Tomas Duarte told the drivers about the bright wheel, took household oil to keep quiet, and said it again.
INCLUDE world.ink

VAR taken = false
VAR book_read = false
VAR offer_heard = false
VAR offer_open = false
VAR asked_water = false
VAR reserve_known = false
VAR canal_matches = false
VAR report_named = false
VAR early_lines = false
VAR margin_read = false
VAR valve_read = false
VAR walked_out = false
VAR sluice = "open"
VAR price = 100
VAR fee = 60
VAR fine = 40
VAR parts = 30
VAR toll = 50

=== function crossed() ===
~ return sluice == "passed" or sluice == "ran" or sluice == "talked" or sluice == "paid"

=== function gate_need() ===
{ sluice == "watched":
  ~ return 3
}
~ return 2

=== start ===
# checkpoint: start
{ taken: -> road }
Agnes goes to her cot and draws a flat bundle from under the pillow. It is oilcloth tied with wire, and a wax seal sits on the knot. # place: Pump Station
My uncle Wendell's first page, and every line after it in my own hand. I copied it by lamplight over most of a winter. # speaker: Agnes
+ [Stow it under the seat of your truck.]
  ~ taken = true
  ~ note("pipeBook")
  Agnes watches it go. Then she goes back to her gauges, as if the matter were a reading she had already written down.
  -> steward
+ [Ask what to say if you're stopped.]
  ~ taken = true
  ~ note("pipeBook")
  Pump returns for the Canal book. Dull paper, and already late. Say it like you're bored of it. # speaker: Agnes
  She pushes the bundle into your arms and goes back to her gauges without another word.
  -> steward

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road, one wheel propped on a stone to ease the axle. # page # place: The Bowl road
A grey-haired man in a grey coat sits on the tailboard with his hands folded in his lap. A lantern is stitched on his collar, and a purse sits on the board beside him.
Aurel Brede, steward to the household of the Archon. My watchman sends me a slip whenever a truck stops long at the pump. # speaker: Steward
You came for water, and water is what you should carry out. The paper under your seat is a quarrel the Bowl can't afford in a dry year. # speaker: Steward
I don't ask you to burn it, only to lose it on the road. I should add that the patrol at the Bowl gate opens every sealed bundle that passes, when I send word. # speaker: Steward
He names a sum: {price} M. # reveal: all
-> offer

= offer
+ {not asked_water} [Ask him what the top terrace wants with that much water. # check: social 2]
  ~ asked_water = true
  { passed():
    He looks at you for a while, and then decides you're worth the truth, or a piece of it.
    Half of what that pipe draws never reaches an orchard. It sits in a cistern under the terrace. It's the Senate's store for the dry year, voted in closed session, and only the Archon may open it. # speaker: Steward
    Read that book on the Senate floor in a dry autumn, and every tenant in the Bowl will want the store opened tonight. Then there's no store, and no Senate either. # speaker: Steward
    ~ reserve_known = true
  - else:
    It waters an orchard, as orchards need. # speaker: Steward
    He says it kindly and watches your hands. Then he writes something on a slip and doesn't show it to you.
  }
  -> offer
+ [Take the money.]
  -> sold
+ [Say you will lose it, and ask for a pass at the gate first. # check: social 3]
  -> haggle
+ [I'm not losing anything.]
  ~ offer_heard = true
  ~ offer_open = true
  ~ note("pipeOffer")
  The steward shrugs, a small and courteous movement of one shoulder.
  The offer stands until you reach the Bowl. After that it doesn't. # speaker: Steward
  -> road

=== haggle ===
~ offer_heard = true
~ note("pipeOffer")
{ passed():
  -> played
}
-> seen_through

=== played ===
~ sluice = "passed"
~ give_money(price / 2)
You keep your face still and your voice flat, the way a man sounds when he loses things for a living. # page # place: The Bowl road
The steward writes a line on a slip, signs it with a household mark and counts out half the sum into your hand. # speaker: Steward
That will open the gate for you, and nobody there will ask what you're carrying. I think we understand each other. # speaker: Steward
He does not look at the bundle again. He is quite sure of you. # reveal: all
-> road

=== seen_through ===
~ sluice = "watched"
The steward listens to the end with his head slightly tilted. He does not smile. # page # place: The Bowl road
A man who asks for a pass wants to cross the gate carrying something he means to keep. # speaker: Steward
He raises a hand toward the rise, and a rider in a grey coat starts his buggy and goes down the road toward the Bowl gate.
The offer's closed now, I'm afraid, and my rider will reach the gate well before you do. # speaker: Steward
-> road

=== road ===
# checkpoint: road
{ book_read: The book rides under your seat, its cut wax rattling in the oilcloth. | The bundle rides under your seat, its seal still whole. } # page # place: The road
+ {not book_read} [Cut the seal and read the book.]
  -> read
+ {not walked_out} [Climb to the top terrace and see the pipe for yourself.]
  -> terrace
+ [Drive on to the Bowl gate.]
  -> sluice_post
+ {book_read} [Read it aloud to the tenants who queue with their grain at the Granary gate. # check: social 2]
  -> gate
+ {offer_open} [Find the steward's cart and take his money.]
  -> sold
+ [Drop it in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ margin_read = true
~ note("pipeDraw")
You cut the wax with a knife and unfold the oilcloth on your knee. Agnes writes small and square, in ink that has gone brown at the edges. # place: The road
When; Seep lifted in a week; Terrace pipe in a week # head
Last spring; 410 barrels; 22 barrels # row
Midsummer; 380 barrels; 31 barrels # row
Autumn; 350 barrels; meter struck out by Senate order # row
Winter; 320 barrels; no meter # row
This week; 300 barrels; no meter # row
{ skill("perception") >= 2:
  ~ early_lines = true
  The first line for the pipe is in a different hand, an old man's, cramped and slanted to the right. It is her uncle Wendell's, who kept the book before her, and the ink on it is a year older than the line that strikes the meter.
}
Every week after the order she still wrote the pipe's line, with no number in it.
The last margin line is meant for the Canal people. If this reaches the Senate floor, say a driver found it, and do not name me.
-> road

=== terrace ===
A whitewashed wall runs along the top terrace, and the gate stands open for the hands who come to water the orchard. # page # place: The top terrace
A pipe as thick as a thigh comes up out of the rock and ends in a valve wheel under a canvas hood. Somewhere above you a bucket knocks against a tree.
-> terrace_hub

= terrace_hub
+ {not valve_read} [Look the valve over like a mechanic would. # check: machining 2]
  -> valve_try
+ [Fit a meter from your spares to the pipe. # cost: {parts} # check: machining 3]
  -> meter
+ [Climb back down.]
  -> road

=== valve_try ===
{ passed():
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
~ walked_out = true
You lift the hood. Under it are a wheel, a housing and a ring of bolts, and none of it tells you anything you could carry to the Bowl.
A terrace hand with a hoe comes down the row and asks what you want at the Archon's valve.
You have no good answer, and he can see it. He looks at your boots, and then at your truck down on the road.
He walks you to the gate and asks your name and your truck, and he writes both on his palm with a stub of charcoal.
-> road

=== meter ===
You set the spare meter against the flange and reach for the first bolt. # place: The top terrace
{ passed():
  -> fitted
}
-> sheared

=== fitted ===
~ pipe_fate = "metered"
~ marr_regard = "enemy"
You seat each bolt in its hole and draw them down one after another until the face sits square, and the needle climbs and settles.
You angle the dial toward the lower path, where a tenant with a glass can read it from the pump track.
At first light a household crew comes up the terrace with wrenches. Mirela Duarte and her cousin are already at the wall, with half the bottom terrace behind them, and the first number on the dial is in the Canal book.
The crew looks at the crowd, and then at each other. They log the work as a line repair and leave the meter where it is. # reveal: all
-> END

=== sheared ===
~ sluice = "watched"
~ walked_out = true
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
A pair of Bowl patrolmen hold the Bowl gate, with a cart drawn across the road and a kettle steaming on the wall. Off to the left, a dry irrigation cut runs round the wall. # page # place: The Bowl gate
{ sluice == "watched":
  A rider in a grey coat leans on his buggy behind them. Dust lies thick on its wheels.
}
The older one reads your plate off a slip of patrol paper before you've stopped. Then he leans into your cab.
Paper off the pump road needs a patrol pass. Got one? # speaker: Patrolman
+ [Run the dry cut round the wall. # check: driving {gate_need()}]
  -> cut
+ [Tell them it's pump returns for the Canal book. # check: social {gate_need()}]
  -> talk
+ [Slip the older one some coin to look the other way. # cost: {toll}]
  -> bought

=== through ===
{ sluice == "passed":
  The patrolmen read the household's slip, and one of them lifts the cart out of your way. # place: The Bowl gate
  They look at the slip and then at the sky, and neither of them looks at the bundle.
}
-> lock

=== cut ===
{ passed():
  -> ran
}
-> rammed

=== ran ===
~ sluice = "ran"
The dry cut is a ditch the canal families dug and then forgot. You take it at speed, and the bundle slides about under your seat.
Dust rises behind you in a long yellow flag. A shout follows it, and then a shot into the air, but nobody follows the truck down the cut.
-> through

=== rammed ===
~ sluice = "ditched"
The cut is deeper than it looked from the road. The truck comes down on a buried slab and stays there with its nose in the dirt and one wheel spinning.
The patrolmen walk up unhurried, still holding their kettle mugs, and one of them reaches in and pulls the bundle from under the seat.
-> seized

=== talk ===
{ passed():
  -> talked
}
-> read_through

=== talked ===
~ sluice = "talked"
You say the bundle is a pump keeper's returns for the Canal book, dull paper and already late. You say it a second time, bored, as if it were the hundredth.
The older patrolman has carried returns himself, and the memory shows on his face. He waves the cart aside.
-> through

=== read_through ===
You say the bundle is a pump keeper's returns for the Canal book, dull paper and already late.
Late, is it? Late returns ride in the pump cart like the rest. Nobody pays a truck to carry dull paper. # speaker: Patrolman
{ book_read: He sees the cut wax and folds the oilcloth open. | He finds the wax and breaks it with his thumb. }
-> seized

=== bought ===
The older patrolman takes the coin without counting it and studies the dry cut as if he had never seen it before.
The cart rolls aside.
{ sluice == "watched": The rider behind them sees all of it, and he takes out a pencil. }
~ sluice = "paid"
~ marr_regard = "enemy"
-> through

=== seized ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
They read the first page standing in the road, with the wind lifting the corner of it. # page # place: The Bowl gate
A young patrolman in a fresh coat says it's a Canal matter, and it ought to go to the Archon's desk unread. The older one tells him to fetch the saddlebag.
The pump book goes to the Archon's desk. Agnes still keeps the first book at the Pump Station, and now the household knows what is in it.
They fine you {due} M for carrying a bundle without a patrol pass. # reveal: all
Your name is in their report before you reach your truck.
-> END

=== lock ===
The canal families' lock house stands on the lowest canal in the Bowl, with a sluice gate and a long beam to lift it, and the stone smells of cold mud. # page # place: Bowl lock house
The lock hands lean on the beam with nothing to do, and they don't meet your eye. A young man in a Bowl patrol coat whitewashes the sluice stones a little way off.
A woman stands on the beam with her sleeves rolled to the elbow. She reads the bundle's seal before she reads you.
Agnes sent you. She doesn't trust the road, and she's right not to. # speaker: Mirela
{ book_read:
  The seal is cut. Good, then you know what you carry. # speaker: Mirela
}
She lays the copy beside a long book chained to the sill. The weekly lines run side by side, hers and Agnes's, line for line.
{ early_lines:
  She finds the old man's hand at the top of the column and taps it. That's a year before the order. Either the order was a cover, or Wendell kept that pipe out of the book on purpose. # speaker: Mirela
}
{ valve_read:
  You tell her about the bright wheel and the empty flange, and she stops listening to anything else for a moment.
}
{ reserve_known:
  You tell her what the steward said about the store under the terrace. She stops tapping the chained book.
  Then the tenants will want it opened tonight, and the Senate splits down the middle. Good. # speaker: Mirela
  She says the last word a little too quickly.
}
She nods at the lock hands. Household wages, through the dry season. They took them, and I didn't. # speaker: Mirela
That's my cousin Tomas at the stones. He told the drivers about the wheel and wrote it in a patrol report. The steward bought him quiet with oil for his mother, and he said it again at my steps the same week. # speaker: Mirela
A pump keeper's book is a grudge, and the household will call it one. A driver's name means somebody with no water on this canal saw it. Put yours beside Agnes's line and say you found it on the road. # speaker: Mirela
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
You sign. Mirela writes the day beside your name, blots the page with her sleeve and counts {fee} M out of the lock box. # page # place: Bowl lock house
The Canal families pay for their own proof, and we remember who stood beside it. Any truck that carries your name will find water at this lock. # speaker: Mirela
As you go, a household clerk comes down the lock steps with a letter for her. She reads it, laughs once, and pins it under the chained book. # reveal: all
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ report_named = true
~ note("pipeCanal")
~ give_money(fee)
Mirela stares at you, and then she shrugs. She copies the pipe's top line into her own book and writes the day beside it. # page # place: Bowl lock house
Then it's a Canal word against the household's, and they'll call it a forgery by a pump keeper with a grudge. # speaker: Mirela
She counts {fee} M out of the lock box and does not say your name aloud again. # reveal: all
Nobody comes to the lock that day, and nothing moves on the canal but the wind.
-> END

=== gate ===
~ pipe_fate = "read"
~ marr_regard = "enemy"
The weigh house stands over the Granary gate, and tenants queue below it with their sacks on their shoulders. # page # place: The Granary gate
A grey-haired tenant at the front counts the sacks aloud as they go in. When you start to read, he stops and counts your lines with you instead.
You read Agnes's lines aloud: the week, the reading, and the pipe with no meter.
The queue goes quiet. A woman in the weigh house door watches without moving, a tally stick in her hand.
By the last line the tenants are repeating it to the ones at the back.
A pair of patrolmen in Bowl coats shoulder through the crowd.
{ passed():
  -> held
}
-> fined

=== held ===
You keep your voice even and give the tenants nothing to be afraid of.
The tenants close round the patrolmen without being asked. The grey-haired man chalks the lines on the board as you read them.
The patrolmen look at the crowd, and at each other, and then they go back the way they came.
Before dusk a household cart comes down to the Granary with a sack of grain for every family that goes home quietly. About half the queue goes home. # reveal: all
The other half can tell you about the pipe with no meter.
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
The book is gone, but by dusk every tenant in the queue can tell you about the pipe with no meter.
-> END

=== sold ===
~ pipe_fate = "sold"
~ marr_regard = "bought"
~ give_money(price)
The steward does not open the bundle. He flips it over once and hands you the purse. # page # place: The Bowl road
{ book_read: He looks at the cut seal and pays the same. }
He asks your name and writes it on a slip. Friends of the household drink first, he says, and he folds the slip into his coat.
Don't speak of this in the Bowl. The gate has your plate. # speaker: Steward
The cart rolls toward the terraces with the bundle on his knee. # reveal: all
You count {price} M. Behind you, a lamp comes on at the top terrace.
-> END

=== dropped ===
~ taken = false
Water stands in the ditch, green and still, with a skin of dust on it. # page # place: The road
The oilcloth floats a moment, then the wire drags it under. The wax seal is the last thing to go.
Nobody saw, and the pipe goes on running.
-> END
