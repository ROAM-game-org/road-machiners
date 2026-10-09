INCLUDE world.ink

VAR knows_gate = false
VAR knows_patrol = false
VAR knows_lamps = false
VAR knows_orchard = false

=== start ===
# checkpoint: start
{ sack_fate:
- "closed": Odile Marsh. The gate is honest again. Kiln left a notched stick on the post by way of an opinion, but I'll take that over what we had. Mind the weighing block, it's newly set.
- "forced": Odile Marsh. You took a stick off a Kiln collector, and now a pair of my carts have been stripped on the east road. Nobody was hurt, but please don't put your hands on Kiln men at my drop again.
- "dealt": Odile Marsh. There's a third column on the gate now, in my own chalk, and the tenants read it every morning. I didn't like writing it. I like a fee I can count better than one I can't.
- "mended": Odile Marsh. I hung a true poise on the beam, and the boards come closer every night. They don't come all the way, and I've stopped pretending I know why.
- "cut": Odile Marsh. I count every night and the count stays short. Don't ask me to stop.
- "posted": Odile Marsh. The third board stays where you put it. I didn't chalk it, and I won't wipe it off.
- "blamed": Odile Marsh. The night weigher's gone from the gate, and the count is short anyway.
- else: Odile Marsh, steward of the Granary. Every sack that goes to Kiln is written on the gate.
}
-> hub

= hub
# checkpoint: start.hub
+ [What hangs on the gate?]
  A pair of boards that I chalk myself at night, after I've counted the store. One shows the sacks we pay to Kiln Camp, a sack for every armed truck of ours that crosses their road. The other shows the tenants' share for the road patrol, the men who guard the roads near the Bowl. # speaker: Odile
  I light the lamps over the gate at the same hour, with oil from the beacon field at Podfield. Lately my count has troubled me more than the lamps do. # speaker: Odile
  ~ note("sackGate")
  ~ knows_gate = true
  ~ knows_patrol = true
  ~ knows_lamps = true
  -> hub
+ {knows_gate} [Why does the Granary pay Kiln a sack for every truck?]
  Because if we don't, Kiln strips the grain trucks on the road, and a Granary that loses its trucks loses its winter. My grandmother lived through the year the grain ran out. She ate boiled sacking. I'd rather pay raiders every season than see that year again. # speaker: Odile
  -> hub
+ {knows_patrol} [Who is in the road patrol?]
  Bowl men and tenants together. The Granary count helps pay them, along with the bridge toll and the convoy fee. The Nose pays nothing and grumbles when it's asked. A tenant who serves enough years earns a vote, so they line up to join. # speaker: Odile
  I send grain every month to one of them, a man named Ilya Moreno. He holds the Old Orchard gate in a Bowl coat and still calls himself a corporal. Yesterday a rider came from him with a message I didn't like. # speaker: Odile
  ~ knows_orchard = true
  -> hub
+ {knows_gate and sack_fate == "none"} [What troubles you about your count?]
  The store loses more sacks every night than both boards add up to. I've counted it over and over. I can't say so aloud to the tenants, because they'd say I'm short on purpose. # speaker: Odile
  ++ [I will count with you.]
     ~ begin("granary_sack")
     -> END
  ++ [Not now.]
     -> hub
+ {knows_lamps and lamps_fate == "none"} [Who presses the oil you burn at the gate?]
  An old woman named Juno Pell, who keeps the beacon lamps along the debris trail at Podfield. That's east of here and a little north, where the pods came down thickest. She sells the Bowl her oil, and my carter tells me her end lamp stands dark. I don't like a dark lamp. # speaker: Odile
  { found("podfield"):
    -> lamps_ask
  }
  -> hub
+ {knows_orchard and count_fate == "none"} [What was the message from Old Orchard?]
  That the number Ilya paints on the blockhouse wall has changed. He counts the trucks in the motor pool every dawn and paints the sum. He hasn't altered it in all these years, and he's not a man who makes mistakes with figures. # speaker: Odile
  { found("orchard"):
    -> orchard_ask
  }
  -> hub
+ {pipe_fate == "read"} [About the book read at your gate.]
  I stood in my own door and let it be read, and I still don't know why. # speaker: Odile
  The tenants won't forget it. I'm quite sure the household of the Archon won't either. # speaker: Odile
  -> hub
+ {lamps_fate != "none"} [About the Podfield lamps.]
  { lamps_fate:
  - "paid": The end lamp burns again, but the oil comes slower now and my gate lamps burn low. I count by what I have. # speaker: Odile
  - "kept": No oil came, so I count by tallow, and tallow smokes. # speaker: Odile
  - "sold": A Bowl crew lights the Podfield lamps now, and my oil comes on time. I don't ask what Juno said. I'm fairly sure she didn't say it willingly. # speaker: Odile
  - "leased": The Granary pays Juno rent in oil now and keeps a crew on her ladder, and she and her boy are still the keepers. The Senate calls that a lease. I call it a very polite purchase. # speaker: Odile
  - "plated": The Pierce clerk wrote the end post down as unknown, and a surveyor's coming to look at it. They tell me the oil will come as before, but the Corporation has your truck on a page by itself. # speaker: Odile
  - "held": The lamps burned all night, but the Corporation is sending armed men to Podfield next quarter. I wouldn't be on that road when they go. # speaker: Odile
  }
  -> hub
+ {count_fate != "none"} [About the wall at Old Orchard.]
  { count_fate:
  - "told": Ilya sent word that a household sealed a release for one truck. I said nothing then and I'll say nothing now, and so will you. # speaker: Odile
  - "painted": Ilya still counts the trucks each dawn and says the sum is right. I let him. It does him no harm, and I can't spare a man to argue. # speaker: Odile
  - "sold": Ilya has put a watch on the orchard edge. My tenants were hungry already, and now they're thieves in his book as well. # speaker: Odile
  - "posted": Ilya was made to give up his coat. He says the true number aloud at the gate every dawn now, to anyone who stops, and the patrol pretends not to hear. # speaker: Odile
  - "reclaimed": The missing truck's back in its row, and Ilya counts the right number again. Pierce is saying a driver stole its collateral. I didn't send you to Old Orchard, if anyone asks. # speaker: Odile
  - "pulled": The trucks beside the empty slot won't start, and Ilya hasn't noticed. He paints his number and goes in to his supper. I've decided not to tell him. # speaker: Odile
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
