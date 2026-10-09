INCLUDE world.ink

VAR driver_haul = false
VAR driver_road = false

=== start ===
# checkpoint: start
Bowl road patrol, grain run. Talk if you like, friend, but I'm checking pins while you do. Don't take it personal if I'm looking at the truck and not at you.
-> hub

= hub
# checkpoint: start.hub
+ [What do you haul?]
  Grain, from the Granary to wherever the Senate points me. I'm late with this load because a pin on my ring was loose. A pair of steel pins holds the ring to the bed, and I've seen what one pin does on a bend. So I check both at every stop, and I'll check yours too if you let me.
  Every crossing of Kiln Camp's road costs the Granary a sack, so I keep my load tight. A sack's cheaper than a truck, I tell myself. Odile Marsh, the steward, chalks every sack on the gate at night.
  ~ driver_haul = true
  -> hub
+ [What is the road like out here?]
  Empty, once you're between the towns. Each town guards the road by its own walls, and Nose won't pay for a guard on the rest. Every truck's its own patrol, and I'd sleep better with somebody else on the road.
  The Old Army kept the whole road once, before my time. And I hear folk past the canyon do it differently, but I've only heard it.
  ~ driver_road = true
  -> hub
+ {driver_haul} [What is on the Granary gate?]
  Odile's counts, and I've watched her chalk them. One board holds the sacks we pay Kiln. The one beside it holds the tenants' share that pays for the patrol. She was a tenant herself, and some of us still call her a turncoat behind her back.
  She counts every sack twice, at night, and she doesn't blink.
  -> hub
+ {driver_haul} [Do you trust Kiln?]
  I trust them to act like Kiln. If you pay, they let you through. If you fight hard they often let you through anyway, and if you do neither they strip the truck down to the frame.
  -> hub
+ {driver_haul} [What are the tenants like on the patrol?]
  Good drivers. They sit at the back of the hall and don't complain, and I've seen worse men with a vote.
  -> hub
+ {driver_road} [What became of the Old Army?]
  It ended and left hungry soldiers behind. My uncle was in it. He told me how soldiers came to the gate of Old Orchard, its depot, at night and were turned away. Some of them are on my crew, and I'll say this for hungry soldiers, they make fine drivers.
  -> hub
+ {driver_road} [What do they do differently past the canyon?]
  The tale is that trucks there carry no guns, because a guard every town pays for keeps the roads. Lusa Fenwick rode west with a convoy once, and she came back telling it. She's a dreamer.
  I haven't been west, and neither has anyone who swears to it.
  ~ note("talkWestTowns")
  -> hub
+ [Goodbye.]
  -> END
