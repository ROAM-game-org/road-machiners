INCLUDE world.ink

VAR ruben_old = false
VAR ruben_sun = false
VAR ruben_senate = false
VAR ruben_loan = false
VAR ruben_water = false

=== start ===
# checkpoint: start
Come sit in the shade, driver, I'm Ruben, and the gates can wait while you catch your breath.
I open a run of the canal gates and decide which fields drink first.
-> hub

= hub
# checkpoint: start.hub
+ [What is this place?]
  This is Bowl, a farm laid in terraces down the inside of an old crater, and the canals still run.
  Folk say the whole basin was orchards once, from the rim to the bottom.
  ~ ruben_old = true
  -> hub
+ [Who runs Bowl?]
  The canal families run Bowl through the <term=senate>Senate</term>.
  It's a slow way to decide anything, but nobody I know has starved waiting.
  ~ ruben_senate = true
  -> hub
+ [Where can I get water, or find work?]
  Hattie keeps the cistern house and sells water to anyone with M.
  For work, ask Dag, who rides with the <term=farmers>Farmers</term> patrol and knows what hauls are waiting.
  ~ ruben_water = true
  -> hub
+ [What does Bowl make?]
  Sorgut, mostly, and for every barrel I let through gates like mine the terraces give back three sacks.
  The weavers and the clinic need nothing from outside.
  The machinists' benches eat scrap, and the workshop wants batteries from <term=nose>Nose</term> for its radios.
  { short_of("water"):
    The canals are low this week, so the houses drink first and the terraces take what's left, and the sorgut comes in thin.
  }
  { short_of("scrap"):
    Our machinists sit idle for want of scrap.
  }
  { short_of("batteries"):
    The workshop is out of batteries, so its radios lie open on the benches, waiting for power the way a dry field waits for its share of water.
  }
  -> hub
+ {ruben_old} [What happened to the orchards?]
  They say this basin was orchards once, then the sky fell and the fruit went with it, though folk still argue which went first.
  What fell is what folk call the Fallen Sun.
  ~ ruben_sun = true
  -> hub
+ {ruben_sun and not found("fallen-sun")} [What is the Fallen Sun?]
  The Fallen Sun was a ship bigger than all of Bowl, folk say, and it came down burning and dug a crater out in the basin.
  -> hub
+ {found("fallen-sun")} [What is the Fallen Sun really?]
  <term=nose>Nose</term> calls the ship a warship, and Hattie at the cistern house calls it a seed ship that lost its way.
  Nothing grows near it, and I know no worse thing to say of a place.
  { cult_broken(): Folk go out there after dark again, now the lamps have stopped crossing. | Stay away from it after dark, though, since the Sunward cross to it at dusk with their lamps, and no family along these canals would follow them. }
  -> hub
+ {ruben_water || found("dustwell")} [What do you know about Dustwell?]
  <term=dustwell>Dustwell</term> is a well outpost up the north road, and the water trucks bring Bowl's water from there.
  Agnes Ondra keeps the pump in the Dustwell shed now, the one her uncle Wendell kept until he died at the Green Pit sluice.
  -> hub
+ {ruben_senate} [Does everyone in Bowl get a vote?]
  Only citizens vote.
  The tenants who work the terraces have no vote, but Jory Baptiste speaks for them.
  I like Jory Baptiste, and I vote against him all the same.
  -> hub
+ {ruben_senate} [How slow is the Senate?]
  Slow enough that in the last drought <term=pierce>Pierce</term> Corporation offered the Senate a long loan.
  They argued over it for a whole season.
  ~ ruben_loan = true
  -> hub
+ {ruben_loan} [What came of the Pierce loan?]
  The Senate turned it down.
  Pierce wanted the canal gates as surety, and whoever holds the gates decides which fields drink first.
  If a dry year left Bowl unable to pay, Pierce would own the water.
  -> hub
+ [Goodbye.]
  -> END
