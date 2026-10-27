# Factions and relations

Every driver belongs to one faction, does one job and may ride in a group for a while. The three never mix. The faction is who the driver answers to. The job is its template and traits, like trader, raider or lawman. A group is a timed state, like an escort, a truce or a deal.

## Factions

| Faction | Organized | Outlaw | Members |
| --- | --- | --- | --- |
| Bowl | yes | no | Bowl Farmers, Bowl convoys and their guards, a third of the traders that start in Bowl |
| Nose | yes | no | Nose Army, Nose convoys and their guards, a third of the traders that start in Nose |
| Guidestar Guild | yes | no | couriers |
| Administrators | yes | no | nobody yet |
| Scrapjaw | yes | yes | raiders from Scrapjaw Camp |
| Kiln | yes | yes | raiders from Kiln Camp |
| Sunward | yes | yes | the eight Cavalcade cars and the three hunters of the Sunward Hollow |
| Marshalls | yes | no | the pair of Marshalls of the Roadhouse |
| Independent | no | no | the other traders, scavengers, roamers, vultures and mercs |

An organized faction keeps a standing with the player, and its members defend each other. Independent is no organization. It is the label for drivers with no town to speak for them, so independents share no loyalty and judge each other only by what they remember. Lawmen fight outlaws on sight, and stalls refuse them.

A raider takes the faction of the camp it spawns at, a Sunward car is always Sunward, a lawman and a convoy the town it spawns at, and a guard the faction of the convoy it escorts. A courier is always Guidestar, and the road drivers are always independent. A trader that starts in Bowl or Nose carries that town's papers one time in three. A truck that spawns with no site, as on Chaos Highway, takes its template's home faction.

A new faction gets its own row and column in the table below, with 0 for every pair the lore does not settle. Nothing falls back to a default.

## Attitude

Every attitude is a whole number from −100 to 100, read in five bands.

| Band | Score | What the holder does |
| --- | --- | --- |
| hostile | −50 or less | May attack on sight, when it sees the truck, can fight and its read of the danger agrees. Talks only of surrender, mercy and truce. |
| wary | −49 to −15 | Starts no fight on attitude alone, but a raider preys on the truck's loot. Makes no offers, refuses trade and news, and still answers a rescue. |
| neutral | −14 to 14 | Behaves as drivers always have. |
| friendly | 15 to 49 | Opens help topics. May step in to defend the truck. |
| allied | 50 or more | Never robs the truck. Steps in to defend it nearby. Counts on its side in fight odds and in a peace deal. |

How a faction judges another. The row judges the column.

| | Bowl | Nose | Guidestar | Administrators | Scrapjaw | Kiln | Sunward | Marshalls | Independent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bowl | 60 | −25 | 20 | 0 | −40 | −30 | −30 | 0 | 5 |
| Nose | −5 | 60 | 20 | −20 | −40 | −40 | −30 | 0 | 5 |
| Guidestar | 20 | 20 | 60 | 5 | −30 | −30 | −20 | 0 | 10 |
| Administrators | 0 | −35 | 5 | 60 | −5 | −5 | −10 | 0 | 10 |
| Scrapjaw | −30 | −40 | −25 | −5 | 60 | −10 | −20 | 0 | −30 |
| Kiln | −10 | −40 | −20 | −5 | −10 | 60 | −20 | 0 | −30 |
| Sunward | −20 | −20 | −20 | −20 | −20 | −20 | 60 | −20 | −20 |
| Marshalls | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 60 | 0 |
| Independent | 5 | 5 | 10 | 5 | −30 | −30 | −20 | 0 | 0 |

- Bowl would destroy Nose and calls that defense. Nose thinks Bowl slow but needs its grain.
- The Bowl Granary sends Kiln Camp rations in exchange for passage for its trucks, so Kiln lets Bowl trucks pass. Bowl still does not trust Kiln, and Bowl lawmen still fight Kiln riders on sight.
- Scrapjaw and Kiln are rival camps that neither rob nor help each other.
- The Marshalls take no side and no side takes against them for their work. Only the Sunward, wary of everyone, are wary of them.
- The Sunward are wary of everyone, and everyone of them. Bowl and Nose are warier, since the Senate stopped the order's grain and Nose families lost children to it.
- Nobody in the table is hostile. War on sight comes only from the law, a feud or a personal grudge.

What a driver thinks of another truck, in this order:

1. A feud between them, either way, makes it −100. A truce, either way, holds it between −14 and 0, so a truce ends faction and personal hostility.
2. The faction term: the faction's standing with the player for an organized faction judging the player, and the table otherwise. An independent judges the player at 0.
3. Its own memories of that truck, from −60 to +40.
4. A lawman judges an outlaw at −50 or worse, unless they hold a truce. No memory lifts this.

The player has no attitude of its own. It decides by acting.

## Personal memories

