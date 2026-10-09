INCLUDE world.ink

=== start ===
# checkpoint: start
{ pin_pact:
- "silver": The desk at the post gate stands empty. A clerk says Mara Kessel sits in the post cell, and nobody visits.
  -> gone
}
Mara Kessel sits at the post gate desk with her ledgers open. She writes a line in one, then copies it into the other.
{ pin_fate:
- "mara": The ring is where it should be. Do not ask where. # speaker: Mara
- "silver": The yard forge ran hot last night. I smelled it from here. # speaker: Mara
- "sully": I hear the crane office has a new thing in its drawer. Good. # speaker: Mara
- else: Keep your voice low. The captain hears well. # speaker: Mara
}
-> hub

= hub
# checkpoint: start.hub
+ [Who are you?]
  I was an inspector of the Order Bureau. Now I count patrols for Captain Silver. Nose calls that a posting. # speaker: Mara
  -> hub
+ [Why do you write everything twice?]
  A page can be lost. A page and its copy must both be lost. # speaker: Mara
  -> hub
+ [Why does every truck here carry a gun?]
  The Army left, and nobody patrols the open road. Each town guards its own walls and no more. Pierce insures only armed trucks, so the gun became the price of a policy. # speaker: Mara
  Nose hands out a mount with the gate pass. I do not say it is a good mount. # speaker: Mara
  -> hub
+ [What happened to your brother?]
  Emil drove the north road for Nose. The bend took him last winter. His swivel slid and the gun came round into his cab. # speaker: Mara
  The mount had one pin. The line issued it that way with his gate pass. # speaker: Mara
  -> hub
+ {pin_fate == "mara"} [Do you know someone at the Pierce office?]
  Constance Pierce reads every file that crosses her desk, and none of them twice by accident. If you go to her, ask her who read my old case. # speaker: Mara
  -> hub
+ {crates_fate == "proof"} [Constance Pierce has proof against her cousin.]
  Then the Pierce board has my old case with another name on it. Fine. A true thing wears many names. # speaker: Mara
  -> hub
+ {pin_fate == "none"} [You look like someone with a problem.]
  I want the gun mount from Emil's wreck. The wreck lay on the north road for a season, and strippers got there first. # speaker: Mara
  Bring me the mount. It is Nose steel, and it has one pin. I need to hold it in my hands. # speaker: Mara
  ++ [I will find it.]
     ~ note("pinAsk")
     Thank you. Tell nobody at the post. # speaker: Mara
     ~ begin("pin_emil")
     -> END
  ++ [Not my road.]
     I understand. # speaker: Mara
     -> hub
+ [Goodbye.]
  -> END

= gone
# checkpoint: start.gone
+ [Goodbye.]
  -> END
