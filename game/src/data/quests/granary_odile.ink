INCLUDE world.ink

VAR asked_need = false
VAR asked_gate = false

=== start ===
# checkpoint: start
Odile Marsh, steward of the <term=granary>Granary</term>. My gate stays open all day, so anyone on the road can see what fills our bins and what goes out to <term=kiln>Kiln</term>. If you carry sorgut, salt or water, the gate scale pays for it.
-> hub

= hub
# checkpoint: start.hub
+ [What does the Granary make?]
  Rations. We grind the sorgut, cook it with salt and water, and seal it in tins that keep through a winter. It goes out in crates to every stall that feeds a driver.
  The sorgut comes up from <term=bowl>Bowl</term>'s terraces, the salt from <term=nose>Nose</term> and the water from Dustwell. The mill and the tin press wear through tools, and the tools come from Nose too.
  { short_of("grain"):
    Sorgut's low. The Bowl trucks aren't coming in fast enough, so the mill stands half the day.
  }
  { short_of("salt"):
    Salt's low. Unsalted mash spoils in the tin, so I hold back what I make.
  }
  { short_of("water"):
    Water's low. No water, no mash, and the Dustwell trucks are late again.
  }
  { short_of("tools"):
    The press is on its last good wrench. When that goes, it's one batch where there were two.
  }
  -> hub
+ {not asked_need} [What do you need from a driver?]
  ~ asked_need = true
  Loads that arrive. The gate scale pays for sorgut, salt and water, and it pays more when my bins run low.
  They run low more often than the Senate likes to hear. Dust shuts the roads, and the bins keep emptying while I watch the gate.
  -> hub
+ {not asked_gate} [Why keep the gate open?]
  ~ asked_gate = true
  So nobody has to take my word for what the Granary pays. The crates by the gate go to <term=kiln>Kiln</term>, so they let our trucks pass. The patrol's grain comes from the tenants' share and goes out through this same gate.
  A truck Kiln lets pass comes in with its sorgut. My grandmother lived through the year the grain ran out, and she ate boiled sacking. I'd rather pay raiders every season than see that again.
  -> hub
+ [Goodbye.]
  Come back with something for the scale.
  -> END
