INCLUDE world.ink

VAR petra_book = false
VAR petra_cost = false
VAR petra_buyoff = false
VAR petra_riders = false
VAR petra_raiders = false

=== start ===
# checkpoint: start
Welcome inside the fence, driver. I'm Petra Quell, keeper of the mast.
The hour your truck came over the rise is in my log. What the mast hears is for sale.
-> hub

= hub
# checkpoint: start.hub
+ {not petra_book} [How does a wrong get into the book?]
  The day you see a wrong, park here or at a town pad and say what you saw while it's fresh.
  Wim Satterly writes down the claim, the witnesses and the price.
  ~ petra_book = true
  ~ note("roadhouseBook")
  -> hub
+ {petra_book and not petra_cost} [What does a case cost?]
  Wim sets the price by the wrong, and the man who did it pays.
  The Roadhouse takes a cut of every case that closes.
  ~ petra_cost = true
  -> hub
+ {petra_cost and not petra_buyoff} [Can I get back into a town's good graces?]
  Yes, the Roadhouse can pay a town's price to take your name off its post.
  You pay it at Wim's counter, and he handles the rest.
  ~ petra_buyoff = true
  ~ note("roadhouseBuyOff")
  -> hub
+ {not petra_riders} [Who rides for the book?]
  Rook Halloran and the Lincolns ride for the <term=road_book>book</term>, two cars at a time.
  Sabra Kell rides the Kiln claims on her own fee, since no Roadhouse car does.
  ~ petra_riders = true
  -> hub
+ {petra_riders and not petra_raiders} [Why take nothing against a raider?]
  A raider has no town to buy him off and nothing a hearing can hold him to.
  I write that wrong down as unanswered. I never close it.
  ~ petra_raiders = true
  ~ note("roadhouseRaiders")
  -> hub
+ [What does the plain say?]
  Bowl and Nose keep their patrols by their own gates. Nobody watches the stretch between, so the Roadhouse posts two daylight crossings.
  Kiln riders work the south road and take a fee from haulers who pay. Scrapjaw riders work the north.
  { cult_broken():
    At dusk the Sunward lamps stopped crossing. I haven't written one down since.
  - else:
    At dusk the Sunward lamps still cross the open ground, and I write each one down.
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
