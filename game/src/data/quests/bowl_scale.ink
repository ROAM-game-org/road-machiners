# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_where = false
VAR asked_army = false

=== start ===
# checkpoint: start
Just inside the gate is the yard: a lean-to of woven reeds, and under it an iron beam hanging from a post, with a flat pan at each end. A scavenger's truck stands at the beam, so you stop outside the gate and watch. # place: Bowl gate yard # img: bowl_scale
The scavenger is a thin man in a coat patched with seat leather. He swings crates of bent rebar and rusted brackets onto one pan, one at a time. A woman with chalk to the wrists stacks iron weights on the other pan until the beam hangs level.
She writes on a slate, counts M's into his palm and stacks his crates by the wall. He counts the M's again where he stands. Nobody out here trusts a count they didn't make. Then he drives out past you with a lighter truck and a heavier pocket.
The woman wipes her hands on her apron and walks out through the gate to your truck. She looks into your bed before she looks at you. Fair enough. The crates are the interesting part. # page
Mags Corrin. I weigh for the yard, and I buy anything worth putting on the beam. Let's hear what you're hauling. # speaker: Mags
She raps a knuckle on your nearest crate and listens to it, the way people listen to melons.
Bent iron goes to the canal smiths. The rains rust the sluice hinges through every year, and every new hinge starts as a crate on my beam. # speaker: Mags
Engine guts go to whoever's truck is coughing. And I don't ask whose truck any of it came off. # speaker: Mags
-> hub

= hub
+ {not asked_pay} [What does the yard pay?]
  ~ asked_pay = true
  By weight, never by the story. Today's price is chalked on my board by the beam. Read it before you unload, and argue with the chalk, not with me. # speaker: Mags
  The smiths only want so much iron a day, so every crate I take fetches a little less than the one before. # speaker: Mags
  Bowl's never short of scrap, so my price is Bowl's price. Up the mountain at Nose they've got machines and no fields, and they pay more for iron. It's a long climb for a few M's. # speaker: Mags
  -> hub
+ {not asked_where} [Where do they find iron like that?]
  ~ asked_where = true
  ~ note("orchardIron")
  Off the dead trucks by the roads, before the next driver strips them. A wreck this close to the gate goes bare in a day. # speaker: Mags
  The ones who come in heavy say Old Orchard, up the north road. Old barns, and Army sheds nobody's emptied. A Bowl patrol keeps the Orchard gate, and the patrol lets scavengers through. Nobody there shoots a driver over scrap. # speaker: Mags
  -> hub
+ {asked_where and not asked_army} [Why would the Army leave it?]
  ~ asked_army = true
  The <term=old_army>Old Army</term>? One spring the cook fires at the Orchard went out, and nobody lit them again. # speaker: Mags
  Why it went, ask the old soldiers. They'll talk all night and never say. I weigh what they left, and it weighs the same either way. # speaker: Mags
  -> hub
+ [Leave her to her beam.]
  She's back under the lean-to before you've turned around. Behind you, the next truck is already grinding up to the gate with its bed full.
  -> END
