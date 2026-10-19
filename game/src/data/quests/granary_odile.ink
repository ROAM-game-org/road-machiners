INCLUDE world.ink

VAR asked_need = false
VAR asked_gate = false

=== start ===
# checkpoint: start
Odile Marsh, steward of the <term=granary>Granary</term>. Every sack that comes in and every crate that goes out, I write on the gate, so the whole road can read what we hold. If you carry sorgut, salt or water, the gate scale pays for it.
-> hub

= hub
# checkpoint: start.hub
+ [What does the Granary make?]
  Rations. We grind the sorgut, work it with salt and water, and bake it hard enough to keep through a winter. It goes out in crates to every stall that feeds a driver.
  The sorgut comes up from <term=bowl>Bowl</term>'s terraces, the salt from <term=nose>Nose</term> and the water from Dustwell. The mill and the ovens wear through tools, and the tools come from Nose too.
  { short_of("grain"):
    Sorgut's low. The Bowl trucks aren't coming in fast enough, so the mill stands half the day.
  }
  { short_of("salt"):
    Salt's low. Bread without salt goes green by spring, so I hold back what I make.
  }
  { short_of("water"):
    Water's low. No water, no dough, and the Dustwell trucks are late again.
  }
  { short_of("tools"):
    The press is on its last good wrench. When that goes, it's one batch where there were two.
  }
  -> hub
+ {not asked_need} [What do you need from a driver?]
  ~ asked_need = true
  Loads that arrive. The gate scale pays for sorgut, salt and water, and it pays more when my bins run low.
  They run low more often than the Senate likes to hear. A truck that doesn't arrive goes on the gate too, with the day it was due.
  -> hub
+ {not asked_gate} [Why write it all on the gate?]
  ~ asked_gate = true
  So nobody has to take my word for it. Beside what we hold, I write what we pay. A sack to <term=kiln>Kiln</term> for every one of our trucks they let pass. And the sacks the tenants give from their own share to pay Bowl's patrol.
  A truck Kiln lets pass comes in with its sorgut. My grandmother lived through the year the grain ran out, and she ate boiled sacking. I'd rather pay raiders every season than see that again.
  -> hub
+ [Goodbye.]
  Come back with something for the scale.
  -> END
