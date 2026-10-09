INCLUDE world.ink

VAR heard_mount = false
VAR knows_emil = false
VAR heard_pin = false

=== start ===
# checkpoint: start
{ pin_pact == "silver":
  The desk at the post gate stands empty, and the ink on the blotter has dried to a grey skin. A clerk tells you that Mara Kessel sits in the post cell and that nobody is allowed to visit her.
  -> gone
}
Mara Kessel sits at a desk by the post gate with a pair of ledgers open in front of her. She writes a line in one, copies it with great care into the other, and does not look up until you are standing at the edge of the blotter.
{ pin_fate:
- "mara": The ring is where it ought to be, and I would rather not tell you where that is, since you are exactly the person who might be asked. # speaker: Mara
- "silver": The yard forge ran hot all night, and I smelled it from this desk. I will not pretend that I do not know what went into it. # speaker: Mara
- "sully": I hear the crane office has a new object in one of its drawers. That pleases me more than I am able to show on this side of the gate. # speaker: Mara
- "pierce": A clerk from the Pierce office came to this gate yesterday and asked me very politely for my brother's full name. I gave it to him, and I did not ask what it was for. # speaker: Mara
- else: Please keep your voice down. The captain hears a great deal for a man who appears to be reading. # speaker: Mara
}
-> hub

= hub
# checkpoint: start.hub
+ [Who are you?]
  ~ knows_emil = true
  I was an inspector of the Order Bureau, which is the office the Committee at Nose uses to investigate its own officials. These days I count patrols for Captain Silver, and Nose calls that a posting, although I would choose another word for it. # speaker: Mara
  My brother Emil drove the north road before I came here, and that is the reason I sit at this particular desk and not at another. # speaker: Mara
  -> hub
+ [Why do you write everything twice?]
  Because a page can be lost, and I learned in the Bureau that a page and its copy have to be lost separately, by different people, before anything is truly gone. # speaker: Mara
  -> hub
+ [Why does every truck here carry a gun?]
  ~ heard_mount = true
  The Old Army left, and since then nobody guards the open road between the towns, so each town watches only the ground near its own walls. Pierce is the company that insures salvage runs and lends money, and it writes a policy only for a truck that carries a gun on a proper mount, which means the gun became the price of the paper. # speaker: Mara
  Nose hands every driver a mount along with his gate pass when he leaves the town. I would not call it a good mount. # speaker: Mara
  -> hub
+ {heard_mount} [What is wrong with the Nose mount?]
  ~ heard_pin = true
  The gun sits on a ring that swivels across the truck bed, and a pin locks the ring where the driver wants it. The mount that Pierce insists on has a second pin on the far side, but the one Nose issues has only a single pin, and on a hard bend a single pin can slide, which lets the gun swing round into the cab. # speaker: Mara
  -> hub
+ {knows_emil} [What happened to your brother?]
  ~ heard_pin = true
  Emil drove the north road for Nose until the bend there took him last winter. His swivel, which is the ring and pin that let the gun swing across the bed, slid on the curve and swung the gun into his cab. # speaker: Mara
  The line had issued him that mount with a single pin together with his gate pass, and I have a long list of questions about that, none of which anyone in this yard has been willing to hear. # speaker: Mara
  -> hub
+ {pin_fate == "mara" and heard_mount} [Who at Pierce would care about a ring like this?]
  Constance Pierce, who is the head underwriter at their office in Nose, reads every file that crosses her desk and has never once read one by accident. If you go to her, ask who read my old case, and watch what her face does before she answers. # speaker: Mara
  -> hub
+ {pin_pact == "signed"} [What will you do with the pages I signed?]
  They are dry and safe, and a page with a witness is worth a great many without one. My old case also has a second copy lying in the same drawer, so if you ever need to read it, tell the Administrator that I said you may. # speaker: Mara
  -> hub
+ {post_file == "named"} [Does the post know my name?]
  The captain keeps a file on everyone who passes his gate, and yours is thicker than it was last week. I did not write the new lines in it, and I would very much like to know who did. # speaker: Mara
  -> hub
+ {crates_fate == "proof"} [Constance Pierce has proof against her cousin.]
  Then the Pierce board is holding my old case under another name, which is acceptable. A true thing can wear a great many names and still be true. # speaker: Mara
  -> hub
+ {pin_fate == "none" and knows_emil} [You look like someone with a problem.]
  There is one thing. When Emil's truck was found, the swivel was still bolted to the bed, but by the time anyone from the post rode out there it had been stripped, as wrecks on the north road usually are. # speaker: Mara
  I would like the ring that held his gun, the Nose steel one with the single pin hole in it. I cannot stop thinking about it, and I want to hold it in my own hands. # speaker: Mara
  I cannot go myself, because Captain Silver reads the gate book every morning and an officer of his post does not leave it. I also do not like to ask a favor of anyone who owes the post something, and you owe it nothing. # speaker: Mara
  ++ [I will find it.]
     ~ note("pinAsk")
     Thank you. Please tell nobody at the post, not even the soldiers who seem friendly. # speaker: Mara
     ~ begin("pin_emil")
     -> END
  ++ [Not my road.]
     I understand, and I would not have asked if I could do it myself. # speaker: Mara
     -> hub
+ [Goodbye.]
  -> END

= gone
# checkpoint: start.gone
+ [Goodbye.]
  -> END
