# view: page
# stat: money Money
# fact: book_read Pump book copy: while the top pipe had a meter it read the gap to the barrel. Agnes sums the gap since, and run forward it dries the metered pipes by next autumn.
# fact: margin_read Pump book copy, last page, in Agnes's hand: for Mirela, to set beside hers.
# fact: offer_heard Household: the steward Aurel Brede offered coin to lose the bundle on the road.
# fact: reserve_known Steward: half of what the pipe draws fills a cistern under the terrace, the Senate's dry-year store. Only the Archon may open it.
# fact: valve_read Terrace valve: the wheel is worn bright on one side. Agnes's old meter fits the empty flange below it.
# fact: canal_matches Canal book: Mirela's count at the lock agrees with Agnes's canal meter, season by season.
INCLUDE world.ink

VAR taken = false
VAR knows_envelope = false
VAR asked_cover = false
VAR book_read = false
VAR offer_heard = false
VAR offer_open = false
VAR asked_water = false
VAR asked_steward = false
VAR asked_drain = false
VAR asked_secret = false
VAR asked_aim = false
VAR reserve_known = false
VAR canal_matches = false
VAR margin_read = false
VAR valve_read = false
VAR walked_out = false
VAR sluice = "open"
VAR price = 100
VAR fee = 60
VAR fine = 40
VAR toll = 50

=== function crossed() ===
~ return sluice == "passed" or sluice == "ran" or sluice == "talked" or sluice == "paid"

=== function left_offer() ===
~ asked_water = false
~ asked_drain = false
~ asked_secret = false

=== function gate_need(base) ===
{ sluice == "watched":
  ~ return base + 1
}
~ return base

=== start ===
# checkpoint: start
{ taken: -> road }
Agnes goes to her cot and draws a flat bundle from under the pillow. It is oilcloth tied with wire, with a wax seal on the knot. # place: Pump Station
From her desk drawer she takes an old meter with its bolts in a twist of wire. In the drawer behind it lies an envelope sealed with a little wax lantern, and she shuts the drawer on it.
That's the meter I took off the top pipe. If you're ever up that way, it still fits. # speaker: Agnes
-> handover

= handover
+ {not knows_envelope} [Ask about the envelope with the lantern seal.]
  ~ knows_envelope = true
  The steward's. A barrel of oil a month, to keep my sums out of the margin of my book. # speaker: Agnes
  I took it, because I was afraid to say no to his face. My own book has no sums in it. The copy has every one. # speaker: Agnes
  -> handover
+ {knows_envelope and not asked_steward} [Ask whether the steward knows about the copy.]
  ~ asked_steward = true
  If he did, my pillow would be slit open by now. # speaker: Agnes
  -> handover
