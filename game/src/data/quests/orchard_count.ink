# view: page
# stat: money Money
# fact: wall_read Blockhouse wall: coats of paint, one number over another. This morning's number is one short of the last.
# fact: gap_seen Motor pool: an empty slot at the end of the third row. The chocks are still in place and the ground under it is swept.
# fact: ilya_said Ilya: the gate was shut all night and he slept in the blockhouse. He has counted every dawn and never been wrong.
# fact: stub_read Gate stub book: at dusk a Pierce cart passed the gate with a release paper for one truck.
# fact: release_read Release paper: the Pierce lien number matches the one on the chocks of the empty slot. The seal of the Archon's household is on it.
INCLUDE world.ink

VAR wall_read = false
VAR gap_seen = false
VAR ilya_said = false
VAR stub_read = false
VAR release_read = false
VAR paint = 10
VAR price = 70

=== start ===
# checkpoint: start
Old Orchard has a gate and nothing behind it but rows of trucks. # place: Old Orchard
They stand where the Army left them, nose to tail, their canvas gone grey. A Bowl patrolman watches the gate.
A man in a patrol coat stands in front of the blockhouse with a paint pot in one hand. His back is very straight. He has not moved since you came through the gate.
-> yard

=== yard ===
# checkpoint: yard
The motor pool is quiet. Dust lies on every cab. # page # place: Old Orchard
+ {not wall_read} [Read the blockhouse wall.]
  -> wall
+ {not gap_seen} [Walk the rows of trucks.]
  -> gap
+ {not ilya_said} [Ask Ilya what happened.]
  -> ilya
+ {gap_seen and not stub_read} [Ask the gate corporal for his stub book.]
  -> stub
+ {stub_read and not release_read} [Read the release paper.]
  -> release
+ {release_read} [Show Ilya the paper.]
  -> told
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
You walk the rows. Each truck has a number painted on its door, in the same hand. # place: The motor pool
At the end of the third row stands an empty slot. The chocks still lie in the dust where the wheels were, a number stenciled on each.
The ground under it has been swept. Nobody sweeps here.
-> yard

=== ilya ===
~ ilya_said = true
Ilya Moreno does not lower the brush. # place: The blockhouse
Those trucks are the army. I am still on duty. # speaker: Ilya
The gate was shut all night. I slept in the blockhouse. I count at dawn and I have never been wrong. # speaker: Ilya
This morning I counted again, and again, and again. The sum did not change. # speaker: Ilya
-> yard

=== stub ===
~ stub_read = true
~ note("countGap")
The gate corporal keeps a stub book in his coat. He gives it up the way a man gives up a tooth. # place: The gate
At dusk a Pierce cart came through with a paper. A clerk sat on the tailboard. The patrol let it pass.
It was in order. I never read it close. Ilya was at his supper. # speaker: Corporal
-> yard

=== release ===
~ release_read = true
~ note("countRelease")
The corporal keeps a flimsy copy of every paper. He lets you hold this one. # place: The gate
Truck; Lien; Released to; Sealed by # head
End of third row; 2207; Pierce cart; Household of the Archon # row
The seal at the foot is a Marr seal. The lien number matches the one stenciled on the chocks.
-> yard

=== told ===
~ count_fate = "told"
~ note("countLog")
Ilya reads the paper once. He reads the seal twice. # page # place: The blockhouse
He sets the paint pot on the step and sits beside it.
An army does not sell its own trucks. A household does. # speaker: Ilya
He does not paint a new number. He opens a book from the blockhouse shelf and tears out a page.
Quarter; Nose fuel owed to the Army; Marked in the book # head
First; due; held # row
Second; due; held # row
Third; due; held # row
Keep it. I counted trucks. I should have counted this. # speaker: Ilya
The wall says one number now. Ilya stays on duty. # reveal: all
-> END

=== painted ===
~ count_fate = "painted"
You buy a pot of white from the corporal. Ilya does not ask what for. # page # place: The blockhouse
You paint the old number over this morning's wet coat. It takes a long time.
Ilya watches with his hands behind his back. When you finish he nods once, as to a sentry who has held his post.
Tomorrow he will count the slots, one empty among them, and call the sum right.
The corporal says nothing. He holds the stub book shut.
-> END

=== sold ===
~ count_fate = "sold"
~ give_money(price)
The corporal reads the paper, then drops it in the stove. # page # place: The gate
He counts <b>{price} M</b> out of his coat. # reveal: all
By noon he has told Ilya that tenants from the orchard edge came for the truck in the night.
Ilya posts a watch on the tenants' path. He paints the wall one number short and says it was thieves.
-> END
