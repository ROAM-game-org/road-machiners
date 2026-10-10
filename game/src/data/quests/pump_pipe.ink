# view: page
# stat: money Money
# fact: book_read Agnes's copy: the pump brings up less water every season, and more goes missing up the terrace pipe. Her sum says the other pipes run dry by next autumn.
# fact: margin_read Agnes's copy, last page: for Mirela, to compare with hers.
# fact: offer_heard Steward Aurel Brede offered money to lose the copy on the road.
# fact: reserve_known Steward: half the terrace pipe's water fills a tank under the terrace. It is the Senate's reserve for a dry year, and only the Archon may open it.
# fact: valve_read Terrace valve: the wheel is worn shiny from use. Agnes's old meter fits the empty flange below it.
# fact: canal_matches Mirela's count at the lock matches Agnes's canal meter, season by season.
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
Agnes takes a flat bundle from under her pillow. It is the copy, wrapped in oilcloth and sealed with wax. # place: Pump Station
From her desk drawer she takes an old meter. Behind it lies an envelope with a lantern seal. She shuts the drawer.
This is the meter I took off the terrace pipe. It still fits, if you're ever up there. # speaker: Agnes
-> handover

= handover
+ {not knows_envelope} [Ask about the envelope.]
  ~ knows_envelope = true
  It's from the household's steward. He pays me a barrel of oil a month to stay quiet about the terrace pipe. # speaker: Agnes
  I took it because I was afraid to refuse him to his face. # speaker: Agnes
  -> handover
+ {knows_envelope and not asked_steward} [Ask whether the steward knows about the copy.]
  ~ asked_steward = true
  No. If he did, my pillow would be cut open by now. # speaker: Agnes
  -> handover
