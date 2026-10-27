# Crime and the Marshalls

A calm attack, robbery or killing on the open road has a slow answer. Nobody knows of it until a driver who saw it reports it at a town or site. The report becomes a bounty, and a Marshall from the Roadhouse rides out to collect it. The answer is in Roaming only. Chaos Highway has the `bounties` mode switch off. `src/sim/crime.ts` owns the memories, reports, cases and money. `src/sim/marshals.ts` owns the hunt and the demand. The numbers are `CRIME` and `BOUNTY` in `src/data/market.ts`.

```
incident (calm attack or robbery) or killing (a wreck of a driver that remembers the killer wronged it)
   | a crime? no -> nothing
   v
witnessed memory on each driver who saw both trucks and would report it
   | lost: after 3 days, when the witness is gone, or when the culprit knocks the witness out
   v
report: a witness holding the memory parks on a pad of a reporting site
   | already filed -> the witness joins the case, no money moves
   | stake under the minimum, or no room under the cap -> nothing
   v
open case
   |-- the target pays (on the radio or at the desk)  -> paid
   |-- the target's hunter knocks it out               -> collected
   |-- 5 days pass, or the target is gone             -> lapsed
```

## What counts

- A crime is an attack or a robbery that the witness rule of [Factions and relations](factions.md#witnesses) calls an incident, or a killing. A robbery includes a demand given in to or refused.
- A robbery also carries restitution: the value of what the victim handed over for it, cargo at its item value or the money paid. Each hand-over adds to the newest crime of that robber on that victim, while it is a robbery. A refused demand hands over nothing and carries none, and an attack or a killing never does.
- A killing is the wreck of a driver whose own memory says the killer wronged it. Player and NPC killers are judged alike.
- Nothing is a crime when the culprit or the victim is a raider of Scrapjaw or Kiln or one of the Sunward. Lawmen answer for raiders.
- Nothing is a crime when the culprit is the Marshall hunting the victim, or a player with Bounty hunter and the victim has an open case, or when the victim was the aggressor of a fight with a third truck.
- A crash is a crime only through a retaliation, and only the truck at fault can be named in it. A truck that was parked, crawling or hit while driving past is never named.
- Embezzlement is the one crime nobody witnesses. A shop files it itself against the player when a haul's late limit passes with its crates still aboard, see [economy](economy.md). Crates lost to robbery, loot or spills are no crime.
- Shots back at an attacker are no incident, so self-defense needs no rule. A theft of a claimed pile stays a matter of standing only.

## Witnesses

- The victim reports when it saw the culprit and is not knocked out.
- Another driver reports when it saw both trucks, is not a raider or knocked out, gave the culprit no word, holds no truce with it, and does not like the culprit at least as much as the victim.
- A heard or detected truck names nobody.
- One crime has one id, the turn, the culprit, the victim and the offense, so every witness files the same case.

## Reports and bounties

- The reporting sites are Bowl, Nose, Dustwell, the Granary, the Pump Station, Green Pit, the Salvage Yard and the Roadhouse. A witness files on its next normal stop there and makes no detour.
- The issuer is the victim's faction when it is an organized, lawful one, else the reporter's faction, else the reporter itself.
- A faction stakes the fine from its bounty fund: an attack is 450 turns of the tier 1 wage (about 55 M's), a robbery 900 turns (about 111 M's) and a killing 2,700 turns (about 333 M's).
- An embezzlement case names the posting shop as its victim and has no reporter. Its issuer is the shop's faction when it is an organized, lawful one (Bowl, Nose), else the stall itself. It is owed the value of the kept crates, within the same cap and minimum as other bounties, and a stall stakes like a faction, with no escrow.
- An independent issuer stakes up to half its spendable money, at most the fine, into the case's escrow.
- A stake under 60 turns of the wage (about 7 M's) files nothing. The open fines on one truck are capped at four robberies, about 444 M's. Restitution does not count toward the cap.
- A case owes its fine plus its restitution.
- A filing is silent. The target learns of a case when a Marshall demands payment, when it hears the terms of a Marshall that hunts it, or at the end of a turn it ends parked on a Roadhouse pad. The Wanted well shows only the cases the player has learned of.

## Money

- Paid: the target pays the fine and the restitution. A fifth of the fine goes to the Marshall who asked, or to the Marshall office when paid at the desk. The rest of the fine goes to the issuing driver, or to the faction coffers. An independent's escrow returns to it. The restitution goes to the victim, or when the victim is gone to the coffers of an issuing faction, or to the Marshall office when a driver issued.
- Collected: the hunter is paid the escrow of an independent's case, or the fine from the faction fund, never the restitution. The target loses no money or cargo. A player with Bounty hunter who knocks out a truck with open cases collects them all the same way, and the log says how much.
- Lapsed: the escrow returns to a living issuer.
- Each move raises a `transfer` or a `shopMoney` event of kind `bountyFund`, `bountyCoffers`, `bountyOffice` or `bountyEscrow`, so the recorder's NPC ledger explains it.

## The Marshalls

- The Marshalls are an organized, lawful faction. They hold 0 toward every faction and every faction holds 0 toward them, except the Sunward at −20. The player starts at 0.
- Two Marshalls ride as a pair from the Roadhouse, mostly in Lincolns at the `loaded` gear level. A loaded Lincoln alone wins about 3 fights in 10 against the midgame kit by `fightOdds()`, a pair about 7 in 10. They take fuel and repairs in Bowl and Nose.
- An idle Marshall waits beside the Roadhouse. It takes the open case with the most fines on one target, oldest first, and one Marshall hunts one target.
- Each case names its posse: one Marshall (`lone`), the pair (`pair`) or nobody (`spent`). A new case is `lone`. A target needs the pair while any of its open cases is `pair` or `spent`, and nobody rides it once all of them are `spent`. A spent case still lapses after 5 days and can be paid at the desk.
- The first lead is the crime's place and the culprit's heading as the witnesses saw it. The Marshall asks each driver it sees once per hunt where it last saw the target, and a newer sighting replaces the lead. It never reads the target's position out of its own sight.
- At a lead with no sight of the target, it searches toward the reporting pad nearest the lead's heading within 60 tiles, then rides on from pad to pad.
- After half a day with no newer lead it gives up. The case waits half a day before any Marshall takes it again.
- In sight of the target it demands payment once, and not again for a day. The demand stands for 10 turns. A Marshall that sees its target before that day is out rides home, and the case waits until the day is out.
- The player answers on the radio: Pay closes every case and makes a truce, and Refuse, a hang-up or silence starts a feud and a fight. Pay stays offered but off with the shortfall when the player cannot cover it. The player can also hail a Marshall that hunts it and pay.
- An NPC target pays, fights or flees by the `bountyDemanded` decision. Pay is open only when its money covers the fine and the restitution.
- A Marshall knocked out or wrecked frees its case, and the posse stays as it was.

### Backing off and the pair

- A Marshall is outmatched when it is weak, or when its danger judgment of the target, with no random spread, is more than it can manage. It is the same reason a driver weighs when it accepts a truce.
- A hunt backs off when a truce plea between the target and a Marshall of the hunt is granted, whoever pleaded, or when a Marshall of the hunt runs from the target, and the hunting Marshall is outmatched at that moment. A Marshall that could win keeps the hunt through a truce.
- Backing off steps every hunted case one posse up, `lone` to `pair` and `pair` to `spent`. It frees the case at once, with no half-day wait, and forgets the last demand. The Marshall drops its hunt and rides back to the Roadhouse. The rule is the same for player and NPC targets.
- The player who pleads with a lone Marshall that backs off hears "Guns down, then. The page stays open. Next time I won't ride out alone." A pair that backs off says the plain truce line.
- A case that needs the pair is taken only by a Marshall that waits at the Roadhouse and sees its partner waiting there too. Without the partner, it takes the next case one Marshall may ride, or none.
- The deciding Marshall leads. Its partner follows on a fee-free escort, rides beside it and fires on anyone who shoots it. The leader alone follows leads, asks drivers and makes the demand.
- Pay closes every case and makes a truce with both. A refusal, a hang-up or silence feuds the target from both, and each one that sees it fights. A knockout by either collects.
- The pair breaks up when the hunt ends. A leader whose partner is knocked out gives the hunt up, and the case still waits for the pair.

## The desk at the Roadhouse

- Parked on a Roadhouse pad, the player opens a desk with one tab. It lists each open case with Pay at its fine plus restitution, and Pay all.
- It lists each lawful organized faction that holds the player hostile with Settle. Settling lifts that standing to −49, wary, and changes nothing else: memories, feuds and other cases stay.
- The price is the days of drift it skips at the tier 1 wage: (−49 − standing) / 10 a day × 450 turns × 12.33 cents. From −100 that is about 283 M's.
- The desk offers Look for locals beside Drive on. Petra Quell is the one local. While the player holds a search, she sells the newest Marshall sighting of its target for `CRIME.leadFee` (about 3 M's), only when it is newer than the lead held. With none she says so and charges nothing.
- Settle is off while a case that faction issued is open, or while the player is short.
