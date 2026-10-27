# view: page
# stat: money M's
# fact: book_read Agnes's copy: the water stands lower on the tank wall every season, and the household truck takes more. Her guess, if that goes on: Bowl's trucks leave Dustwell dry by next autumn.
# fact: margin_read Agnes's copy, last fold: for Mirela, to lay against her trough.
# fact: offer_heard Steward Aurel Brede offered M's to lose the copy and forget the tank wall.
# fact: reserve_known Steward: half of the household truck's water fills a tank under the top terrace. It is the Senate's reserve for a dry year, and only the Archon may open it.
# fact: valve_read Top terrace: the household truck's barrels are emptied into a stone tank. Its inlet has an empty flange where a glass window used to sit.
# fact: canal_matches Bowl's trucks reach Mirela's trough as short as they left Agnes, every bung still sealed with her clay. The tank wall is the other half, and you saw it.
INCLUDE world.ink

VAR taken = false
VAR meter_taken = false
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
Agnes leads you into the shed behind the tanks, out of the watchman's sight, and pulls the door to. # place: Dustwell
She takes a flat bundle from under the pillow on her cot. It is the copy, a long oilcloth with the tank wall's rings drawn on it, ring above ring. She unrolls it, draws the water line as it stands today in pencil, rolls it up again and seals it with wax.
From her desk drawer she takes a short length of hose with a glass window in it and sets it on the desk. Behind it lies an envelope with a lantern seal. She shuts the drawer on it.
This is the glass window the Senate made me take off the household truck's hose. It also fits the stone tank where that truck empties its barrels, up on the household's terrace in Bowl. # speaker: Agnes
Bolt it on there and all of Bowl can see the next load through the glass. On household land you are on your own. Take it or leave it. # speaker: Agnes
-> handover

= handover
+ {not knows_envelope} [Ask about the envelope.]
  ~ knows_envelope = true
  It's from the household's steward. A barrel of oil a month, to keep quiet about the household truck. # speaker: Agnes
  I took it because I was afraid to refuse him to his face. # speaker: Agnes
  -> handover
+ {knows_envelope and not asked_steward} [Ask whether the steward knows about the copy.]
  ~ asked_steward = true
  No. If he did, my pillow would be cut open by now. # speaker: Agnes
  -> handover
