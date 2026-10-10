# view: page
# stat: money Money
# fact: book_read Pump book copy: less water comes up from the floor each season, and the gap between the floor and the meters goes up the top pipe.
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
  The steward's. A barrel of oil a month, to leave the top pipe's line empty in my book. # speaker: Agnes
  I took it, because I was afraid to say no to his face. The line in my book stays empty. The copy has the number. # speaker: Agnes
  -> handover
+ {not asked_cover} [Ask what to say if you're stopped.]
  ~ asked_cover = true
  Pump returns for the Canal book. Dull paper, and already late. Say it like you're bored of it. # speaker: Agnes
  -> handover
+ [Take the bundle and the meter out to your truck.]
  ~ taken = true
  Agnes watches you go. Then she goes back to her dials.
  -> steward

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road. # page # place: The Bowl road
A grey-haired man in a grey coat sits on its tailboard with his hands folded. A lantern is stitched on his collar, and a purse sits on the board beside him.
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
  Read that book aloud at the Granary gate in a dry autumn, and every tenant in the queue will want the store opened tonight. Then there's no store. # speaker: Steward
  -> offer
+ [Take the money.]
  -> sold
+ [Say you'll lose it, and ask for a gate pass first. # check: social 2]
  -> haggle
+ [Keep the bundle.]
  ~ offer_heard = true
  ~ offer_open = true
  ~ note("pipeOffer")
  The steward shrugs, a small and courteous movement of one shoulder.
  The offer stands until you reach the Bowl. # speaker: Steward
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
You keep your face still and your voice flat, like a driver who loses things for a living. # page # place: The Bowl road
The steward writes a line on a slip, signs it with a household mark and counts half the sum into your hand.
That will open the gate for you, and nobody there will ask what you're carrying. I think we understand each other. # speaker: Steward
He does not look at the bundle again. He is quite sure of you. # reveal: all
-> road

=== seen_through ===
~ sluice = "watched"
The steward listens to the end with his head slightly tilted. He does not smile. # page # place: The Bowl road
A driver who means to lose a thing doesn't need to carry it through the gate. # speaker: Steward
He raises a hand toward the rise, and a rider in a grey coat starts his buggy down the road toward the Bowl gate.
The offer's closed now, I'm afraid. My rider will be at the gate well before you. # speaker: Steward
-> road

=== road ===
# checkpoint: road
The pump track runs down onto the Bowl road. Ahead is the Bowl gate. Off to the left, tenants queue with their sacks at the Granary gate, and a side track climbs to the top terrace. # page # place: The road
{ book_read: The bundle rides on the seat beside you, its seal cut. | The bundle rides on the seat beside you, its seal still whole. }
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
You cut the wax and unfold the oilcloth on your knee. Agnes writes small and square, and her copy has a column her own book doesn't. # place: The road
When; Lifted from the floor; Read on the meters; Gone up the top pipe # head
Last spring; 410 barrels; 390 barrels; 20 barrels # row
Midsummer; 380 barrels; 350 barrels; 30 barrels # row
Autumn; 350 barrels; 300 barrels; 50 barrels # row
This week; 300 barrels; 230 barrels; 70 barrels # row
Less water comes up every season, and a bigger share of it goes up the top pipe.
On the last page, in the same square hand: For Mirela, to set beside hers.
-> road

=== terrace ===
A whitewashed wall runs along the top terrace, and its gate stands open for the hands who water the orchard. # page # place: The top terrace
The pipe comes up out of the rock as thick as a thigh and ends at a valve wheel under a canvas hood. Somewhere above you a bucket knocks against a tree.
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
You lift the hood. The wheel is worn bright on one side, by a hand that works it often.
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
You angle the dial toward the lower path, where a tenant with a glass can read it from the pump track.
Word goes down the terraces faster than any crew comes up. At first light a household crew climbs the terrace with wrenches, and half the bottom terrace is already at the wall, with Mirela Duarte in front and the first number on the dial in her book.
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
The flange is older than the meter. It cracks at the first bolt, and seep water sprays across the terrace stones in a bright fan.
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
The older patrolman reads your plate off a slip of paper before you've stopped, and leans into your cab.
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
Dust rises behind you in a long yellow flag. A shout follows it, and then a shot into the air, but nobody follows the truck down the cut.
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
The lock house stands on the lowest canal in the Bowl, with a sluice gate and a long beam to lift it. The stone smells of cold mud. # page # place: Bowl lock house
A woman stands on the beam with her sleeves rolled to the elbow. She reads the bundle's seal before she reads you.
Agnes sent you. She doesn't trust the road, and she's right not to. # speaker: Mirela
{ book_read:
  The seal's cut. Then you know what you carry. # speaker: Mirela
}
She lays the copy beside a long book chained to the sill. One finger runs down Agnes's meter on the canal pipe, the other down her own count at the lock.
When; Agnes's meter on the canal pipe; Counted at this lock # head
Last spring; 120 barrels; 120 barrels # row
Midsummer; 110 barrels; 110 barrels # row
Autumn; 95 barrels; 95 barrels # row
This week; 70 barrels; 70 barrels # row
They agree to the barrel. So her meters are honest, and so is the water that goes missing between her floor and her meters. # speaker: Mirela
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
Sign my book as its carrier, and it's her book, mine and a witness, not a keeper's grudge. Your name goes in my book, and the steward reads my book. # speaker: Mirela
{ book_read:
  Write that you cut the seal on the road and changed nothing. # speaker: Mirela
}
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
The Senate sits in a week. Her book, mine and a witness, and they'll have to read the pipe. # speaker: Mirela
The lock hands who watched you sign walk off up the canal path, and by dusk it's told at every lock in the Bowl.
As you go, a household clerk comes down the lock steps with a letter for her. She reads it, laughs once, and pins it under the chained book. # reveal: all
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ note("pipeCanal")
~ give_money(fee)
Mirela shrugs. She copies the top pipe's line into her own book and writes the day beside it. # page # place: Bowl lock house
Then it's a lock house's word against the household's, and they'll call it a keeper's grudge. # speaker: Mirela
She counts {fee} M out of the lock box.
Before you reach your truck, a household clerk comes down the lock steps and asks her who carried it. The road did, she tells him. # reveal: all
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
You count {price} M. Behind you, a lamp comes on at the top terrace.
-> END

=== dropped ===
~ taken = false
Water stands in the ditch, green and still, with a skin of dust on it. # page # place: The road
The oilcloth floats a moment, then the wire drags it under. The wax seal is the last thing to go.
Nobody saw, and the pipe goes on running.
-> END
