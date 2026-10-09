INCLUDE world.ink

VAR heard_mounts = false
VAR asked_mounts = false
VAR heard_box = false
VAR asked_box = false
VAR heard_kessel = false
VAR asked_kessel = false
VAR heard_case = false
VAR asked_case = false

=== start ===
# checkpoint: start
Order Bureau, records. Keep your voice down, please. The corridor listens.
-> hub

= hub
# checkpoint: start.hub
+ [What does the Bureau do?]
  We keep files, and each file keeps a person. Please don't ask me whose. I sign for the steel mounts the line hands out with the gate passes. On market days I carry the Committee's account box to the Pierce office, where the insurers sit. Those are the errands I'm trusted with.
  ~ heard_box = true
  ~ heard_mounts = true
  -> hub
+ {heard_mounts and not asked_mounts} [What is wrong with the steel mounts?]
  Every one of them has a single pin. I signed for each one anyway. That's the part I think about at night. The first file I opened on the matter was the death of a driver named Emil Kessel.
  ~ asked_mounts = true
  ~ heard_kessel = true
  -> hub
+ {heard_box and not asked_box} [What is in the account box?]
  I don't know. It goes in heavy and comes back lighter. I don't open it, and I don't count what's inside. A clerk who counts is a clerk who gets asked questions later.
  ~ asked_box = true
  -> hub
+ {heard_kessel and not asked_kessel} [Tell me about Emil Kessel.]
  I filed it. He was a driver on the north bend. His mount slid on its single pin and swung the gun into the cab. A captain signed the file, and nobody wrote a word about the pin. His sister is an inspector of this Bureau, Mara Kessel. She serves at the Army post inside the Salvage Yard now, and she doesn't come to this corridor. She once proved a case in these rooms. It's closed.
  ~ asked_kessel = true
  ~ heard_case = true
  -> hub
+ {heard_case and not asked_case} [What case did she prove?]
  I only say what the corridor says. A clerk at the Pierce office sold the roads of insured trucks to robbers. When it came out, he was sent west and told to stay. The Bureau had a case, and the case is closed. I carry the box that closed it.
  ~ note("talkClerkWest")
  ~ asked_case = true
  -> hub
+ {depot_thief != "none" and depot_thief != "open"} [What about the depot business?]
  { depot_thief:
  - "vance": Corporal Vance. His file came to us by dusk. The Army likes a short file.
  - "pell": Pell's in a cell, and no page in my box says why. A cell with no page is a Bureau habit. I don't like it.
  - "bought": Dispatch says the depot's clean. A clean report with no file behind it gets read twice in this corridor.
  - else: The trail's gone cold, and cold trails go in the drawer.
  }
  -> hub
+ [Goodbye.]
  -> END
