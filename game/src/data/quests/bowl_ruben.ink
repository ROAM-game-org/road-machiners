INCLUDE world.ink

=== start ===
# checkpoint: start
Sit a while, the shade is free. I am Ruben. I keep the canal gates. What is on your mind?
-> hub

= hub
# checkpoint: start.hub
+ [What is this place?]
  Bowl sits at the low end of the basin, where the old canals still carry water. Water runs downhill, and so do people. Folk came for the canals and stayed for the seed.
  -> hub
+ [Who runs Bowl?]
  The canal families. Every gate has a family, and every family has a say. It is a slow way to decide things, but nobody ever starved waiting on a quick answer. The Farmers keep the roads for us.
  -> hub
+ [Tell me about the Old World.]
  My grandmother said the whole basin was orchards, wall to wall, and the canals ran full in every season. Then the sky fell and the fruit went with it. She never could agree with herself on which came first.
  -> hub
+ [What about the Fallen Sun?]
  A ship, they say, bigger than Bowl. It came down <color=rust>burning</color> and dug that crater. Some say it brought the end with it. I say the end was already here, and the ship just landed on top of it.
  -> hub
+ {found("fallen-sun")} [What is the Fallen Sun really?]
  You have stood in that crater, then. You tell me. Nose calls it a warship. Hattie calls it a seed ship that lost its way. I only know <i>nothing grows near it</i>, and that is the worst thing I can say of any place.
  -> hub
+ [What of the Green Pit feeder?]
  A dry year came and the Senate hung a meter on it. A share for Bowl, they said. The feeder was never ours to meter. The Green Pit well dropped a hand's width that year, and nobody asked the well.
  Wendell Ondra died at the sluice there. His niece Agnes keeps the Pump Station book now, and she writes down every drop.
  -> hub
+ [What are the tenants saying?]
  That they feed us and have no say. They are right. The families never wanted to tell a tenant what to think, only what to plant.
  Jory Baptiste speaks for them on the terraces. He is quick. I like him, and I vote against him anyway.
  -> hub
+ [Why did Bowl refuse the Pierce loan?]
  The Senate would not sign. A long loan of grain in a drought is enough debt for one lifetime. Pierce pays our crews late now, to teach us manners.
  Some say the Senate should have signed. Some say the Senate should have signed long ago. Those are the same ones.
  -> hub
+ [Goodbye.]
  -> END
