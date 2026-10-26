INCLUDE world.ink

=== start ===
# checkpoint: start
<term=dustwell>Dustwell</term> is a small square of rusted corrugated walls round a pumpjack that nods over the well. It smells of hot iron and wet stone. Pipes run from the well to the tall tanks.
A woman in a canvas apron stands at a row of dials and copies each number into a book.
Water's in the tank by the lean-to drums. # speaker: Agnes
-> hub

= hub
# checkpoint: start.hub
+ [Ask what Dustwell sends out.]
  Water, from deep rock. The pumpjack brings it up, and the trucks carry it down to <term=bowl>Bowl</term>'s canals and to the <term=granary>Granary</term>. # speaker: Agnes
  The pumpjack wears out tools. <term=nose>Nose</term> makes them, and somebody has to bring them up the road. # speaker: Agnes
  { works_down():
    The pump's broken down. # speaker: Agnes
  }
  { short_of("tools"):
    I'm out of tools. One more stripped bolt and the pump runs at half. # speaker: Agnes
  }
  -> hub
+ [Fill your tank and go.]
  -> END
