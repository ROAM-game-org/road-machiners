# Crime and the Marshalls

A calm attack, robbery or killing on the open road has a slow answer. Nobody knows of it until a driver who saw it reports it at a town or outpost. The report becomes a bounty, and a Marshall from the Roadhouse rides out to collect it. The answer is in Roaming only. Chaos Highway has the `bounties` mode switch off. `src/sim/crime.ts` owns the memories, reports, cases and money. `src/sim/marshals.ts` owns the hunt and the demand. The numbers are `CRIME` and `BOUNTY` in `src/data/market.ts`.

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
- A killing is the wreck of a driver whose own memory says the killer wronged it. Player and NPC killers are judged alike.
- Nothing is a crime when the culprit or the victim is a raider of Scrapjaw or Kiln or one of the Sunward. Lawmen answer for raiders.
- Nothing is a crime when the culprit is the Marshall hunting the victim, or a player with Bounty hunter and the victim has an open case, or when the victim was the aggressor of a fight with a third truck.
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
- An independent issuer stakes up to half its spendable money, at most the fine, into the case's escrow.
- A stake under 60 turns of the wage (about 7 M's) files nothing. The open bounties on one truck are capped at four robberies, about 444 M's.
- The log tells the player when a case is filed against it, as news reaching the driver, with a toast.

## Money

- Paid: the target pays the whole bounty. A fifth goes to the Marshall who asked, or to the Marshall office when paid at the desk. The rest goes to the issuing driver, or to the faction coffers. An independent's escrow returns to it.
- Collected: the hunter is paid the escrow of an independent's case, or the bounty from the faction fund. The target loses no money or cargo. A player with Bounty hunter who knocks out a truck with open cases collects them all the same way, and the log says how much.
- Lapsed: the escrow returns to a living issuer.
- Each move raises a `transfer` or a `shopMoney` event of kind `bountyFund`, `bountyCoffers`, `bountyOffice` or `bountyEscrow`, so the recorder's NPC ledger explains it.

## The Marshalls

- The Marshalls are an organized, lawful faction. They hold 0 toward every faction and every faction holds 0 toward them, except the Sunward at −20. The player starts at 0.
- Two Marshalls ride as a pair from the Roadhouse, mostly in Lincolns at the `loaded` gear level. A loaded Lincoln alone wins about 3 fights in 10 against the midgame kit by `fightOdds()`, a pair about 7 in 10. They take fuel and repairs in Bowl and Nose.
- An idle Marshall waits beside the Roadhouse. It takes the open case with the most owed on one target, oldest first, and one Marshall hunts one target.
- The first lead is the crime's place and the culprit's heading as the witnesses saw it. The Marshall asks each driver it sees once per hunt where it last saw the target, and a newer sighting replaces the lead. It never reads the target's position out of its own sight.
- At a lead with no sight of the target, it searches toward the reporting pad nearest the lead's heading within 60 tiles, then rides on from pad to pad.
- After half a day with no newer lead it gives up. The case waits half a day before any Marshall takes it again.
- In sight of the target it demands payment once, and not again for a day. The demand stands for 10 turns.
- The player answers on the radio: Pay closes every case and makes a truce, and Refuse, a hang-up or silence starts a feud and a fight. Pay stays offered but off with the shortfall when the player cannot cover it. The player can also hail a Marshall that hunts it and pay.
- An NPC target pays, fights or flees by the `bountyDemanded` decision. Pay is open only when its money covers the bounty.
- A Marshall knocked out or wrecked frees its case.

## The desk at the Roadhouse

- Parked on a Roadhouse pad, the player opens a desk with one tab. It lists each open case with Pay, and Pay all.
- It lists each lawful organized faction that holds the player hostile with Settle. Settling lifts that standing to −49, wary, and changes nothing else: memories, feuds and other cases stay.
- The price is the days of drift it skips at the tier 1 wage: (−49 − standing) / 10 a day × 450 turns × 12.33 cents. From −100 that is about 283 M's.
- Settle is off while a case that faction issued is open, or while the player is short.