+ {not asked_cover} [Ask what to say if you're stopped.]
  ~ asked_cover = true
  Say it's spare oilcloth for the lock house gates, old and already late. Say it like you're tired of being asked. # speaker: Agnes
  -> handover
+ [Take the copy and the glass window out to your truck.]
  ~ meter_taken = true
  -> leaving
+ [Take the copy and leave the glass window.]
  -> leaving

= leaving
~ taken = true
~ knows_envelope = false
~ asked_cover = false
~ asked_steward = false
Agnes watches you go, then goes back to the tank wall.
-> steward

=== steward ===
# checkpoint: steward
A truck waits where the Dustwell track meets the Bowl road. # page # place: The Bowl road
A grey-haired man in a grey coat sits on its tailgate. A lantern is stitched on his collar, and a purse sits beside him.
I am Aurel Brede, steward to the Archon's household. My watchman saw Agnes give you something sealed. He also saw you beside Agnes at the tank, watching our household truck fill. # speaker: Steward
I'm not asking you to burn anything, only to lose that sealed bundle somewhere along the road. If anyone in Bowl asks, you never stood at that tank. # speaker: Steward
He offers {price} M. # reveal: all
That's a lot of M's for forgetting what you saw.
-> offer

= offer
+ {not asked_water} [Ask what the household wants with so much water.]
  ~ asked_water = true
  ~ reserve_known = true
  Half of it waters our gardens. The other half fills a tank under the terrace. # speaker: Steward
  That tank is the Senate's reserve for a dry year. Only the Archon may open it. # speaker: Steward
  If the tenants hear about it, they'll make the Senate open it now. Then there's nothing left when the dry year comes. # speaker: Steward
  -> offer
+ {asked_water and not asked_drain} [Say the tank fills with Bowl's own water.]
  ~ asked_drain = true
  It does. When the dry year comes, the Archon opens the tank and Bowl drinks. # speaker: Steward
  Empty it now, and Bowl drinks well this winter and goes thirsty the next. # speaker: Steward
  -> offer
+ {asked_water and not asked_secret} [Ask why the reserve is a secret.]
  ~ asked_secret = true
  In the last dry year Bowl kept an open store of grain. Everyone knew about it, and it was gone in a week. # speaker: Steward
  -> offer
+ [Take the M's.]
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
He waves to a rider up the road. The rider sets off in a buggy toward Bowl.
The offer is closed. My rider will reach the gate before you. # speaker: Steward
-> onto_road

=== onto_road ===
The Bowl road runs across the flat. Bowl is hours away. # page # place: The road
Far ahead, the household truck crawls along under its barrels. Bowl's trucks pass you with empty barrels on their way back to the pump.
-> road

=== road ===
# checkpoint: road
{ book_read: The copy lies on the seat beside you, its seal cut. | The copy lies on the seat beside you, still sealed. } # place: The road
+ {not book_read} [Cut the seal and read the copy.]
  -> read
+ [Drive on to the Bowl gate.]
  -> sluice_post
+ {offer_open} [Go back to the steward and sell him the copy.]
  -> sold
+ [Throw the copy in a ditch.]
  -> dropped

=== read ===
~ book_read = true
~ margin_read = true
~ note("pipeDraw")
You cut the seal and open the copy on your knee. It matches the tank wall you saw at the pump, ring for ring, down to today's pencil line.
On the last fold Agnes has drawn the wall forward in pencil. At the top she wrote: if the pump keeps falling and the household truck keeps growing.
Under it the water line sinks ring by ring toward the tank's floor. Beside the last ring she drew a Bowl truck with an empty bed, and the household truck with every barrel full.
It's a guess, and she says so. What's real is the wall you saw and the trucks that left the line short.
Under the drawing she wrote: For Mirela, to lay against her trough.
-> road

=== sluice_post ===
{ crossed():
  -> through
}
Bowl patrolmen hold the gate, with a handcart across the road. To the left, a dry ditch runs around the wall. # page # place: The Bowl gate
The household truck is through the gate ahead of you. Nobody asked it for a pass.
{ sluice == "watched":
  The steward's rider waits behind the patrolmen, next to his buggy.
}
The older patrolman leans into your cab and looks at the copy on the seat.
{ book_read: A bundle | A sealed bundle } from the pump road needs a patrol pass. Have you got one? # speaker: Patrolman
+ [Drive the dry ditch around the wall. # check: driving {gate_need(2)}]
  -> cut
+ [Tell him it's spare oilcloth for the lock house gates. # check: social {gate_need(1)}]
  -> talk
+ [Slip the older one a few M's. # cost: {toll}]
  -> bought
+ [Hand him the copy.]
  -> handed

=== through ===
{ sluice == "passed":
  The patrolmen read the steward's pass and move the cart out of your way. # place: The Bowl gate
  Neither of them looks at the copy.
}
-> town

=== town ===
# checkpoint: town
Inside the wall, Bowl steps down the crater in terraces. The household's gardens sit on the top terrace, and the household truck's tracks climb toward them. # place: Bowl
The market is halfway down, and the lock house is at the bottom by the canals.
-> town_hub

= town_hub
+ [Drive down to the lock house.]
  -> lock
+ {not walked_out} [Follow the household truck's tracks up to the top terrace.]
  -> terrace
+ {book_read} [Hold the copy up in the market. # check: social 2]
  -> market

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
You tell him it's spare oilcloth for the lock house gates, old and already late. You sound tired of being asked.
The older patrolman nods and waves the cart aside.
-> through

=== read_through ===
You tell him it's spare oilcloth for the lock house gates, old and already late.
Oilcloth comes down with Bowl's trucks. Nobody pays a driver to carry one sealed bundle. # speaker: Patrolman
He holds out his hand for the copy.
+ [Hand it over.]
  -> seized
+ [Pay him to forget it. # cost: {toll * 2}]
  -> bought

=== bought ===
The older patrolman takes the M's without counting them. The cart rolls aside.
{ sluice == "watched": The steward's rider sees it all and writes something down. }
~ sluice = "paid"
~ marr_regard = "enemy"
-> through

=== handed ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
You hand the copy through the window. # page # place: The Bowl gate
No pass. Since you gave it up, there's no fine. # speaker: Patrolman
He puts it in a satchel, and a boy runs off with it toward the top terrace. The cart rolls aside. # reveal: all
-> END

=== seized ===
~ pipe_fate = "seized"
~ marr_regard = "enemy"
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
The patrolmen unroll the first fold standing in the road. # page # place: The Bowl gate
A young patrolman says it belongs at the lock house. The older one tells him to bring a satchel.
The copy goes up to the top terrace. Now the household knows what Agnes drew, and who carried it.
They fine you {due} M for carrying a sealed bundle without a pass. # reveal: all
Your name goes into their report.
-> END

=== terrace ===
The household's gardens fill the top terrace behind a whitewashed wall. Its gate is open for the workers. # page # place: The top terrace
By the gate, the household truck is backed up to a low stone tank. Its crew tip its barrels one by one into the tank's inlet. Nobody guards it.
-> terrace_hub

= terrace_hub
+ {not valve_read} [Look at the tank's inlet.]
  -> valve
+ {meter_taken} [Bolt Agnes's glass window onto the inlet. # check: machining 2]
  -> meter
+ [Drive back down.]
  -> town.town_hub

=== valve ===
~ valve_read = true
The inlet has an empty flange where a glass window used to sit. The bolt holes are clean, so it hasn't been empty long.
{ meter_taken: Agnes's glass window would fit it. }
The household truck's driver sits in the shade and doesn't get up.
A worker with a hoe watches you from the garden rows.
-> terrace.terrace_hub

=== meter ===
You wait until the household truck drives off. Then you hold Agnes's glass window against the flange and start on the bolts. # place: The top terrace
{ passed():
  -> fitted
}
-> sheared

=== fitted ===
~ pipe_fate = "metered"
~ marr_regard = "enemy"
The bolts go down evenly, and the glass window sits flat.
Next morning the household truck comes back full, and its barrels go in through your glass, one after another, for anyone on the terrace to see. The worker with the hoe watches the water run clear through it all morning and says out loud what he sees. Then he walks off down the rows.
By evening the whole market has heard it. # page
At dawn a household crew takes the glass window off. The tenants in the market watch them do it. # reveal: all
What the worker saw stays with the tenants. Nobody needs Agnes's copy to know it.
-> END

=== sheared ===
~ walked_out = true
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
You tighten the first bolt too hard before the others are in. The old flange cracks across, and the inlet is ruined.
The worker drops his hoe and runs over. He walks you to the gate and writes your name and your truck on his palm.
The household bills you {due} M for a new inlet. # reveal: all
-> town.town_hub

=== lock ===
The lock house stands at the bottom of Bowl, where the canals begin. Bowl's trucks back up to a long stone trough and empty their barrels into it, and the trough feeds the canals. # page # place: Bowl lock house
A woman with rolled sleeves stands at the trough with a hand on its rim, watching a truck pour. A pale stain climbs the stone high above the water, where the trucks once filled it to. She looks at the seal before she looks at you.
Agnes sent you. Good. # speaker: Mirela
{ book_read:
  The seal's cut, so you've read it. # speaker: Mirela
}
She spreads the copy along the trough wall and runs a finger down the rings, then along the stain in the stone. Behind her, Bowl's trucks back up in turn. Their beds have empty places in the rows, and every bung still wears its thumb of grey clay.
Bowl's trucks reach my trough with gaps in their rows, and every bung still wears Agnes's clay, whole. Nothing was taken on the road, so don't put this on Agnes's hoses. # speaker: Mirela
Nobody in Bowl has seen that tank wall, but you stood there this week and watched the household truck fill first. # speaker: Mirela
Agnes speaks for her hoses, I speak for this trough, you speak for that wall. Each of us says only what we saw ourselves. # speaker: Mirela
The wall shows how far the water sank, this trough shows how little came down, and you saw whose truck left full. # speaker: Mirela
{ valve_read:
  You tell her about the stone tank on the terrace and the empty flange on its inlet. She listens closely.
}
{ reserve_known:
  You tell her what the steward said about the reserve under the terrace.
  Then the tenants will want it opened, and the Senate will split. Good. # speaker: Mirela
  She says it a little too fast.
}
She closes the copy and keeps her hand on it. # page
The household will say Agnes and I both want this water, and that's true. You don't. # speaker: Mirela
Black your hand and press it to Agnes's cloth where you saw the tank water reach, not where she tells you. Your hand says the water stood at that mark this week, and that's all it says. # speaker: Mirela
Then your hand's on the cloth, and the household's clerk comes to this trough every morning, let him look. # speaker: Mirela
{ book_read:
  Say you cut the seal on the road and changed nothing. # speaker: Mirela
}
-> ask

= ask
+ {not asked_aim} [Ask what she'll do with the copy.]
  ~ asked_aim = true
  I'll lay the cloth on the Senate floor and name every hand that touched it, ours too. # speaker: Mirela
  The household's clerk stands at this trough every morning and says which canal gets how much. That was the canal families' job until the Senate gave it to him. The household's votes did it. # speaker: Mirela
  If the household is caught taking water, they won't win the next vote on the trough. # speaker: Mirela
  You ask whether she wants the trough back or the glass window back on the household truck's hose.
  Both. The trough first. # speaker: Mirela
  -> ask
+ [Put your hand on the cloth where you saw the water.]
  -> signed
+ [Keep your hand off the cloth.]
  -> filed

=== signed ===
~ pipe_fate = "delivered"
~ canal_matches = true
~ marr_regard = "enemy"
~ note("pipeCanal")
~ give_money(fee)
You black your hand and press it to the cloth at the line you saw. Mirela pays you {fee} M from the lock box. # page # place: Bowl lock house
{ meter_taken and not walked_out: You leave Agnes's glass window with her as well. }
The Senate meets in a week. # speaker: Mirela
The truck drivers who watched you press your hand spread the news.
A week later, news reaches the drivers' well. Mirela laid the cloth on the Senate floor: Agnes's wall, her own trough and your black hand at the water line. # page
The household's bench said Agnes drew the rings herself. Mirela pointed at the hand and asked whose it was, and said your name. Nobody on that bench knew you, so nobody could call you a liar.
The Senate took no vote on the household truck and needed none. The next week the truck came to the pump, and its hose had its glass window back, fitted by the steward's own crew. A truck in the open is a smaller story than a secret one, and the steward deals in small stories. # reveal: all
The trough stays with the household's clerk, and the reserve under the terrace stays a secret. Your hand is on a cloth the steward has seen. Nobody from the household has come asking for you.
-> END

=== filed ===
~ pipe_fate = "filed"
~ canal_matches = true
~ note("pipeCanal")
~ give_money(fee)
Mirela shrugs. She rolls the cloth up under her arm. # page # place: Bowl lock house
Then it's Agnes's wall and my trough, and we both want the water. The household will say Agnes drew those rings herself, just you watch. # speaker: Mirela
She pays you {fee} M from the lock box.
{ meter_taken and not walked_out: You leave Agnes's glass window with her as well. }
As you leave, a household clerk comes down the steps and asks her who carried it. She says it was a driver she didn't know.
A week later, news reaches the drivers' well. Mirela showed Agnes's cloth and her own trough to the Senate. The household said Agnes drew the rings herself. Nobody could say who stood at the wall, and a cloth with no witness is only a cloth. # page
The Senate moved on to grain. # reveal: all
-> END

=== market ===
~ pipe_fate = "read"
~ marr_regard = "enemy"
Tenants crowd the market with empty water cans. Bowl's trucks are late with the water again. # page # place: Bowl market
You hold Agnes's cloth up and tell them what you saw at the pump: the water sinking down the wall, the line of Bowl's trucks leaving short, and the household truck filling first from the one hose with no glass window.
A grey-haired tenant tells it again to the people behind him.
Bowl patrolmen push through the crowd toward you.
{ passed():
  -> held
}
-> fined

=== held ===
You keep talking. The tenants close in around the patrolmen.
The grey-haired tenant hangs a corner of the cloth on the market board, so everyone can see the rings.
The patrolmen write down your name and your truck and leave.
Before evening a household truck brings a sack of grain for every family that goes home quietly. About half the crowd takes a sack and leaves. # reveal: all
The rest stay by the board until dark.
-> END

=== fined ===
~ temp due = fine
{ money() < due:
  ~ due = money()
}
~ pay(due)
A patrolman takes the copy out of your hands.
Showing a cloth in the market needs the steward's permission, and you don't have it. # speaker: Patrolman
He fines you {due} M and carries the copy off toward the top terrace. # reveal: all
By evening, everyone in the market knows about the household truck.
-> END

=== sold ===
~ pipe_fate = "sold"
~ marr_regard = "bought"
~ give_money(price)
The steward doesn't open the copy. He weighs it in his hand and gives you the purse. # page # place: The Bowl road
{ book_read: He sees the cut seal and pays anyway. }
He writes your name on a slip.
Friends of the household drink first. If anyone in Bowl asks, you never stood at that tank, and you may be assured the gate has your name. # speaker: Steward
His truck rolls off toward Bowl with the copy. # reveal: all
You count {price} M.
-> END

=== dropped ===
~ taken = false
~ meter_taken = false
You throw the copy into a dry ditch and kick dust over it. # page # place: The road
Nobody saw. The household truck keeps coming.
-> END
