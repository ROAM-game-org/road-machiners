INCLUDE world.ink

=== start ===
# checkpoint: start
{ sack_fate:
- "closed": Odile Marsh. The gate is honest again. Mind the weighing block.
- "cut": Odile Marsh. I count every night and the count stays short. Do not ask me to stop.
- "posted": Odile Marsh. The third board stays. I did not put it up, and I will not wipe it off.
- "blamed": Odile Marsh. The night weigher is gone, and the count is short anyway.
- else: Odile Marsh, steward of the Granary. Every sack that goes to Kiln is written on the gate.
}
-> hub

= hub
# checkpoint: start.hub
+ [What hangs on the gate?]
  A pair of boards. One counts the sacks we pay Kiln Camp, a sack for each armed truck that crosses. One counts the tenants' share for the road patrol. # speaker: Odile
  I chalk them myself, at night, after I count the store. # speaker: Odile
  ~ note("sackGate")
  -> hub
+ [Why pay Kiln at all?]
  My grandmother ate boiled sacking in the drought. I have heard it told since I was small. # speaker: Odile
  I will pay raiders forever before I see the Bowl hungry again. # speaker: Odile
  -> hub
+ [Who is the road patrol?]
  Bowl men and tenants both. Enough years in the patrol earn a vote, so the tenants line up for it. # speaker: Odile
  The Granary count pays for it, and the bridge toll, and the convoy fee. The Nose pays nothing and guards its own walls. # speaker: Odile
  -> hub
+ {sack_fate == "none"} [Is your count right?]
  Every night the sacks out of the store are more than both boards add up to. # speaker: Odile
  I have counted it over and over. I cannot say it to the tenants. They would say I am short on purpose. # speaker: Odile
  ++ [I will count with you.]
     ~ begin("granary_sack")
     -> END
  ++ [Not now.]
     -> hub
+ {lamps_fate == "none"} [Where does the lamp oil come from?]
  Podfield. Juno Pell keeps the beacon lamps there, and she sells the Bowl her oil. My gate burns it every night. # speaker: Odile
  The carter says the end lamp stands dark. I do not like a dark lamp. # speaker: Odile
  Podfield lies east of here and a little north, in the debris trail, where the pods came down thickest. # speaker: Odile
  { found("podfield"):
    -> lamps_ask
  }
  -> hub
+ {count_fate == "none"} [Who pays the patrol at Old Orchard?]
  The tenants' share does. A man named Ilya Moreno holds the gate there in a Bowl coat. He was a corporal of the Old Army. # speaker: Odile
  A rider came at dusk. Ilya's number on the blockhouse wall is not the number it has been. He has never changed it in all these years. # speaker: Odile
  { found("orchard"):
    -> orchard_ask
  }
  -> hub
+ {pipe_fate == "read"} [About the book read at your gate.]
  I stood in my door and let it be read. I do not know why. # speaker: Odile
  The tenants will not forget it. The Archon's household will not either. # speaker: Odile
  -> hub
+ {lamps_fate != "none"} [About the Podfield lamps.]
  { lamps_fate:
  - "paid": The end lamp burns again. The oil comes slower now, and my gate lamps burn low. I count by what I have. # speaker: Odile
  - "kept": No oil came. I count by tallow, and tallow smokes. # speaker: Odile
  - "sold": A Bowl crew lights the Podfield lamps now. My oil comes on time. I do not ask what Juno said. # speaker: Odile
  }
  -> hub
+ {count_fate != "none"} [About the wall at Old Orchard.]
  { count_fate:
  - "told": Ilya sent word. A household sealed a release for one truck. I said nothing and so will you. # speaker: Odile
  - "painted": Ilya still counts the trucks each dawn and says the sum is right. I let him. # speaker: Odile
  - "sold": Ilya has put a watch on the orchard edge. My tenants were hungry already. Now they are thieves too. # speaker: Odile
  }
  -> hub
+ [Goodbye.]
  -> END

= lamps_ask
+ [I will go and look at the lamps.]
  ~ begin("granary_lamps")
  -> END
+ [Not now.]
  -> hub

= orchard_ask
+ [I will go and look at the wall.]
  ~ begin("orchard_count")
  -> END
+ [Not now.]
  -> hub
