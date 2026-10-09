# view: page
# stat: money Money
# fact: wall_read Blockhouse wall: coats of paint, one number over another. This morning's number is one short of the last.
# fact: gap_seen Motor pool: an empty slot at the end of the third row. The chocks are still in place and the ground under it is swept.
# fact: ilya_said Ilya: the gate was shut all night and he slept in the blockhouse. He has counted every dawn and never been wrong.
# fact: stub_read Gate stub book: at dusk a Pierce cart passed the gate with a release paper for one truck.
# fact: release_read Release paper: the Pierce lien number matches the one on the chocks of the empty slot. The seal of the Archon's household is on it.
# fact: marks_seen Motor pool: fresh chalk ticks on the doors of the cabs beside the empty slot. A few of them carry no dust on the handles.
INCLUDE world.ink

VAR wall_read = false
VAR gap_seen = false
VAR ilya_said = false
VAR stub_read = false
VAR release_read = false
VAR marks_seen = false
VAR cold = false
VAR chased = false
VAR paint = 10
VAR price = 70
VAR stub_fee = 20
VAR tow = 60

=== start ===
# checkpoint: start
Old Orchard has a gate and nothing behind it but rows of trucks. # place: Old Orchard
They stand where the Army left them, nose to tail, their canvas gone grey and stiff as old bark. A Bowl patrolman leans on the gatepost and watches the road without much hope of anything on it.
A man in a patrol coat stands in front of the blockhouse with a paint pot in one hand. His back is very straight, and he has not moved since you came through the gate.
-> yard

=== yard ===
# checkpoint: yard
The motor pool is quiet except for the wind working at loose canvas. Dust lies thick on every cab. # page # place: Old Orchard
{ cold:
  Ilya has put his back to you, and the gate corporal watches you the way a man watches a dog that has bitten once.
}
+ {not wall_read} [Read the blockhouse wall.]
  -> wall
+ {not gap_seen} [Walk the rows of trucks.]
  -> gap
+ {not ilya_said and not cold} [Ask Ilya what happened.]
  -> ilya
+ {gap_seen and not stub_read and marr_regard != "enemy"} [Ask the gate corporal for his stub book.]
  -> stub
