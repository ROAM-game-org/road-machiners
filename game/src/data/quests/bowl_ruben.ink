INCLUDE world.ink

VAR ruben_old = false
VAR ruben_sun = false
VAR ruben_senate = false
VAR ruben_water = false

=== start ===
# checkpoint: start
Sit a while, the shade is free. I am Ruben, and I keep the canal gates. That means I decide which fields drink first, so I'm used to being cursed by people who are only thirsty. What is on your mind?
-> hub

= hub
# checkpoint: start.hub
+ [What is this place?]
  Bowl is a farm built in terraces down the inside of a crater. The canals here still carry water, and water runs downhill, and so do people. Folk came for the canals and stayed for the seed.
  My grandmother kept these same gates before me. She liked to say that a town is only a field that learned to talk.
  ~ ruben_old = true
  -> hub
+ [Who runs Bowl?]
  The canal families do. Every gate has a family that tends it, and every family has a say in the Senate, the council of citizens that decides for all of Bowl. It is a slow way to decide anything, but nobody I know has starved waiting for a quick answer.
  The tenants who work the terraces for the families aren't citizens, so they have no seat. In the last drought, Pierce Corporation offered the Senate a long loan, and the Senate argued over that loan for a whole season.
  ~ ruben_senate = true
  -> hub
+ [Where can I get water, or find work?]
  Water is Hattie's trade. She keeps the cistern house and sells a bucket to anyone with M's. Work is Dag's, because he rides with the <term=farmers>Farmers</term> and knows what hauls are waiting.
  I only open the gates. The water that goes through them belongs to the families, and Bowl's trucks bring it in barrels from <term=dustwell>Dustwell</term>. That's a well outpost up the north road, hours away. They pour it into the canals at the bottom of Bowl, and the families share it out.
  ~ ruben_water = true
  -> hub
+ [What does Bowl make?]
  Sorgut, mostly. Every barrel the trucks bring from <term=dustwell>Dustwell</term> goes through my gates to the terraces, and the terraces give it back three sacks for one.
  The weavers and the clinic need nothing from outside but patience. The machinists' benches eat scrap, and the workshop wants batteries from Nose for its radios. My grandmother called that buying thunder in a box.
  { short_of("water"):
    The canals are low this week. The terraces drink after the houses, so the sorgut comes in thin, and nobody thanks the man at the gate.
  }
  { short_of("scrap"):
    The machinists sit idle for want of scrap, and an idle machinist talks more than a dry canal.
  }
  { short_of("batteries"):
    The workshop is out of batteries, so the radios lie open on the benches like fish on a bank.
  }
  -> hub
+ {ruben_old} [What did your grandmother tell you about the old days?]
  She said the whole basin was orchards in her own grandmother's time, from wall to wall, and the canals ran full in every season. Then the sky fell and the fruit went with it. She never could agree with herself on which came first.
  What fell is what people call the Fallen Sun.
  ~ ruben_sun = true
  -> hub
+ {ruben_sun} [What is the Fallen Sun?]
  People say it was a ship, bigger than all of Bowl. It came down burning and dug a crater out in the basin. Some say it brought the end of the world with it, but I say the end was already here. The ship only added one more bucket to a field that was watered already.
  -> hub
+ {found("fallen-sun")} [What is the Fallen Sun really?]
  So you've stood in that crater, and you know more of it than I do. <term=nose>Nose</term> calls the ship a warship, and Hattie at the cistern house calls it a seed ship that lost its way. I can only tell you that nothing grows near it, and of any place that is the worst thing I know how to say.
  { cult_broken(): Folk go out there after dark again, now the lamps have stopped crossing. | Don't be out there after dark, either. The Sunward cross to it at dusk with their lamps, and I don't know a canal family that would follow them. }
  -> hub
+ {ruben_water || found("dustwell")} [What do you know about Dustwell?]
  In the last dry year the pumps at Green Pit drew mud by noon, and the Senate argued over whose fault that was, as if the pumps had been listening.
  In the Dustwell shed, Wendell Ondra kept the pump book all his life and died at the Green Pit sluice. His niece Agnes keeps the book now, and she writes down every drop.
  -> hub
+ {ruben_senate} [What are the tenants saying?]
  They say they feed Bowl and have no say in it, and they're right. The families never wanted to tell a tenant what to think, only what to plant.
  Jory Baptiste speaks for them on the terraces. He is quick, and I like him, and I vote against him anyway.
  -> hub
+ {ruben_senate} [What came of the Pierce loan?]
  The Senate turned it down. Pierce wanted the canal gates as surety. If a dry year came and we couldn't pay, Pierce would own the water, and the families would be tenants on their own terraces.
  My grandmother would have thrown the man in the canal. The Senate only argued with him for a season, which I suppose is how we throw people now.
  -> hub
+ [Goodbye.]
  -> END
