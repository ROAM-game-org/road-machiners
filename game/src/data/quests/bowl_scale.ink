# view: page
INCLUDE world.ink

VAR asked_pay = false
VAR asked_where = false

=== start ===
# checkpoint: start
Outside the gate, under a lean-to of woven reeds, an iron beam hangs from a post with a flat pan at each end. A scavenger's truck stands at it with the tailgate down, so you pull in behind and wait for him to finish. # place: Bowl gate yard # img: bowl_scale
He's a thin man in a coat patched with seat leather. He swings crates of bent rebar and rusted brackets onto one pan, one at a time. A woman with chalk to the wrists slides an iron weight along the beam until it hangs level.
She writes on a slate, counts M's into his palm and stacks his crates against the wall. He counts the M's again where he stands. Nobody out here trusts a count they didn't make. Then he climbs into his cab and drives off without a word.
The woman wipes her hands on her apron and walks over to your truck. She looks into your bed before she looks at you. # page
Mags Corrin. I weigh for the yard, and I buy anything worth putting on the beam. Let's see what you're hauling. # speaker: Mags
She raps a knuckle on your nearest crate and listens to it, the way people listen to melons.
Bent iron's a gate hinge by the rains. Engine guts go to whoever's truck is coughing. And I don't ask whose truck it came off. # speaker: Mags
-> hub

= hub
+ {not asked_pay} [What does the yard pay?]
  ~ asked_pay = true
  By the crate, never by the story. Iron goes to the canal smiths, and they only want so much in a day. Your tenth crate weighs the same as your first and fetches less. # speaker: Mags
  Bowl's never short of scrap, so my price is Bowl's price. Up the mountain at Nose they've got machines and no fields, and they pay more for iron. It's a long climb for a few M's. # speaker: Mags
  -> hub
+ {not asked_where} [Where did he find his?]
  ~ asked_where = true
  ~ note("orchardIron")
  Off the dead trucks by the roads, before the next driver strips them. A wreck this close to the gate goes bare in a day. # speaker: Mags
  The rest comes from Old Orchard, up the north road. Old barns, and Army sheds nobody's emptied. A Bowl patrol keeps the gate, but nobody shoots a driver over rust. # speaker: Mags
  -> hub
+ [Leave her to her slate.]
  She's chalking the next line before you've turned around.
  Bring me iron before the rains, and the canal gates will thank you for it. They won't, mind. Gates never do. # speaker: Mags
  -> END