+ {gap_seen and not stub_read and marr_regard == "enemy"} [Ask the gate corporal for his stub book. # cost: {stub_fee}]
  -> stub_dear
+ {stub_read and not release_read} [Read the release paper.]
  -> release
+ {gap_seen and not cold} [Pull the injectors from the cabs beside the empty slot.]
  -> pull
+ {stub_read and not chased} [Run the Pierce cart down on the north road.]
  -> chase
+ {release_read and not cold} [Show Ilya the paper.]
  -> told
+ {release_read and not cold} [Ask Ilya to say the true number aloud, where the patrol can hear him.]
  -> aloud
+ {release_read} [Buy a pot of white paint and paint the old number back. # cost: {paint}]
  -> painted
+ {release_read} [Sell the paper to the gate corporal.]
  -> sold
+ [Let it go.]
  -> END

=== wall ===
~ wall_read = true
~ note("countWall")
The blockhouse wall is white with paint, coat on coat, a number in the middle of it. # place: Old Orchard
Coat; Number # head
Oldest; 38 # row
Second; 36 # row
This morning; 35 # row
The wet paint of the last coat still shines. The man who painted it has not put the brush down.
-> yard

=== gap ===
~ gap_seen = true
You walk the rows with the sun on the back of your neck. Each truck has a number painted on its door, always in the same square hand. # place: The motor pool
At the end of the third row stands an empty slot. The chocks still lie in the dust where the wheels were, and a number is stenciled on each.
The ground under it has been swept clean with a broom, in a place where nobody sweeps.
{ skill("perception") >= 2:
  ~ marks_seen = true
  Along the row beside it, a few cab doors carry a fresh tick of chalk low on the panel. The handles on those doors are bright where the others are furred with dust.
}
-> yard

=== ilya ===
~ ilya_said = true
Ilya Moreno does not lower the brush. # place: The blockhouse
Those trucks are the army, and I am still on duty. I have counted them every dawn since the Bowl put me in this coat. # speaker: Ilya
The gate was shut all night. I slept in the blockhouse with the door open, as I always do. This morning I counted the rows again, and again, and a third time, and the sum would not change. # speaker: Ilya
-> yard

=== stub ===
~ stub_read = true
~ note("countGap")
The gate corporal keeps a stub book inside his coat. He hands it over the way a man hands over a tooth. # place: The gate
At dusk a Pierce cart came through with a paper. There was a clerk on the tailboard and a driver on the reins, and we let it pass. # speaker: Corporal
The paper was in order and I didn't read it close. Ilya was at his supper, and I wasn't about to stand in front of a cart with a household seal on it. # speaker: Corporal
-> yard

=== stub_dear ===
~ stub_read = true
~ note("countGap")
The corporal holds the stub book against his chest. You are the one the household's steward described to me over a drink, he says. # place: The gate
The coin buys you a look, and he watches your hands the whole time. # place: The gate
The cart came at dusk with a Pierce clerk on the tailboard, and we let it through on a paper with a household seal. That's all I'll say about it. # speaker: Corporal
-> yard

=== release ===
~ release_read = true
~ note("countRelease")
The corporal keeps a flimsy copy of every paper that crosses his gate. He lets you hold this one by the edges. # place: The gate
Truck; Lien; Released to; Sealed by # head
End of third row; 2207; Pierce cart; Household of the Archon # row
The seal at the foot is a Marr seal. The lien number matches the one stenciled on the chocks.
-> yard

=== pull ===
You carry a socket set across the motor pool in the long shadow of the blockhouse, and you keep to the rows where the corporal cannot see you. # page # place: The motor pool
{ skill("machining") >= 2:
  -> pulled
}
-> clumsy

=== pulled ===
~ count_fate = "pulled"
The chalked cabs open without complaint. Each engine is a cold block of dust and old grease, and the injectors come out with a short twist once you know which line to back off first.
You bury them in a drum of sand behind the blockhouse and wipe the handles with your sleeve. A cart that comes for these trucks will need a wrecker and half a day, and the gate corporal will see it coming.
Ilya paints the same number the next dawn. It is still one short, and he still will not say so. The rows beside the empty slot stay where they are. # reveal: all
-> END

=== clumsy ===
~ cold = true
~ temp due = stub_fee
{ money() < due:
  ~ due = money()
}
~ pay(due)
The first injector line is seized with rust and gives way all at once. A spray of old diesel hits the cab door, and a wrench rings off the frame like a bell.
The corporal is there before you can straighten up. He takes {due} M from you for the spilled fuel and says it will cost more if he tells Ilya what you were doing. # reveal: all
Ilya has heard the wrench. He puts his back to you and goes on painting.
-> yard

=== chase ===
The north road runs straight and pale for most of a day, and a loaded cart cannot hurry on it. # page # place: The north road
{ skill("driving") >= 3 and lien_standing != "enemy":
  -> reclaimed
}
{ skill("driving") >= 4:
  -> reclaimed
}
-> rammed

=== reclaimed ===
~ count_fate = "reclaimed"
~ lien_standing = "enemy"
You find the cart in a dry wash where the road bends, its driver standing on the brake to take the slope. You cut across the sand and put your truck broadside in front of the team.
The clerk shouts that the truck is the Corporation's collateral by a lien older than anyone on this road. The driver looks at your fender, at his own, and unhooks without waiting to be told.
You tow the truck back to Old Orchard with its brakes still groaning. The empty slot closes. Ilya counts the rows at dusk, finds the sum he wants, and puts the brush down for the first time in a day. # reveal: all
-> END

=== rammed ===
~ chased = true
~ lien_standing = "enemy"
~ temp due = tow
{ money() < due:
  ~ due = money()
}
~ pay(due)
The cart's driver sees you coming and puts a pair of outriders across the wash. One of them pushes your truck into the bank with a bumper made for exactly that.
It costs {due} M to get you out. The clerk writes down your truck number from his seat and does not hurry. # reveal: all
-> yard

=== told ===
~ count_fate = "told"
~ note("countLog")
Ilya reads the paper once. He reads the seal twice. # page # place: The blockhouse
He sets the paint pot on the step and sits beside it, slowly, like a man whose knees have only just reminded him of their age.
An army does not sell its own trucks. A household does, with a seal and a cart and a clerk who is paid by the cart. # speaker: Ilya
He does not paint a new number. He takes a ledger from the blockhouse shelf and tears out a page.
Quarter; Nose fuel owed to the Army; Marked in the book # head
First; due; held # row
Second; due; held # row
Third; due; held # row
Keep it. I counted trucks for years. I should have been counting this. # speaker: Ilya
The wall says one number now. Ilya stays on duty. # reveal: all
-> END

=== aloud ===
{ skill("social") >= 2:
  -> posted
}
-> shut_out

=== posted ===
~ count_fate = "posted"
~ marr_regard = "enemy"
You do not argue with him. You tell him that a sentry who knows the true count and keeps it to himself has deserted his post as surely as one who walks away. # page # place: The blockhouse
Ilya looks at you for a long moment. Then he walks to the gate in the patrol's own coat, stands before the corporal and the men on duty, and says the number aloud, and what the paper says, and whose seal is on it.
The corporal does not reach for his book. By evening the patrol has sent a rider to Bowl, and Ilya has been told to give back the coat. He folds it on the blockhouse step. # reveal: all
He goes on painting the wall. He is not on anyone's duty now but his own.
-> END

=== shut_out ===
~ cold = true
Ilya listens to you with his jaw working. Then he says that a stranger does not give a corporal of the Army orders about his own post. # place: The blockhouse
He puts his back to you and takes up the brush again. The gate corporal has heard every word, and he is already walking toward the gate with his stub book in his hand.
-> yard

=== painted ===
~ count_fate = "painted"
You buy a pot of white from the corporal. Ilya does not ask what for. # page # place: The blockhouse
You paint the old number over this morning's wet coat, and it takes a long time, because the wall is rough and the paint is thin.
Ilya watches with his hands behind his back. When you finish he nods once, as to a sentry who has held his post.
Tomorrow he will count the slots, one empty among them, and call the sum right.
The corporal says nothing. He holds the stub book shut.
-> END

=== sold ===
~ count_fate = "sold"
~ give_money(price)
The corporal reads the paper, then drops it in the stove. # page # place: The gate
{ marr_regard == "bought":
  He says the household's steward warned him a friendly driver might come by, and he pays without haggling.
}
He counts {price} M out of his coat. # reveal: all
By noon he has told Ilya that tenants from the orchard edge came for the truck in the night.
Ilya posts a watch on the tenants' path. He paints the wall one number short and says it was thieves.
-> END
