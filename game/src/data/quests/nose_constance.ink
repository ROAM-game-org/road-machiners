INCLUDE world.ink

VAR heard_rule = false
VAR heard_guns = false

=== start ===
# checkpoint: start
The Pierce office at Nose is a narrow room with a high desk and a locked cabinet. The only chair in it stands on Constance Pierce's side. She doesn't rise when you come in, and she finishes adding her column before she looks up.
{ crates_fate:
- "proof": The board has the file now, and my cousin hasn't spoken to me since. I call that a fair price for having it. I'll thank you once for the paper and I won't repeat myself. # speaker: Constance
- "lucan": My cousin has a new clerk this month who does nothing I can see. I find myself wondering what the clerk is for. I also hear your name is written on a receipt in his book, and that interests me more than the clerk does. # speaker: Constance
- "buried": You told me nothing. I'll go on believing that for exactly as long as it stays believable. # speaker: Constance
- "forged": The board asked Otto Brann about a crate lid, and he told them he'd never seen it. I don't blame you for being useful. I do blame you for being careless. # speaker: Constance
- else:
  { pin_fate == "pierce":
    You brought me a ring from the Yard, and I've written that down. I don't forget a favor, so you may take it that the account is open. # speaker: Constance
  - else:
    State your business, please. Pierce charges by the quarter hour, and we write paper only on trucks with a gun on a proper mount. # speaker: Constance
  }
}
-> hub

= hub
# checkpoint: start.hub
+ [Who are you?]
  I'm Constance Pierce, head underwriter at this office. I decide which trucks the company will bet on and what each bet costs. # speaker: Constance
  Augustin Pierce was my great-grandfather. I'd prefer you didn't use his name as a key, because it opens fewer doors than people think. # speaker: Constance
  -> hub
+ [Why only trucks with a gun?]
  ~ heard_rule = true
  Because I wrote that rule, and I wrote it for arithmetic. A driver without a gun loses his load, and then we pay his family. A driver with a gun keeps it, or at least makes it expensive for whoever takes it. # speaker: Constance
  I don't claim it makes the road pleasant. I don't ask where the rifles came from, either. I ask only whether one is on the truck. # speaker: Constance
  -> hub
+ {heard_rule} [What makes a mount proper?]
  It needs a pin on each side of the ring. A single pin can slide on a hard bend, and the gun swings round into the cab. Then we pay for a driver and a truck both. # speaker: Constance
  Nose issues its drivers a mount with one pin, so we write no paper on it. They pay the Salvage Yard to bore the second. That isn't my doing, and I don't stop it. # speaker: Constance
  -> hub
+ {heard_rule} [Where did all the rifles come from, if you don't ask?]
  ~ heard_guns = true
  The Old Army's, for the most part. The old Pierce yard held some of its trucks against a debt, and the guns left that yard in crates. I know that much because I've read the books. # speaker: Constance
  I read the books before I trust any story about where a thing went. # speaker: Constance
  -> hub
+ {heard_guns and crates_fate == "none"} [You look like someone with a problem.]
  I have a cousin named Lucan, who runs this company. Before the yard went its own way, it crated the Army's guns for sale. Some crates were marked with a wheel on the lid, and some had a hook burned into it. # speaker: Constance
  The wheel crates went to a dealer at the crossroads who sold to drivers. The hook crates went north. Scrapjaw has more rifles than the road ought to hold, and I can't prove who sent them. # speaker: Constance
  I won't ask a clerk of mine to look, because every clerk in this building has a cousin. Find me a paper or a mark a board will read. And please don't say his name aloud in this room. # speaker: Constance
  ++ [I'll look.]
     ~ note("cratesAsk")
     I never forget a favor, and I never forgive a debt. Remember both, and you'll do well with me. # speaker: Constance
     ~ begin("crates_hook")
     -> END
  ++ [Not my business.]
     Then we haven't spoken. You may leave the door as you found it. # speaker: Constance
     -> hub
+ [Goodbye.]
  -> END
