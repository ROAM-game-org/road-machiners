INCLUDE world.ink

VAR heard_oldworld = false
VAR asked_oldworld = false
VAR heard_bowl = false
VAR asked_bowl = false
VAR heard_jj = false
VAR asked_jj = false
VAR heard_tone = false
VAR asked_tone = false
VAR heard_couriers = false
VAR asked_couriers = false
VAR heard_convoy = false
VAR asked_convoy = false
VAR heard_army = false
VAR asked_army = false
VAR heard_tools = false
VAR asked_tools = false

=== start ===
# checkpoint: start
Eh? Pull up a crate. I'm Ibo. I listen to the air for the Army, and to everything else for myself.
-> hub

= hub
# checkpoint: start.hub
+ [What do you do in this shack?]
  Freeze, mostly, and listen. The Army pays me for its own calls, and whatever else drifts through I keep for myself. There's Jill Jane, who runs Waste Of Time Radio and comes in best after dark. There's the couriers of the <term=guild>Guild</term> calling their rounds. And now and then there's a tone out of the <term=fallen_sun>Fallen Sun</term>, the big crashed hull in the crater, that nobody can explain. The set itself is <term=old_world>Old World</term> work, built back when there were masts on every hill.
  ~ heard_oldworld = true
  ~ heard_jj = true
  ~ heard_couriers = true
  ~ heard_tone = true
  -> hub
+ {heard_oldworld and not asked_oldworld} [What was the Old World like?]
  Bigger than anyone here thinks. Bowl folk will tell you it was all orchards, and that's rubbish. There were highways, power lines, towns bigger than Nose and Bowl put together. The orchards were only what you could see from the canals. I knew men of the <term=old_army>Old Army</term> who could drive a mountain road blind, and there's nobody like them left.
  ~ asked_oldworld = true
  ~ heard_army = true
  ~ heard_bowl = true
  -> hub
+ {heard_bowl and not asked_bowl} [What do you make of the Bowl folk?]
  Good people, slow talkers. They'd hold a meeting to decide whether to hold a meeting. Still, their grain keeps us fed, so the Army minds its manners with them.
  ~ asked_bowl = true
  -> hub
+ [Heard anything interesting on the air?]
  Scavengers gab about the Burnt Convoy now and then, that row of burnt trucks the road crews hauled off. Picked clean, they say. The stretch is all ash and bent rims, and not worth the fuel to go and look.
  ~ note("burntConvoy")
  ~ heard_convoy = true
  -> hub
+ {heard_jj and not asked_jj} [Where does Jill Jane broadcast from?]
  Nobody knows, but I'd wager she moves it. Her signal's strongest at night, and it drifts like the mast is on wheels. Don't tell the Sergeant I listen to her. He thinks this shack is for the Army alone.
  ~ asked_jj = true
  -> hub
+ {heard_tone and not asked_tone} [What does the tone from the Fallen Sun say?]
  It's a low, steady note that comes and goes, always from the crater's side. Some say it counts the years since the fall. I've no key to decode it, and the Army never asked me to log it. If it counts, it counts without me.
  ~ asked_tone = true
  -> hub
+ {heard_tone} [Hear anything from the crater at night?]
  { cult_broken():
    Eh? Quieter than it's been in years. A line of lamps used to cross to the crater every dusk, and if you called them you got an open channel and somebody breathing on it. Now there's nothing at all. I'd wager somebody finally stopped them. Do not tell the Sergeant I was glad.
  - else:
    Eh? Nobody out there talks, that's the odd part. Every dusk a line of lamps goes out to the crater, and if you call them you get an open channel and somebody breathing on it, nothing more. Joss Ardo, who sings with the Children of Noah now, rode with them once and got out. I'd wager he's the only one who ever did.
    ~ note("sunwardLamps")
  }
  -> hub
+ {heard_couriers and not asked_couriers} [Who are the Guild couriers?]
  They carry the mail between the towns. They run in pairs now, two trucks together. I remember when they went out alone, before the Kiln riders got bold. Kiln's the raider camp in the south. Tamsin Roe's the odd one, with no gun at all. I hear her call-sign more than any other.
  ~ asked_couriers = true
  -> hub
+ {(heard_convoy or has_note("burntConvoy")) and not asked_convoy} [What happened at Burnt Convoy?]
  A whole convoy went up in one night, years back. Some say raiders did it. Some say a truck full of fuel drums blew and took the rest with it. I heard the last calls on the air, and nobody said who started it.
  ~ asked_convoy = true
  -> hub
+ {heard_army and not asked_army} [How did the Old Army end?]
  Hungry. Commander Lind nailed a book of every unpaid promise to the gate at Old Orchard, the Army's depot, and then he died in the motor pool. I heard his last calls on the air. He read the whole list. The machine tools stayed behind in the shed, until command came for them.
  Some say the Army didn't run out of food. They say it was starved on purpose. I would wager a man who starts a rumor like that wants a seat on Nose's Central Committee.
  ~ note("talkArmyStarved")
  ~ asked_army = true
  ~ heard_tools = true
  -> hub
+ {heard_tools and not asked_tools} [Who took the Old Orchard tools?]
  Command hauled them up the mountain once the Army was gone. Nobody asked the Bowl, and nobody asked the dead. I hear things on the air about who wanted the Army gone. I won't repeat them.
  ~ note("talkCommitteeRent")
  ~ asked_tools = true
  -> hub
+ {depot_thief != "none" and depot_thief != "open"} [Heard about the depot business?]
  { depot_thief:
  - "vance": Vance! He sat at my table on cold nights, and I'd have trusted him with my radio.
  - "pell": Pell? That man can't steal a biscuit without saying sorry to it. Somebody else is laughing tonight.
  - "bought": The depot's clean, they say. Funny, then, that the trader by the gate still sells fuel cheap.
  - else: Fuel still goes missing, they say. It's not my business, and it's not yours either, now.
  }
  -> hub
+ [Goodbye.]
  -> END
