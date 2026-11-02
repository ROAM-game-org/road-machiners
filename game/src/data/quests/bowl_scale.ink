# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_where = false
VAR asked_army = false

=== start ===
# checkpoint: start
Just inside the gate is the yard: a lean-to of woven reeds, and under it an iron beam hanging from a post, with a flat pan at each end. A scavenger's truck stands at the beam, so you stop outside the gate and watch. # place: Bowl gate yard # img: bowl_scale
The scavenger is a thin man in a coat patched with seat leather. He swings crates of bent rebar and rusted brackets onto one pan, one at a time. A woman with rust to the wrists stacks iron weights on the other pan until the beam hangs level.
She puts M's into his palm and stacks his crates by the wall. He tucks them inside his coat without a word. Then he drives out past you, his truck riding high on its springs.
The woman wipes her hands on her apron and walks out through the gate to your truck. She looks into your bed before she looks at you. Fair enough. The crates are the interesting part. # page
Heavy bed. I'm Mags. Bring it to my beam and I'll weigh it, then I'll buy it. # speaker: Mags
She raps a knuckle on your nearest crate and listens to the ring.
That bent iron's good weight. # speaker: Mags
Engine guts weigh heavy. They go to whoever's truck is coughing. I don't ask whose truck they came off. # speaker: Mags
-> hub

= hub
+ {not asked_pay} [What does the yard pay?]
  ~ asked_pay = true
  By weight. The price is chalked on the board by the beam. Read it before you unload, and argue with the chalk, not with me. # speaker: Mags
  Each crate fetches a little less than the one before. The machinists can only turn so much iron into parts in a day. # speaker: Mags
  My price is Bowl's price. # speaker: Mags
  -> hub
+ {not asked_where} [Where do they find iron like that?]
  ~ asked_where = true
  ~ note("orchardIron")
  Off dead trucks by the roads. A wreck near the gate is stripped bare in a day. # speaker: Mags
  The ones who come in heavy say Old Orchard, up the north road. Old barns, and Army sheds nobody's emptied. # speaker: Mags
  A Bowl patrol keeps the Orchard gate. It lets scavengers through. # speaker: Mags
  -> hub
+ {asked_where and not asked_army} [Why would the Army leave it?]
  ~ asked_army = true
  The <term=old_army>Old Army</term>? The cook fires at the Orchard went out one spring. Nobody lit them again. # speaker: Mags
  Why they left, I can't say. The old soldiers talk all night and never say. I weigh what they left. # speaker: Mags
  -> hub
+ [Leave her to her beam.]
  She's back under the lean-to before you've turned around. Behind you, the next truck is already grinding up to the gate with its bed full.
  -> END
