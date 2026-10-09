INCLUDE world.ink

VAR knows_emil = false
VAR heard_pin = false
VAR heard_pierce = false

=== start ===
# checkpoint: start
{ pin_pact == "silver":
  The desk at the post gate stands empty, and the ink on the blotter has dried to a grey skin. A clerk says that Mara Kessel sits in the post cell and that nobody may visit her.
  -> gone
}
Mara Kessel sits at a desk by the post gate with a pair of ledgers open in front of her. She writes a line in one and copies it with great care into the other. She doesn't look up until you're standing at the edge of the blotter.
{ pin_fate:
- "mara": The ring is where it ought to be. I'd rather not say where, since you're exactly the person who might be asked. # speaker: Mara
- "silver": The yard forge ran hot all night. I smelled it from this desk, and I won't pretend I don't know what went into it. # speaker: Mara
- "sully": I hear the crane office has a new object in one of its drawers. That pleases me more than I can show on this side of the gate. # speaker: Mara
- "pierce": A clerk from the Pierce office came to this gate yesterday. He asked me very politely for my brother's full name, and I gave it to him without asking why. # speaker: Mara
- else: Please keep your voice down. The captain hears a great deal for a man who seems to be reading. # speaker: Mara
}
-> hub

= hub
# checkpoint: start.hub
+ [Who are you?]
  ~ knows_emil = true
  I'm Mara Kessel, and I used to be an inspector of the Order Bureau. That's the office Nose uses to look into its own officials. # speaker: Mara
  These days I count patrols for Captain Silver, which Nose calls a posting. My brother Emil drove the north road before I came here, and that's why I sit at this desk and not another. # speaker: Mara
  -> hub
+ [Why do you write everything twice?]
  Because a page can be lost. I learned in the Bureau that a page and its copy have to be lost separately, by different people, before anything is truly gone. # speaker: Mara
  -> hub
+ {knows_emil} [What happened to your brother?]
  ~ heard_pin = true
  He died on the north bend last winter. His gun came round on its ring and into his cab, because the pin that should have held it slid on the curve. # speaker: Mara
  The ring that carries the gun is called a swivel. Emil's had a single pin, where a safe one has a pin on each side, and Nose issued it to him that way with his gate pass. # speaker: Mara
  -> hub
+ {heard_pin} [Why would Nose issue a mount with one pin?]
  ~ heard_pierce = true
  To save steel, I'd guess, and an hour of a machinist's time. The line copies a better mount and leaves out whatever is cheap to leave out. # speaker: Mara
  Pierce, the company that insures salvage runs, won't write paper on a one-pin mount. But Nose drivers don't buy Pierce paper. They buy a gate pass, and the Yard bores the second pin for a fee if they can afford it. Emil couldn't, not before payday. # speaker: Mara
  -> hub
+ {pin_fate == "mara" and heard_pierce} [Who at Pierce would care about a ring like this?]
  Constance Pierce, the head underwriter at their office in Nose. She reads every file that crosses her desk, and she's never read one by accident. # speaker: Mara
  If you go to her, ask who read my old case. Then watch her face before she answers. # speaker: Mara
  -> hub
+ {pin_pact == "signed"} [What will you do with the pages I signed?]
  Keep them dry, mostly. A page with a witness is worth a great many without one. # speaker: Mara
  My old case has a second copy in the same drawer. If you ever need to read it, tell the Administrator I said you may. # speaker: Mara
  -> hub
+ {post_file == "named"} [Does the post know my name?]
  It does. The captain keeps a file on everyone who passes his gate, and yours is thicker than it was last week. # speaker: Mara
  I didn't write the new lines in it, and I'd very much like to know who did. # speaker: Mara
  -> hub
+ {crates_fate == "proof"} [Constance Pierce has proof against her cousin.]
  Then the Pierce board is holding my old case under another name. That's fine. A true thing can wear a great many names and still be true. # speaker: Mara
  -> hub
+ {pin_fate == "none" and knows_emil} [You look like someone with a problem.]
  There's one thing. When Emil's truck was found, the swivel was still bolted to the bed. By the time anyone from the post rode out there, it had been stripped, as wrecks on the north road usually are. # speaker: Mara
  I'd like the ring that held his gun, the Nose steel one with the single pin hole in it. I can't stop thinking about it. I want to hold it in my own hands. # speaker: Mara
  I can't go myself, because the captain reads the gate book every morning and an officer of his post doesn't leave it. I also don't like to ask favors of anyone who owes the post something, and you owe it nothing. # speaker: Mara
  ++ [I'll find it.]
     ~ note("pinAsk")
     Thank you. Please tell nobody at the post, not even the soldiers who seem friendly. # speaker: Mara
     ~ begin("pin_emil")
     -> END
  ++ [Not my road.]
     I understand. I wouldn't have asked if I could do it myself. # speaker: Mara
     -> hub
+ [Goodbye.]
  -> END

= gone
# checkpoint: start.gone
+ [Goodbye.]
  -> END
