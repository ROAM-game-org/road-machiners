INCLUDE world.ink

VAR petra_book = false
VAR petra_how = false
VAR petra_cost = false
VAR petra_buyoff = false
VAR petra_riders = false
VAR petra_raiders = false

=== start ===
# checkpoint: start
Welcome to the Roadhouse, driver. I'm Petra Quell, keeper of the mast.
I wrote your truck down, with the hour, when it came over the rise. What the mast hears is for sale.
Wim Satterly keeps the <term=road_book>road book</term> in the other hut.
-> hub

= hub
# checkpoint: start.hub
+ {not petra_book} [What is the road book?]
  Every wrong done on the road goes in Wim's book.
  Each page has the claim, the witnesses and the price, all in Wim's hand.
  ~ petra_book = true
  -> hub
+ {petra_book and not petra_how} [How do I put a wrong in the book?]
  Park here or at a town pad and tell what you saw while it's fresh.
  ~ petra_how = true
  ~ note("roadhouseBook")
  -> hub
+ {petra_how and not petra_cost} [Who pays the price?]
  Whoever did the wrong pays what Wim sets.
  The Roadhouse takes a cut of every case that closes.
  ~ petra_cost = true
  -> hub
+ {petra_cost and not petra_buyoff} [What if a town is after me?]
  A town's grudge has a price, and the Roadhouse can pay the town to settle it.
  You pay the Roadhouse at Wim's counter.
  ~ petra_buyoff = true
  ~ note("roadhouseBuyOff")
  -> hub
+ {not petra_riders} [Who goes after the wrongdoers?]
  Rook Halloran's <term=marshals>Marshalls</term> ride after them, two Lincolns at a time.
  Out on the road, they ask drivers where they last saw the one named in the book.
  ~ petra_riders = true
  -> hub
+ {petra_riders and not petra_raiders} [Why no claims against raiders?]
  A raider has no town behind them, so there's nothing a claim can make them pay.
  The book marks a raider's wrong unanswered and leaves it open.
  Sabra Kell rides out after the unanswered Kiln ones on her own fee, since no Roadhouse car will.
  ~ petra_raiders = true
  ~ note("roadhouseRaiders")
  -> hub
+ [What does the plain say?]
  <term=bowl>Bowl</term> and <term=nose>Nose</term> keep their patrols by their own gates, so Roadhouse cars cross the unwatched plain between them twice a day while it's light.
  <term=kiln>Kiln</term> riders work the south road and take a fee from haulers who pay. <term=scrapjaw>Scrapjaw</term> riders work the north.
  { cult_broken():
    At dusk the <term=sunward>Sunward</term> lamps stopped crossing. I haven't written one down since.
  - else:
    At dusk the <term=sunward>Sunward</term> lamps still cross the open ground, and I write each one down.
  }
  -> hub
+ {holds_search()} [I'm looking for a driver.]
  { marshal_lead():
    -> lead
  }
  Since you last had word of that driver, no <term=marshals>Marshall</term> car has seen them. I take nothing for saying so.
  -> hub
+ [Leave her to the mast.]
  Goodbye, driver. I'll be at the mast if you need me.
  -> END

= lead
Since you last had word of that driver, a <term=marshals>Marshall</term> car has seen them. I heard the report on the mast.
For a fee, I'll tell you where the car saw them.
+ [Pay her {lead_price()} M. # cost: {lead_price()}]
  ~ take_marshal_lead()
  The word is sent. Go and look where the car saw them.
  -> hub
+ [Not at that price.]
  The mast will hear the same tomorrow, and my offer stands.
  -> hub