+ {not asked_cover} [Ask what to say if you're stopped.]
  ~ asked_cover = true
  Say it's pump records for the lock house. Boring paper, already late. Sound bored when you say it. # speaker: Agnes
  -> handover
+ [Take the copy and the meter out to your truck.]
  ~ taken = true
  ~ knows_envelope = false
  ~ asked_cover = false
  ~ asked_steward = false
  Agnes watches you go, then goes back to her dials.
  -> steward

=== steward ===
# checkpoint: steward
A cart waits where the pump track meets the Bowl road. # page # place: The Bowl road
A grey-haired man in a grey coat sits on the back of it. A lantern is stitched on his collar, and a purse sits beside him.
I am Aurel Brede, steward to the Archon's household. My watchman saw Agnes give you something sealed. # speaker: Steward
I'm not asking you to burn it. Just lose it on the road. If I send word, the patrol at the Bowl gate will open it, and I'd rather not. # speaker: Steward
He offers {price} M. # reveal: all
-> offer

= offer
+ {not asked_water} [Ask what the household wants with so much water.]
  ~ asked_water = true
  ~ reserve_known = true
  Half of it waters the orchard. The other half fills a tank under the terrace. # speaker: Steward
  That tank is the Senate's reserve for a dry year. Only the Archon may open it. # speaker: Steward
  If the tenants at the Granary hear about it, they'll make the Senate open it now. Then there's nothing left when the dry year comes. # speaker: Steward
  -> offer
+ {asked_water and not asked_drain} [Say the tank fills with Bowl's own water.]
  ~ asked_drain = true
  It does. When the dry year comes, the Archon opens the tank and Bowl drinks. # speaker: Steward
  Empty it now, and Bowl drinks well this winter and goes thirsty the next. # speaker: Steward
  -> offer
+ {asked_water and not asked_secret} [Ask why the reserve is a secret.]
  ~ asked_secret = true
  If everyone knows about a reserve, everyone wants their share today. # speaker: Steward
  -> offer
+ [Take the money.]
  ~ left_offer()
  -> sold
+ [Say you'll lose it, and ask for a gate pass first. # check: social 2]
  ~ left_offer()
  -> haggle
+ [Keep the copy.]
  ~ left_offer()
  ~ offer_heard = true
  ~ offer_open = true
  ~ note("pipeOffer")
  The steward shrugs.
  My offer stands until you reach Bowl. # speaker: Steward
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
You keep your face calm. # page # place: The Bowl road
The steward writes a pass and signs it with the household's mark. He pays you half the sum.
This will get you through the gate. Nobody there will ask what you carry. # speaker: Steward
He doesn't look at the copy again. # reveal: all
-> onto_road

=== seen_through ===
~ sluice = "watched"
The steward listens to the end. He doesn't smile. # page # place: The Bowl road
If you meant to lose it, you wouldn't need a pass to carry it through the gate. # speaker: Steward
He waves to a rider up the road. The rider sets off in a buggy toward the Bowl gate.
The offer is closed. My rider will reach the gate before you. # speaker: Steward
-> onto_road

=== onto_road ===
The pump track joins the Bowl road. Ahead is the Bowl gate, held by a patrol. # page # place: The road
To the left, tenants queue with sacks at the Granary gate. A side track climbs to the top terrace.
-> road

=== road ===
# checkpoint: road
{ book_read: The copy lies on the seat beside you, its seal cut. | The copy lies on the seat beside you, still sealed. } # place: The road
+ {not book_read} [Cut the seal and read the copy.]
  -> read
+ {not walked_out} [Take the side track up to the top terrace.]
  -> terrace
+ [Drive on to the Bowl gate.]
  -> sluice_post
+ {book_read} [Read the copy aloud to the tenants at the Granary gate. # check: social 2]
  -> gate
+ {offer_open} [Go back to the steward and sell him the copy.]
  -> sold
+ [Throw the copy in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ margin_read = true
~ note("pipeDraw")
You cut the seal and open the copy on your knee. It matches the book you saw at the pump, line for line. # place: The road
Barrels a week; Pumped up; Reached the metered pipes; Missing # head
Last spring; 410; 390; 20 # row
Midsummer; 380; 350; 30 # row
Autumn; 350; 300; 50 # row
This week; 300; 230; 70 # row
On the last page Agnes has done a sum in pencil. If this goes on, every other pipe runs dry by next autumn.
Under it she wrote: For Mirela, to compare with hers.
-> road

=== terrace ===
A whitewashed wall runs along the top terrace. Its gate is open for the workers who water the orchard. # page # place: The top terrace
The pipe comes up out of the rock and ends at a valve wheel under a canvas cover. Nobody guards it.
-> terrace_hub

= terrace_hub
+ {not valve_read} [Lift the cover and look at the valve.]
  -> valve
+ [Bolt Agnes's meter onto the pipe. # check: machining 2]
  -> meter
+ [Climb back down.]
  -> road

=== valve ===
~ valve_read = true
The valve wheel is worn shiny on one side. Someone opens it often.
Below it is an empty flange where a meter used to sit. Its bolt holes match Agnes's meter.
A worker with a hoe watches you from the orchard rows.
-> terrace.terrace_hub

=== meter ===
You hold Agnes's meter against the flange and start on the bolts. # place: The top terrace
{ passed():
  -> fitted
}
-> sheared

=== fitted ===
~ pipe_fate = "metered"
~ marr_regard = "enemy"
The bolts go down evenly, and the meter sits flat. The needle rises and settles.
The worker with the hoe reads the dial and says the number out loud. Then he walks off down the rows.
By evening the number is chalked on the board at the Granary gate. # page
At dawn a household crew comes and takes the meter off. The tenants on the pump track watch them do it. # reveal: all
The number stays on the Granary board.
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
You tighten the first bolt too hard before the others are in. The old flange cracks.
Water sprays across the terrace and washes under the wall. Part of the wall falls into the orchard.
The worker drops his hoe and runs over. He walks you to the gate and writes your name and your truck on his palm.
The household bills you {due} M for the wall. # reveal: all
-> road

=== sluice_post ===
{ crossed():
  -> through
}
Bowl patrolmen hold the gate, with a cart across the road. To the left, a dry ditch runs around the wall. # page # place: The Bowl gate
{ sluice == "watched":
  The steward's rider waits behind them, next to his buggy.
}
The older patrolman leans into your cab and looks at the copy on the seat.
Sealed papers from the pump road need a patrol pass. Have you got one? # speaker: Patrolman
+ [Drive the dry ditch around the wall. # check: driving {gate_need(2)}]
  -> cut
+ [Tell him it's pump records for the lock house. # check: social {gate_need(1)}]
  -> talk
+ [Slip the older one some coin. # cost: {toll}]
  -> bought
+ [Hand him the copy.]
  -> handed

=== through ===
{ sluice == "passed":
  The patrolmen read the steward's pass and move the cart out of your way. # place: The Bowl gate
  Neither of them looks at the copy.
}
-> lock

=== cut ===
{ passed():
  -> ran
}
-> rammed

=== ran ===
~ sluice = "ran"
You drop into the ditch at speed. The copy slides around on the seat.
Someone shouts behind you and fires a shot into the air. Nobody follows.
-> through

=== rammed ===
~ sluice = "ditched"
The ditch is deeper than it looked. The truck hits a buried slab and stops nose down, with a wheel spinning.
The patrolmen walk over, and one of them takes the copy off the seat.
-> seized

=== talk ===
{ passed():
  -> talked
}
-> read_through

=== talked ===
~ sluice = "talked"
You tell him it's pump records for the lock house, boring and already late. You sound bored.
The older patrolman nods and waves the cart aside.
-> through

=== read_through ===
You tell him it's pump records for the lock house, boring and already late.
Pump records come down in the pump cart. Nobody pays a truck to carry boring paper. # speaker: Patrolman
He holds out his hand for the copy.
+ [Hand it over.]
  -> seized
+ [Pay him to forget it. # cost: {toll * 2}]
  -> bought

=== bought ===
The older patrolman takes the coin without counting it. The cart rolls aside.
{ sluice == "watched": The steward's rider sees it all and writes something down. }
~ sluice = "paid"
~ marr_regard = "enemy"
-> through

=== handed ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
You hand the copy through the window. # page # place: The Bowl gate
No pass. Since you gave it up, there's no fine. # speaker: Patrolman
He puts it in a saddlebag, and a boy rides off with it toward the terraces. The cart rolls aside. # reveal: all
-> END

=== seized ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
The patrolmen read the first page standing in the road. # page # place: The Bowl gate
A young patrolman says it belongs at the lock house. The older one tells him to bring a saddlebag.
The copy goes up to the terraces. Now the household knows what Agnes wrote.
They fine you {due} M for carrying sealed papers without a pass. # reveal: all
Your name goes into their report.
-> END

=== lock ===
The lock house stands by the lowest canal in Bowl. A gate in the canal lifts on a long wooden beam. The canal bed is mostly dry mud. # page # place: Bowl lock house
A woman with rolled sleeves stands on the beam. She looks at the seal before she looks at you.
Agnes sent you. Good. # speaker: Mirela
{ book_read:
  The seal's cut, so you've read it. # speaker: Mirela
}
She lays the copy next to a book chained to the windowsill. She finds Agnes's numbers for the canal pipe and sets them beside her own.
Barrels a week; Agnes's meter on the canal pipe; Mirela's count at the lock # head
Last spring; 120; 120 # row
Midsummer; 110; 110 # row
Autumn; 95; 95 # row
This week; 70; 70 # row
They match to the barrel. Nobody at the pump can touch my count, so Agnes's numbers are real. # speaker: Mirela
{ valve_read:
  You tell her about the shiny valve wheel and the empty flange. She listens closely.
}
{ reserve_known:
  You tell her about the reserve tank under the terrace.
  Then the tenants will want it opened, and the Senate will split. Good. # speaker: Mirela
  She says it a little too fast.
}
She closes the copy and keeps her hand on it. # page
The household will say Agnes forged this, so I need a witness. Agnes and I both need this water. You don't. # speaker: Mirela
Sign my book as the one who carried it. Your name will be in my book, and the steward reads my book. # speaker: Mirela
{ book_read:
  Write that you cut the seal on the road and changed nothing. # speaker: Mirela
}
-> ask

= ask
+ {not asked_aim} [Ask what she'll do with it.]
  ~ asked_aim = true
  I'll read it to the Senate, next to my own count. # speaker: Mirela
  Years ago the Senate took away the canal families' share of the lock water. The household's votes did it. If the household is caught taking water, they won't win the next vote. # speaker: Mirela
  You ask whether she wants the share back or a meter on the pipe.
  Both. The share first. # speaker: Mirela
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
You sign. Mirela writes the date next to your name and pays you {fee} M from the lock box. # page # place: Bowl lock house
The Senate meets in a week. # speaker: Mirela
The lock workers who watched you sign spread the news along the canal. Your name is now in a book the steward reads.
A week later, news reaches the drivers' well. Mirela read both books to the Senate with your name under them. The household called the copy a forgery, and nobody believed them. # page
The vote to put a meter back on the terrace pipe failed by one vote. The vote to give the canal families back their share passed. # reveal: all
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ note("pipeCanal")
~ give_money(fee)
Mirela shrugs. She copies the terrace pipe numbers into her own book. # page # place: Bowl lock house
Then it's my word against the household's. They'll call it a grudge. # speaker: Mirela
She pays you {fee} M from the lock box.
As you leave, a household clerk comes down the steps and asks her who carried it. She says it was a driver she didn't know.
A week later, news reaches the drivers' well. Mirela read both books to the Senate with no witness. The household called it a grudge, and the Senate moved on. # page # reveal: all
-> END

=== gate ===
~ pipe_fate = "read"
~ marr_regard = "enemy"
The weigh house stands over the Granary gate. Tenants queue below it with sacks on their shoulders. # page # place: The Granary gate
You read Agnes's numbers out loud: what the pump brings up, what reaches the metered pipes, and what goes missing up the terrace pipe.
A grey-haired tenant at the front repeats each number to the people behind him.
Bowl patrolmen push through the crowd toward you.
{ passed():
  -> held
}
-> fined

=== held ===
You keep reading. The tenants close in around the patrolmen.
The grey-haired tenant chalks the numbers on the board as you read them.
The patrolmen write down your plate and leave.
Before evening a household cart brings a sack of grain for every family that goes home quietly. About half the queue takes a sack and leaves. # reveal: all
The rest stay by the board until dark.
-> END

=== fined ===
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
A patrolman takes the copy out of your hands.
Reading out at the gate needs the steward's permission, and you don't have it. # speaker: Patrolman
He fines you {due} M and carries the copy off toward the terraces. # reveal: all
By evening, every tenant in the queue knows about the pipe with no meter.
-> END

=== sold ===
~ pipe_fate = "sold"
~ marr_regard = "bought"
~ give_money(price)
The steward doesn't open the copy. He weighs it in his hand and gives you the purse. # page # place: The Bowl road
{ book_read: He sees the cut seal and pays anyway. }
He writes your name on a slip.
Friends of the household drink first. Don't talk about this in Bowl. The gate has your plate. # speaker: Steward
His cart rolls up toward the terraces with the copy. # reveal: all
You count {price} M.
-> END

=== dropped ===
~ taken = false
The ditch holds green, still water. The copy floats for a moment, then sinks. # page # place: The road
Nobody saw. The terrace pipe keeps running.
-> END