A driver remembers what a truck did to it: an attack (−40), a robbery (−50) or a theft (−30) for 3 days, and aid, a tow or a patch (+30 each) or a defense (+40) for 2 days. A repeat refreshes the memory instead of adding to it. Every driver remembers by the same rule, whoever did the deed. Only the driver it happened to remembers. A stranger learns nothing.

## Witnesses

A calm attack or robbery, one the two trucks were not already hostile over, is an incident. Shots back at an attacker are self-defense and start nothing new, so a fight never fans out again.

```
calm attack, robbery, refused demand, retaliation for a crash the other truck caused
        |
        v
witnesses: drivers who see both trucks, the victim, and the victim's escorts who see the attacker
        |
        v
each witness:
   holds back if it is knocked out, stranded, bound to the attacker, in a truce with it,
      or (unless a lawman) likes the attacker at least as much as the victim
   steps in if it is the victim or its escort
   steps in if it is a lawman and the victim is a lawful driver, at any distance in sight
   steps in if it is allied with the victim within 10 tiles
   steps in one time in four if it is friendly with the victim within 10 tiles
        |
        v
known if the victim saw the attacker, or a lawman or an ally of the victim saw it all
   -> one deed for the whole incident
```

A witness that would not shield the attacker also remembers the crime and reports it at its next town or site, which [Crime and the Marshalls](crime.md) follows.

A driver that steps in starts a feud with the attacker. It still fights by its own sight, danger and guns, so it never shoots through a hill or at a truck it cannot reach.

## Called for help

The player can radio a driver in sight to join a fight, which [Social](social.md) describes. The driver holds back by the same two tests as a witness, applied to each foe of the player: bound to or in a truce with the foe, or (unless a lawman) liking the foe at least as much as the player. It also refuses when it is knocked out or stranded. A lawman agrees as an allied driver does unless the player attacked or robbed a lawful foe, and the answer is a weighted roll by standing: allied about 98 in 100, friendly about 3 in 4, neutral about 1 in 10. An agreeing driver starts a feud with every foe the same way a witness does.

## Standing

The player starts at each organized faction's view of an outside driver: Bowl 5, Nose 5, Guidestar 10, Administrators 10, Scrapjaw −30, Kiln −30, Sunward −20, Marshalls 0. A deed changes standing with the faction of the driver it touched, and the victim's memory, when the deed is known.

| Deed | When | Standing | Memory |
| --- | --- | --- | --- |
| attacked | a calm attack, stray fire past its limit or a claymore | −15 | −40 |
| robbed | a robbery, or the player's demand, given in to or refused | −20 | −50 |
| stole | looting what the player agreed to leave | −10 | −30 |
| killed | a wreck by the player's last hit on a driver it attacked or robbed that day | −30 | none |
| aided | a free gift of fuel or supplies | +5 | +30 |
| towed | a tow that ends in town | +5 | +30 |
| patched | a finished patch | +5 | +30 |
| defended | knocking out a driver that attacked another one. A driver that only shot back, or fought the other from the same turn, does not count. The one it attacked must not be fighting the player | +8 | +40 |
| contract | a contract done at a Bowl or Nose shop | +3 | none |
| failed contract | a contract the player failed or handed in late at a Bowl or Nose shop | −5 | none |

- The same deed on the same driver counts once a day, so ten hits are one attack, and a driver who refits after a knockout gives no fresh help.
- Help raises standing with one faction by 15 a day at most. Losses have no cap.
- Each day standing drifts 10 back toward its start, so a player at −100 is out of the hostile band in 6 days. The Marshalls' desk sells the drift at once: settling lifts a hostile standing to −49, as [Crime and the Marshalls](crime.md#the-desk-at-the-roadhouse) describes.
- A band change shows in the log and as a toast with its cause, like "Scrapjaw now treats you as wary. Old grudges fade with time." A deed names itself, as in "You towed one of their drivers." A settlement has its own line and adds no cause.
- On Chaos Highway standing never moves, so the gangs there hold fire on the gun truck until it shoots them. Memories still form.

## Talk and offers

- A wary or hostile driver answers a call with a cold line instead of its greeting, and offers no trade, directions or news. A driver that remembers a wrong says it knows what the player did. Otherwise it names its people.
- A friendly or allied driver opens help topics, as if the player had helped it.
- A stranded or low truck can always get help from a driver that is not hostile: a tow, a patch or aid, asked for or offered. Independents have no standing, so a neutral rescuer always exists, and the town patch and the beacon never ask about standing.
- Two drivers tow each other only when neither is wary of the other. Raiders still tow only raiders, and townsfolk never tow raiders.
- A driver never robs a truck it is friendly with, and a raider never robs a gang truck.
- The hover card tags each driver by how it treats the player: hostile in red, or wary, neutral or friendly. The character screen lists the standing with each faction, with the base, each kind of recent deed and the rest in its tooltip.