+ {not asked_cover} [Ask what to say if you're stopped.]
  ~ asked_cover = true
  Pump returns for the Canal book. Dull paper, and already late. Say it like you're bored of it. # speaker: Agnes
  -> handover
+ [Take the bundle and the meter out to your truck.]
  ~ taken = true
  ~ knows_envelope = false
  ~ asked_cover = false
  ~ asked_steward = false
  Agnes watches you go. Then she goes back to her dials. She doesn't wave. People who wave get remembered.
  -> steward

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road. # page # place: The Bowl road
A grey-haired man in a grey coat sits on its tailboard with his hands folded. A lantern is stitched on his collar, and a purse sits on the board beside him. A man that tidy has never carried anything heavy himself.
Aurel Brede, steward to the Archon's household. My watchman saw the keeper give you a bundle. # speaker: Steward
I don't ask you to burn it, only to lose it on the road. The patrol at the Bowl gate opens sealed bundles when I send word, and I'd rather not send it. # speaker: Steward
He names a sum: {price} M. # reveal: all
-> offer

= offer
+ {not asked_water} [Ask what the top terrace wants with that much water.]
  ~ asked_water = true
  ~ reserve_known = true
  Half of it waters the orchard. The other half fills a cistern under the terrace. # speaker: Steward
  It's the Senate's store for a dry year, voted in closed session, and only the Archon may open it. # speaker: Steward
  Read that book aloud at the Granary gate in a dry autumn, and every tenant in the queue will want the store opened tonight. The Senate will vote to open it to keep its seats, and then there's no store. # speaker: Steward
  -> offer
+ {asked_water and not asked_drain} [Say the store fills from the Bowl's own water.]
  ~ asked_drain = true
  It does. A dry year comes either way. When it comes, the Archon opens the cistern and the Bowl drinks. # speaker: Steward
  Empty it now, and the Bowl drinks well this winter and dies the next. # speaker: Steward
  -> offer
+ {asked_water and not asked_secret} [Ask why the store is a secret.]
  ~ asked_secret = true
  A store everyone knows about is a store everyone is owed. # speaker: Steward
  -> offer
+ [Take the money.]
  ~ left_offer()
  -> sold
+ [Say you'll lose it, and ask for a gate pass first. # check: social 2]
  ~ left_offer()
  -> haggle
+ [Keep the bundle.]
  ~ left_offer()
  ~ offer_heard = true
  ~ offer_open = true
  ~ note("pipeOffer")
  The steward shrugs, a small and courteous movement of one shoulder.
  The offer stands until you reach the Bowl. # speaker: Steward
  -> onto_road

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
You keep your face still and your voice flat, like a driver who loses things for a living. # page # place: The Bowl road
The steward writes a line on a slip, signs it with a household mark and counts half the sum into your hand.
That will open the gate for you, and nobody there will ask what you're carrying. I think we understand each other. # speaker: Steward
He does not look at the bundle again. He is quite sure of you. # reveal: all
-> onto_road

=== seen_through ===
~ sluice = "watched"
The steward listens to the end with his head slightly tilted. He does not smile. # page # place: The Bowl road
A driver who means to lose a thing doesn't need to carry it through the gate. # speaker: Steward
He raises a hand toward the rise, and a rider in a grey coat starts his buggy down the road toward the Bowl gate.
The offer's closed now, I'm afraid. My rider will be at the gate well before you. # speaker: Steward
-> onto_road

=== onto_road ===
The pump track runs down onto the Bowl road. Ahead is the Bowl gate, and every way into the Bowl goes past somebody. Off to the left, tenants queue with their sacks at the Granary gate, and a side track climbs to the top terrace. # page # place: The road
-> road

=== road ===
# checkpoint: road
{ book_read: The bundle rides on the seat beside you, its seal cut. | The bundle rides on the seat beside you, its seal still whole. } # place: The road
+ {not book_read} [Cut the seal and read the copy.]
  -> read
+ {not walked_out} [Take the side track up to the top terrace.]
  -> terrace
+ [Drive on to the Bowl gate.]
  -> sluice_post
+ {book_read} [Read it aloud to the tenants at the Granary gate. # check: social 2]
  -> gate
+ {offer_open} [Go back to the steward's cart and sell him the bundle.]
  -> sold
+ [Drop it in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ margin_read = true
~ note("pipeDraw")
You cut the wax and unfold the oilcloth on your knee. It is the book you saw at the pump, line for line, in Agnes's small square hand. Her own book stops at the readings. The copy goes on into the margin. # place: The road
Barrels a week; Pumped up from the floor; Out through every other pipe's meter; Up the top pipe, by her sum # head
Last spring; 410; 390; 20 # row
Midsummer; 380; 350; 30 # row
Autumn; 350; 300; 50 # row
This week; 300; 230; 70 # row
On the last page she has run the sum forward in pencil. If what the pump brings up keeps falling, and the top pipe keeps taking more of it, every other pipe runs dry by next autumn.
Next autumn is close enough to plan around, and too close to wait for.
Under it, one line in ink: For Mirela, to set beside hers.
-> road

=== terrace ===
A whitewashed wall runs along the top terrace, and its gate stands open for the hands who water the orchard. # page # place: The top terrace
The pipe comes up out of the rock as thick as a thigh and ends at a valve wheel under a canvas hood. Somewhere above you a bucket knocks against a tree. Nobody guards the pipe. Either nobody cares, or everybody up here knows better than to touch it.
-> terrace_hub

= terrace_hub
+ {not valve_read} [Lift the hood and look at the valve.]
  -> valve
+ [Bolt Agnes's meter onto the pipe. # check: machining 2]
  -> meter
+ [Climb back down.]
  -> road

=== valve ===
~ valve_read = true
You lift the hood. The wheel is worn bright on one side, by a hand that works it often. Somebody up here opens this pipe wider every week, and doesn't need to write down how far.
Below it sits an empty flange where a meter used to be. Its bolt holes are clean and oiled, and they are the same ring as the holes on Agnes's meter.
A terrace hand with a hoe watches you from the rows. He doesn't come down.
-> terrace.terrace_hub

=== meter ===
You set Agnes's meter against the flange and reach for the first bolt. # place: The top terrace
{ passed():
  -> fitted
}
-> sheared

=== fitted ===
~ pipe_fate = "metered"
~ marr_regard = "enemy"
You seat each bolt and draw them down one after another until the face sits square. The needle climbs and settles.
The terrace hand with the hoe has watched all of it. He reads the dial, says the number aloud twice, and walks off down the rows without a word to you.
By dusk the number is chalked on the board at the Granary gate, in a hand you don't know. # page
At first light a household crew climbs the terrace with wrenches and takes the meter off. They do it in plain sight, and the tenants on the pump track watch them do it. # reveal: all
Nobody washes the number off the Granary board.
-> END

=== sheared ===
{ sluice != "passed":
  ~ sluice = "watched"
}
~ walked_out = true
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
You draw the first bolt down hard before the others are seated, and you know it's wrong as you do it. The old flange cracks across.
Seep water sprays over the terrace stones in a bright fan and cuts under the whitewashed wall, and a stretch of it slumps into the row.
The terrace hand drops his hoe and comes running. He walks you to the gate, asks your name and your truck, and writes both on his palm with a stub of charcoal.
The household sends a bill for the stones and the wall, and it comes to {due} M. # reveal: all
-> road

=== sluice_post ===
{ crossed():
  -> through
}
A pair of Bowl patrolmen hold the gate, with a cart drawn across the road and a kettle steaming on the wall. Off to the left, a dry irrigation cut runs round the wall. # page # place: The Bowl gate
{ sluice == "watched":
  A rider in a grey coat leans on his buggy behind them. Dust lies thick on its wheels.
}
The older patrolman reads your plate off a slip of paper before you've stopped, and leans into your cab. Somebody's word got here faster than your truck did.
Sealed paper off the pump road needs a patrol pass. Got one? # speaker: Patrolman
+ [Run the dry cut round the wall. # check: driving {gate_need(2)}]
  -> cut
+ [Tell him it's pump returns for the Canal book. # check: social {gate_need(1)}]
  -> talk
+ [Slip the older one some coin. # cost: {toll}]
  -> bought
+ [Hand him the bundle.]
  -> handed

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
The dry cut is a ditch the canal people dug and then forgot. You take it at speed, and the bundle slides about on the seat.
Dust rises behind you in a long yellow flag. A shout follows it, and then a shot into the air, but nobody follows the truck down the cut. A kettle is a good reason not to.
-> through

=== rammed ===
~ sluice = "ditched"
The cut is deeper than it looked from the road. The truck comes down on a buried slab and stays there with its nose in the dirt and one wheel spinning.
The patrolmen walk up unhurried, still holding their kettle mugs, and one of them reaches in and takes the bundle off the seat.
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
He holds out his hand for the bundle.
+ [Hand it over.]
  -> seized
+ [Pay him to forget the lie as well. # cost: {toll * 2}]
  -> bought

=== bought ===
The older patrolman takes the coin without counting it and studies the dry cut as if he had never seen it before.
The cart rolls aside.
{ sluice == "watched": The rider behind them sees all of it, and he takes out a pencil. }
~ sluice = "paid"
~ marr_regard = "enemy"
-> through

=== handed ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
You hand the bundle up through the window. The older patrolman weighs it in his hand. # page # place: The Bowl gate
No pass, no fine, since you gave it up. # speaker: Patrolman
He drops it in a saddlebag. A boy rides off with the saddlebag toward the terraces, and the cart rolls aside for you as if you'd never stopped. # reveal: all
-> END

=== seized ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
They read the first page standing in the road, with the wind lifting the corner of it. # page # place: The Bowl gate
A young patrolman in a fresh coat says it's a Canal matter and ought to go to the lock house. The older one tells him to fetch the saddlebag.
The copy goes up to the terraces. Agnes still keeps her own book at the Pump Station, and now the household knows what is in it.
They fine you {due} M for carrying sealed paper without a patrol pass. # reveal: all
Your name is in their report before you reach your truck.
-> END

=== lock ===
The lock house stands on the lowest canal in the Bowl, with a sluice gate and a long beam to lift it. The stone smells of cold mud. Mud means the water was here once and isn't now. # page # place: Bowl lock house
A woman stands on the beam with her sleeves rolled to the elbow. She reads the bundle's seal before she reads you.
Agnes sent you. She doesn't trust the road, and she's right not to. # speaker: Mirela
{ book_read:
  The seal's cut. Then you know what you carry. # speaker: Mirela
}
She lays the copy beside a long book chained to the sill. One finger runs down Agnes's column for the canal pipe, the other down her own count at the lock.
Barrels a week; Agnes's meter on the canal pipe; Counted at this lock # head
Last spring; 120; 120 # row
Midsummer; 110; 110 # row
Autumn; 95; 95 # row
This week; 70; 70 # row
They agree to the barrel. That's one of her meters checked against a count nobody at the pump can touch. # speaker: Mirela
It doesn't prove the rest. It proves she didn't invent the one I can check, and the household's first word will be that she invented it. # speaker: Mirela
{ valve_read:
  You tell her about the bright wheel and the empty flange. She stops listening to anything else for a moment.
}
{ reserve_known:
  You tell her what the steward said about the store under the terrace. She stops tapping the chained book.
  Then the tenants will want it opened tonight, and the Senate splits down the middle. Good. # speaker: Mirela
  She says the last word a little too quickly.
}
She closes the copy and keeps her hand flat on it. # page
The household will say Agnes forged her copy to sell water. You carried it from her pillow to my sill. # speaker: Mirela
The Senate weighs a paper by who stands behind it. Agnes keeps the pump and I keep the lock, so we both have a side. You don't drink from either. # speaker: Mirela
Sign my book as its carrier, and it's her book, mine and a witness, not a keeper's grudge. Your name goes in my book, and the steward reads my book. # speaker: Mirela
{ book_read:
  Write that you cut the seal on the road and changed nothing. # speaker: Mirela
}
-> ask

= ask
+ {not asked_aim} [Ask what she'll do with it.]
  ~ asked_aim = true
  Read it on the Senate floor, next to my own count. # speaker: Mirela
  The canal families lost their share of the lock water in a Senate vote, years back. The household's bench carried that vote. A household caught draining the canal won't carry the next one. # speaker: Mirela
  You ask whether it's the lock share she wants, and not a meter on the pipe.
  I want both. I'll take the share first. # speaker: Mirela
  -> ask
+ [Sign as the carrier.]
  -> signed
+ [Leave your name off.]
  -> filed

=== signed ===
~ pipe_fate = "delivered"
~ canal_matches = true
~ marr_regard = "enemy"
~ note("pipeCanal")
~ give_money(fee)
You sign. Mirela writes the day beside your name, blots the page with her sleeve and counts {fee} M out of the lock box. # page # place: Bowl lock house
The Senate sits in a week. Her book, mine and a witness, and they'll have to answer for the pipe. # speaker: Mirela
The lock hands who watched you sign walk off up the canal path, and by dusk it's told at every lock in the Bowl. Your name is in a book the steward reads now. That was the price, and you paid it.
Word reaches the drivers' well a week later. Mirela read both books on the Senate floor with your name under them. The household's bench called the copy a forgery, and nobody laughed with them. # page
The vote to put a meter back on the top pipe failed by one bench. The vote to give the canal families back their lock share passed. # reveal: all
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ note("pipeCanal")
~ give_money(fee)
Mirela shrugs. She copies the top pipe's line into her own book and writes the day beside it. # page # place: Bowl lock house
Then it's a lock house's word against the household's, and they'll call it a keeper's grudge. # speaker: Mirela
She counts {fee} M out of the lock box.
Before you reach your truck, a household clerk comes down the lock steps and asks her who carried it. The road did, she tells him.
Word reaches the drivers' well a week later. Mirela read both books on the Senate floor with no witness under them. The household's bench called it a keeper's grudge, and the Senate moved on to grain before dark. # page # reveal: all
-> END

=== gate ===
~ pipe_fate = "read"
~ marr_regard = "enemy"
The weigh house stands over the Granary gate, and tenants queue below it with their sacks on their shoulders. # page # place: The Granary gate
A grey-haired tenant at the front counts the sacks aloud as they go in. When you start to read, he stops and counts your lines with you instead.
You read Agnes's lines aloud: what comes up out of the floor, what reaches the meters, and what goes up the top pipe.
By the last line the tenants are repeating it to the ones at the back.
A pair of patrolmen in Bowl coats shoulder through the crowd.
{ passed():
  -> held
}
-> fined

=== held ===
You keep reading. Your voice stays even, and the tenants take their cue from it.
They close round the patrolmen without being asked. The grey-haired man chalks the lines on the board as you read them.
The patrolmen look at the crowd and at each other. One of them writes down your plate, and then they go back the way they came.
Before dusk a household cart comes down to the Granary with a sack of grain for every family that goes home quietly. About half the queue takes a sack and goes. # reveal: all
The other half stay by the board until dark, reading the numbers to each other.
-> END

=== fined ===
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
One of them takes the copy out of your hands.
Reading out on the gate needs a steward's leave, and you haven't got one. # speaker: Patrolman
He takes {due} M for the disorder and carries the copy away toward the terraces. # reveal: all
The copy is gone, but by dusk every tenant in the queue can tell you about the pipe with no meter.
-> END

=== sold ===
~ pipe_fate = "sold"
~ marr_regard = "bought"
~ give_money(price)
The steward does not open the bundle. He weighs it once in his hand and gives you the purse. # page # place: The Bowl road
{ book_read: He looks at the cut seal and pays the same. }
He asks your name and writes it on a slip. Friends of the household drink first, he says, and he folds the slip into his coat.
Don't speak of this in the Bowl. The gate has your plate. # speaker: Steward
The cart rolls toward the terraces with the bundle on his knee. # reveal: all
You count {price} M. It's good money. It always is. Behind you, a lamp comes on at the top terrace.
-> END

=== dropped ===
~ taken = false
Water stands in the ditch, green and still, with a skin of dust on it. # page # place: The road
The oilcloth floats a moment, then the wire drags it under. The wax seal is the last thing to go.
Nobody saw, and the pipe goes on running.
-> END
