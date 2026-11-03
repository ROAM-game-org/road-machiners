INCLUDE world.ink

VAR asked_buyers = false

=== start ===
# checkpoint: start
Hollis Brennan. I boss a still crew at the <term=pump_station>Pump Station</term>. Our drums are stacked by the gate if you're buying. If you've got tools or batteries, I'm buying.
-> hub

= hub
# checkpoint: start.hub
+ [What does the Pump Station make?]
  Diesel, in drums. The pumpjack lifts crude off an Old World well, and the stills cook it down.
  The pump shakes itself loose all day, and every fix costs a wrench or a file. Its motor runs on batteries from <term=nose>Nose</term>. With weak batteries or nothing to mend it, it limps along at half speed. Half speed is half the drums.
  { works_down():
    The pumps are down right now. Every drum by the gate is what's left until they turn again.
  }
  { short_of("tools"):
    My crew's out of tools. The next bolt that shakes loose stays loose, and the pumps run slow.
  }
  { short_of("batteries"):
    The batteries are flat, the last of them. The motors cough more than they turn.
  }
  -> hub
+ {not asked_buyers} [Who buys the drums?]
  ~ asked_buyers = true
  The convoys load here and run them out to Nose and <term=bowl>Bowl</term>, and every outpost that sells fuel buys some.
  Nose burns my diesel in its forge and in the shop where it makes batteries. The tools and batteries I need come out of those fires, so the same convoys bring them back.
  -> hub
+ [Goodbye.]
  Mind the drums on the way out. They're full.
  -> END
