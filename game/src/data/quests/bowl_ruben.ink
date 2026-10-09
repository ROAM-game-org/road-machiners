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
  The tenants who work the terraces for the families aren't citizens, so they have no seat. In the last drought, Pierce Corporation offered the Senate a long loan of grain. Pierce insures trucks and lends money, and the Senate argued over that loan for a whole season.
  ~ ruben_senate = true
  -> hub
+ [Where can I get water, or find work?]
  Water is Hattie's trade. She keeps the well house and sells a bucket to anyone with coin. Work is Dag's, because he rides with the Farmers and knows what hauls are waiting.
  I only open the gates. The water that goes through them belongs to the families, and it comes down a feeder channel from Green Pit. That's a pump outpost out on the flat. Their pumps pull water up from deep rock, and what they don't sell by the can runs down to us.
  ~ ruben_water = true
  -> hub
+ {ruben_old} [What did your grandmother tell you about the old days?]
  She said the whole basin was orchards in her time, from wall to wall, and the canals ran full in every season. Then the sky fell and the fruit went with it. She never could agree with herself on which came first.
  What fell is what people call the Fallen Sun.
  ~ ruben_sun = true
  -> hub
+ {ruben_sun} [What is the Fallen Sun?]
  People say it was a ship, bigger than all of Bowl. It came down burning and dug a crater out in the basin. Some say it brought the end of the world with it, but I say the end was already here. The ship only added one more bucket to a field that was flooded already.
  -> hub
+ {found("fallen-sun")} [What is the Fallen Sun really?]
  So you've stood in that crater, and you know more of it than I do. Nose calls the ship a warship, and Hattie at the well house calls it a seed ship that lost its way. I can only tell you that nothing grows near it, and of any place that is the worst thing I know how to say.
  -> hub
+ {ruben_water || found("green-pit")} [What do you know about the Green Pit feeder?]
  In a dry year the Senate hung a meter on it and claimed a share for Bowl, as if the feeder had ever been ours to measure. That year the pumps at Green Pit drew mud by noon, and nobody asked the pumps what they thought.
  Wendell Ondra died at the sluice there, the little gate where the feeder lets its water in. His niece Agnes keeps the book at the Pump Station, and she writes down every drop.
  -> hub
+ {ruben_senate} [What are the tenants saying?]
  They say they feed Bowl and have no say in it, and they're right. The families never wanted to tell a tenant what to think, only what to plant.
  Jory Baptiste speaks for them on the terraces. He is quick, and I like him, and I vote against him anyway.
  -> hub
+ {ruben_senate} [Why did the Senate refuse the loan from Pierce?]
  Because Pierce wanted the canal gates as surety. If a dry year came and we couldn't pay, Pierce would own the water, and the families would be tenants on their own terraces.
  My grandmother would have thrown the man in the canal. The Senate only argued with him for a season, which I suppose is how we throw people now.
  -> hub
+ [Goodbye.]
  -> END
