INCLUDE world.ink

=== start ===
# checkpoint: start
Sefa Krol. I trade for the families of the Burnt Convoy. Show me what you carry and I will tell you what it is worth. Keep your hand off my table.
-> hub

= hub
# checkpoint: start.hub
+ [Who are the families of the Burnt Convoy?]
  People who live where the road stopped. We are not a camp. A camp has a flag and a man who wants to be called sir.
  We are first to any wreck, and last to leave it. That is all we are.
  -> hub
+ [What do you sell here?]
  What the road is done with. Wiring, wheel rims, a gun with no pin. Things that have a second life if you are not proud.
  -> hub
+ [Why do you never take the last water?]
  A man with no water is a body, and a body is trouble. Leave him his water and he is a fool who walks on. Fools talk less than bodies.
  Also, my mother would find out. She finds out everything.
  -> hub
+ [Is the Burnt Convoy picked clean?]
  Who says that? Ibo says it, on the air, to men who would not drive out there for a gift. Good. Let him.
  We pick it every week and the road leaves more. Rust grows new things. Ask any family.
  ~ note("talkConvoyNotClean")
  -> hub
+ [What is it with the debtor book?]
  We stopped a Pierce office truck on the road and took a book off the seat. Page after page of names and sums. Sums I cannot read, the zeroes go on so long.
  The Yard could read them. I sold it to them. What it says is not for sale, and what the Yard does with it is not my business.
  A crane office has a shut door now, and a shut door is a loud thing.
  ~ note("talkCraneBook")
  -> hub
+ [What is your deal with Kiln?]
  Kiln has a man named Kaplan who knows a fair split. What Kiln riders leave on the road is ours. What we find of their dead we bury with their boots on.
  It is a good arrangement. Nobody on either side likes it, which is how you know it works.
  -> hub
+ [Did you hide a robber once?]
  Men come to the convoy with nothing. We ask nothing. One came after his brother died in the road. He ate our beans for a long time and spoke little. Then he went south.
  I will not say his name. It would be rude to the beans.
  -> hub
+ [What do you make of Pierce and the guns?]
  I hear that Pierce sold the Old Army's guns north to Scrapjaw, and then made every driver buy a gun to get paper. I hear it from a pair of drivers who each swear the other lied.
  Good business, if it is true. A man who sells the fire and the bucket never starves.
  ~ note("talkPierceGuns")
  -> hub
+ [What do you make of the post at the gate?]
  Nose soldiers inside a free yard. Mara Kessel writes down who comes and goes. She writes it twice. A woman who writes twice is afraid of something.
  We keep to the north side. Soldiers do not like the wind there.
  -> hub
+ [Goodbye.]
  -> END
