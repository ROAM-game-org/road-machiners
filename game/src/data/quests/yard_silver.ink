INCLUDE world.ink

=== start ===
# checkpoint: start
{ pin_pact == "silver": Captain Silver stands at the post gate with his hands behind him. A single ledger lies open on his table now. }
{ pin_pact != "silver": Captain Silver stands at the post gate with his hands behind him. He does not offer a seat. }
{ bend_fate:
- "silver": The north bend is quiet now. My drivers pass it without trouble. Do not make me thank you. # speaker: Silver
- "kiln": I hear a Kiln rider sat at the north bend this week. You did that, or you let it be done. Remember who pays better. # speaker: Silver
- "ash": I hear the man at the north bend still stops my drivers. I hear you were there. # speaker: Silver
- else: State your business. # speaker: Silver
}
-> hub

= hub
# checkpoint: start.hub
+ [What is your post doing here?]
  Keeping the Yard safe for honest haulers. The crews cannot hold the gate against raiders. My soldiers can. # speaker: Silver
  -> hub
+ [Why does Nose want the Yard?]
  Nose wants nothing the Yard does not already owe it. # speaker: Silver
  -> hub
+ [Why does every truck carry a gun?]
  Because the Army is gone and nobody patrols the road. Each town guards its own walls. # speaker: Silver
  Nose lets no truck out of its gate without a gun, and the line gives it a mount with the pass. A truck that leaves unarmed is a gift to the raiders. # speaker: Silver
  -> hub
+ [Is the Nose mount safe?]
  It is steel. It swings. It locks. A driver who knows his mount does not have trouble with it. # speaker: Silver
  -> hub
+ {bend_fate == "none"} [Is there work for me?]
  A man sits on the north bend and stops my drivers. He asks to see their pins and tells them our mounts are bad. # speaker: Silver
  A post cannot run on talk. Move him off the bend. How you do it is your business. I pay well. # speaker: Silver
  ++ [I will see him.]
     ~ note("bendOffers")
     Do not bring me excuses. # speaker: Silver
     ~ begin("bend_north")
     -> END
  ++ [Not my kind of work.]
     Then do not waste my time. # speaker: Silver
     -> hub
+ [Goodbye.]
  -> END
