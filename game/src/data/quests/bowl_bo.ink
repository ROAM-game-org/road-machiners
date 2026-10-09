INCLUDE world.ink

VAR bo_fight = false
VAR bo_roll = false

=== start ===
# checkpoint: start
I am Bo Lindqvist. I drive a Granary truck on the Bowl road patrol. Sit down if you like. Most people who sit here have come to hear about a fight on the road, and I'll tell it once, if you want it.
-> hub

= hub
# checkpoint: start.hub
+ [What fight on the road?]
  The Vosk brothers had been stopping trucks on the Nose road for a long while. They always seemed to know which ones to stop. We carried a Brann swivel, a gun ring that swings across the truck bed, and I had never fired at a man.
  They came out of the wreck rows near the Burnt Convoy, the field of burned trucks beside the road. I swung the ring and I fired, and Jens went down in the road. I stopped the truck and went back to him, but he was already gone.
  ~ bo_fight = true
  -> hub
+ [What is the road patrol?]
  I drive with it, and I count my years on its roll the way some men count debts. The roll is the list of drivers who guard the roads near Bowl. A tenant like me has no vote until he's served on it for a decade, so I've still got years to go.
  ~ bo_roll = true
  -> hub
+ {bo_fight} [Do you call yourself a killer?]
  I do, whatever the hall says. The tenant hall, where the tenants meet, sat on it and decided that a tenant who defends his load isn't a killer. They were kind about it.
  I sat quiet while they said it. The hall can say what it likes, but I know what my hand did.
  -> hub
+ {bo_roll} [Why did you sign the patrol roll?]
  For the vote, mostly, but I'd be lying if I said it was only that. A man on the road with a rifle should be a man who's thought about it. I've thought about it every night since that day.
  -> hub
+ {bo_fight} [What is a Brann swivel?]
  It's a ring of hull plate that swings across the truck bed and locks with a pin. I think about ours most nights. Otto Brann of Ridge Wrecks made it, and after that day he came and put a second pin on every swivel he'd made. He didn't say why, and he didn't need to.
  -> hub
+ {bo_fight} [Where is Jens buried?]
  Brother Anselm, who buried the dead of that road, put him in the ground by Canyon Bridge. It's across the road from Hal Sorensen, who died of the same trouble years before. Anselm lies there too now, between them.
  Lusa Fenwick reads their names at the bridge once a year. I go, and I stay for all of it.
  -> hub
+ {bo_fight} [What became of Jens's brother?]
  He was never caught. Some say he hid among the squatters at the Burnt Convoy, and some say he rides for the raiders at Kiln Camp. I don't ask.
  If he came to my truck I'd give him the grain, and I'd give him water. I'd give him anything that bought Jens his life back.
  -> hub
+ [Goodbye.]
  -> END
