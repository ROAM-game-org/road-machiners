INCLUDE world.ink

=== start ===
# checkpoint: start
The Pierce office at Nose is a narrow room with a high desk and a locked cabinet. Constance Pierce does not stand when you enter.
{ crates_fate:
- "proof": The board has the file. My cousin has not spoken to me since. That is a fair price. # speaker: Constance
- "lucan": My cousin has a new clerk he did not have last month. I wonder what the clerk is for. # speaker: Constance
- "buried": You told me nothing. I will believe it until I do not. # speaker: Constance
- else: State your business. Pierce charges by the quarter hour. # speaker: Constance
}
-> hub

= hub
# checkpoint: start.hub
+ [Who are you?]
  Constance Pierce. Head underwriter at this office. Augustin Pierce was my great-grandfather, and I do not use his name as a key. # speaker: Constance
  -> hub
+ [Why does Pierce insure only armed trucks?]
  An unarmed driver loses his load, and we pay. An armed driver keeps it, or at least makes it dear. I wrote the rule. It is arithmetic. # speaker: Constance
  -> hub
+ [Why a second pin?]
  A mount with a single pin can slide on a bend. The gun comes round into the cab, and we pay for a driver and a truck. Now we insure only a mount pinned twice. # speaker: Constance
  We write no paper on a Nose mount with one pin. Nose drivers pay the Salvage Yard to bore the second. That is not my doing, and I do not stop it. # speaker: Constance
  -> hub
+ [Why does every truck carry a gun?]
  The Army left and nobody took its place. The rifles went loose, and the road went open. A policy needs a thing to insure, and an armed truck is one. # speaker: Constance
  I do not say it is a good world. I say it is the one that pays its debts. # speaker: Constance
  -> hub
+ [Where did all the guns come from?]
  The Army's, mostly. The old Pierce yard held Army trucks against a debt. The guns left the yard. I read the books before I trust a story. # speaker: Constance
  -> hub
+ {crates_fate == "none"} [You look like someone with a problem.]
  I have a cousin, Lucan. He runs this company. The old yard stripped the Army's guns and crated them. Crates marked with a wheel went to a dealer at the crossroads. Crates marked with a hook went north. # speaker: Constance
  Scrapjaw has more rifles than the road should hold. I cannot prove who sent them. I will not ask a clerk to look, because clerks have cousins too. # speaker: Constance
  Find me a paper or a mark that a board will read. Do not say his name aloud. # speaker: Constance
  ++ [I will look.]
     ~ note("cratesAsk")
     I never forget a favor. I do not forgive a debt either. Remember both. # speaker: Constance
     ~ begin("crates_hook")
     -> END
  ++ [Not my business.]
     Then we have not spoken. # speaker: Constance
     -> hub
+ [Goodbye.]
  -> END
