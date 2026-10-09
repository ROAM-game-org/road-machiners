INCLUDE world.ink

=== start ===
# checkpoint: start
Order Bureau. Records. Keep your voice down. The corridor listens.
-> hub

= hub
# checkpoint: start.hub
+ [What does the Bureau do?]
  We keep files. A file keeps a person. Do not ask me whose.
  -> hub
+ [Who writes the gate law?]
  Command. No truck leaves Nose without a gun. The line hands each driver a steel mount with the gate pass. One pin. I have signed for every one.
  -> hub
+ [Tell me about Emil Kessel.]
  I filed it. Driver, north bend, mount slid, gun swung into the cab. Signed by a captain. Nobody wrote a word about the pin.
  His sister is at the Yard post now. Inspector Mara Kessel. She does not come to this corridor.
  -> hub
+ [Did a Pierce clerk go missing?]
  I only say what the corridor says. A clerk at the Pierce office sold the roads of insured trucks to robbers. When it came out, he was sent west and told to stay.
  The Bureau had a case. The case is closed. I carry the box that closed it.
  ~ note("talkClerkWest")
  -> hub
+ [What do you carry to the Pierce office?]
  The Committee's account box, on market days. It goes in heavy and comes back lighter. I do not open it.
  -> hub
+ {depot_thief != "none" and depot_thief != "open"} [What about the depot business?]
  { depot_thief:
  - "vance": Vance. His file came to us by dusk. The Army likes a short file.
  - "pell": Pell. In a cell, and no page in my box says why. A cell with no page is a Bureau habit. I do not like it.
  - "bought": Dispatch says the depot is clean. A clean report with no file behind it. We read those twice.
  - else: The trail is cold. Cold trails go in the drawer.
  }
  -> hub
+ [Goodbye.]
  -> END
