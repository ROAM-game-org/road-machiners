INCLUDE world.ink

VAR heard_picked = false
VAR asked_picked = false
VAR heard_book = false
VAR asked_book = false
VAR heard_pguns = false
VAR asked_pguns = false
VAR heard_water = false
VAR asked_water = false
VAR heard_kiln = false
VAR asked_kiln = false
VAR heard_rider = false
VAR asked_rider = false
VAR heard_post = false
VAR asked_post = false
VAR sefa_priced = false

=== function pin_price() ===
{ wagon_pin == "held":
  ~ return 30
}
~ return 15

=== start ===
# checkpoint: start
Sefa Krol. I trade for the families off the Burnt Convoy. Show me what you carry and I'll tell you what it's worth. Keep your hand off my table.
-> hub

= hub
# checkpoint: start.hub
+ [Who are the families of the Burnt Convoy?]
  People who lived in the burnt trucks on the road. The road crews cleared the wrecks a while ago, so we moved here, to the north side of the Yard. We're not a camp. A camp has a flag and a man who wants to be called sir. We're first to any wreck and last to leave it. That's all we are. Men on the air say there's nothing left out there to pick. They're welcome to think so.
  ~ heard_picked = true
  -> hub
+ [What do you sell here?]
  What the road is done with. Wiring, wheel rims, a gun with its pin broken. Anything with a second life in it, if you're not too proud to give it one. I buy too, so put what you carry on the table. Keep your hand off it. Years ago we sold the <term=salvage_yard>Yard</term> a book we took off a <term=pierce>Pierce</term> truck, and people still ask me about it.
  ~ heard_book = true
  -> hub
+ [What is the road like out here?]
  Dry. Every driver sits with his water between his feet. I make a point of never taking the last of it from anyone, and you can ask me why. The Kiln riders from the camp in the south mostly leave us alone. You can ask me about that too.
  ~ heard_water = true
  ~ heard_kiln = true
  -> hub
+ [What does the Yard turn out?]
  Scrap and parts. The crews cut down the stacks under the crane, two crates of scrap for every crate of parts worth keeping.
  The cutting eats tools. The tools come from Nose, and Nose wants our scrap to make them. That's all we are, a circle with a crane in it.
  { works_down():
    The crane's down. Nothing comes off the stacks until it swings again, and the crews sit on my beans.
  }
  { short_of("tools"):
    The crews are out of tools. They cut with what's left, which is slow, and my mother says loud.
  }
  -> hub
+ [Who runs this yard?]
  The repair crews, since they stopped answering to Pierce. The Administrator keeps them in line. Nose put an Army post inside the gate afterward. We keep to the north side of the yard, where soldiers don't like the wind.
  ~ heard_post = true
  -> hub
+ {(heard_picked or has_note("burntConvoy")) and not asked_picked} [Is the Burnt Convoy picked clean?]
  No. We pick that road every week and the road leaves more. Rust grows new things. Old Ibo, the radio man at Nose, says otherwise on the air, to men who wouldn't drive out there for a gift. Good. Let him.
  ~ note("talkConvoyNotClean")
  ~ asked_picked = true
  -> hub
+ {heard_book and not asked_book} [What was the book you sold the Yard?]
  A debtor book. We stopped a Pierce office truck on the road and took it off the seat. Pierce lends to the towns and insures the trucks, so that's a big name to cross. It was page after page of names and sums. I can't read the sums. The zeroes go on too long. The Yard could read them, so I sold it to them. What it says isn't for sale, and what the Yard does with it isn't my business. The crane office has a shut door now. A shut door is a loud thing.
  ~ note("talkCraneBook")
  ~ asked_book = true
  ~ heard_pguns = true
  -> hub
+ {heard_pguns and not asked_pguns} [What else do you hear about Pierce?]
  That Pierce sold the <term=old_army>Old Army</term>'s guns north to <term=scrapjaw>Scrapjaw</term>, then made every driver buy a gun to get paper. I hear it from two drivers who each swear the other one lied. It's good business, if it's true. A man who sells the fire and the bucket never starves.
  ~ note("talkPierceGuns")
  ~ asked_pguns = true
  -> hub
+ {heard_water and not asked_water} [Why do you never take the last water?]
  A man with no water is a body, and a body is trouble. Leave him his water and he's a fool who walks on. Fools talk less than bodies. Also, my mother would find out. She finds out everything.
  ~ asked_water = true
  -> hub
+ {heard_kiln and not asked_kiln} [Why do the Kiln riders leave you alone?]
  We have a deal. Kiln has a man named Kaplan who knows a fair split. What the riders leave on the road is ours. What we find of their dead, we bury with their boots on. Nobody on either side likes it, which is how you know it works. Anyone who comes to our tables with nothing gets beans and no questions. That goes for a rider as much as a driver.
  ~ asked_kiln = true
  ~ heard_rider = true
  -> hub
+ {heard_rider and not asked_rider} [Has a rider ever come to you with nothing?]
  Once. His brother died in the road. He ate our beans for a long time and said little, and then he went south. I won't say his name. It would be rude to the beans.
  ~ asked_rider = true
  -> hub
+ {heard_post and not asked_post} [What do you make of the Army post?]
  I don't trust it. The soldier at the gate writes down who comes and goes through the gate, and she writes it twice. A soldier who writes twice is afraid of something.
  ~ asked_post = true
  -> hub
+ {wagon_pin != "none" and wagon_fate == "none" and not sefa_priced} [I've got the pin from wagon Seven's ring.]
  ~ sefa_priced = true
  { wagon_watched:
    I know. My children watched you crawl round my hollow all afternoon. You found my cut chain, I expect. My men found that ring was bent and went home for a torch.
  - else:
    That hollow is ours. My children found her ruts the week she went quiet. My men cut the chain on that cannon and found the gun too heavy to lift by hand, and they went home for a torch.
  }
  A broken Nose pin is worth more than a whole one. The Yard bores second pins into Nose mounts for a fee, and a pin that sheared on an Army wagon sells a great many second pins. That's all we are.
  { wagon_pin == "bent":
    You beat the face off it, so I'm paying for the place more than the steel.
  }
  She names a price for the stub and your word on where it lies: {pin_price()} M. A good deal is one nobody likes.
  -> hub
+ {sefa_priced and wagon_fate == "none"} [Sell her the stub and the place.]
  ~ wagon_fate = "sold"
  ~ give_money(pin_price())
  She counts the M's onto the table and sweeps the stub off it into her apron, all in one move. # page
  The Yard's crane men will hang that stub on a wire by the boring bench. Every Nose driver who stops for a second pin will see it. After the frost my men take the torch to whatever's left on her.
  The Army post will ask whose steel it was. They'll have to ask me, and I'll tell them raiders.
  -> hub
+ [Goodbye.]
  -> END
