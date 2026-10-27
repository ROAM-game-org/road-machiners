INCLUDE world.ink

VAR knows_book = false
VAR knows_pipe = false
VAR knows_copy = false
VAR knows_why = false
VAR knows_pay = false
VAR asked_man = false
VAR asked_leak = false
VAR fee = 60
VAR trusted = false
VAR watchman = "sitting"
VAR tip = 20

=== start ===
# checkpoint: start
{ pipe_fate:
- "delivered":
  I heard Mirela showed the Senate the cloth with your hand on it, and they couldn't argue with that. The steward's own crew put the glass window back on the household truck's hose. # speaker: Agnes
- "filed":
  Mirela showed her cloth to the Senate, and nobody could answer when the household asked where the driver who stood at the tank wall was. The household truck still fills first, and I'm still not allowed to ask where the water goes. # speaker: Agnes
- "sold":
  I sent his oil back, and whatever he paid you to forget my tank wall, you keep away from my pump. # speaker: Agnes
- "read":
  I heard you held my cloth up in the Bowl market. Then I came home and shut the shed. Take your truck and go. # speaker: Agnes
- "seized":
  The patrol came and asked me about a copy. I said I never made one, and I named nobody. # speaker: Agnes
- "metered":
  My old glass stayed on their tank one night before they took it off, but the market still talks about what ran through it. I won't ask who fitted my old glass to their tank. # speaker: Agnes
- "searched":
  Agnes's cot lies on its side by the door, and the pillow is cut open. The drum by the gate is empty. Agnes wipes a ring on the tank wall and doesn't look up.
  -> shunned
- else:
  { trusted and knows_copy:
    Agnes looks up from the tank wall, then at the drum by the gate.
    Changed your mind about the copy? # speaker: Agnes
    -> hub
  }
  <term=dustwell>Dustwell</term> is a small square of rusted corrugated walls round a pumpjack that nods over the well. It smells of hot iron and wet stone. Pipes run from the well to the tall tanks, where trucks loaded with empty barrels wait in a line.
  Every hose at the tanks has a glass window in it, except one. A big grey truck with a lantern painted on its door is filling its barrels from that one, at the back of the tanks. It did not wait in the line, and it sits low on its springs already.
  A woman in a canvas apron walks along the tank wall with a rag, wiping the dust off the dark rings the water left on it.
  A man in a grey coat sits on a drum by the gate with a mug of tea. He watches the woman, not you.
  { skill("perception") >= 2: His tea has gone cold, and he hasn't drunk any. He is listening to her. }
  Water's in the tank by the lean-to drums. Wait behind the last truck at the hoses. The tank is low. # speaker: Agnes
}
-> hub

= hub
# checkpoint: start.hub
+ {not knows_book} [Watch the tank with her while a Bowl truck fills.]
  ~ knows_book = true
  You stand with Agnes at the tank wall while a Bowl truck fills. The water sinks down the wall past ring after ring, until the hose draws air. The truck pulls out with empty places in its rows, and a thumb of grey pump clay on every bung.
  Behind the tanks, the household truck pulls out with every barrel full. Its springs sag under the load.
  Every truck in that line has left short since autumn except the household truck. # speaker: Agnes
  Last spring the water stood at the top ring on this wall, and now it stands at my knee. # speaker: Agnes
  Until autumn, the household truck's hose had a glass window like the others, and it waited in the same line. Since that window came off, the tank runs dry before the last truck gets its water. # speaker: Agnes
  -> hub
+ [Ask about the water…]
  -> about_water
+ {(not asked_man and not trusted) or (not trusted and watchman != "told" and (skill("perception") >= 2 or watchman == "silent"))} [Ask about the man on the drum…]
  -> about_drum
+ {pipe_fate == "none" and knows_copy} [Ask about the job…]
  -> about_job
+ [Fill your tank and go.]
  -> END

= about_water
+ {knows_book and not asked_leak} [Ask whether the water could be leaking.]
  ~ asked_leak = true
  A leak that big would make the ground muddy. I check the tanks every day, and the ground is dry. # speaker: Agnes
  Nothing leaves here except through a hose. One hose has no glass window. # speaker: Agnes
  -> about_water
+ {knows_book and not knows_pipe} [Ask why the household truck's hose has no window.]
  ~ note("pipeBook")
  ~ knows_pipe = true
  The <term=senate>Senate</term> ordered it. That truck belongs to the Archon's household. The Archon carries out what the Senate decides, and his household lives on the top terrace of <term=bowl>Bowl</term>. # speaker: Agnes
  The household truck fills first now, and I may not keep it waiting or ask where it goes. Whatever goes into that hose comes out of Bowl's share. # speaker: Agnes
  { trusted:
    -> copy
  }
  The man in the grey coat puts down his mug and walks over. The lantern painted on the household truck's door is stitched on his collar too.
  -> watched
+ [Ask what Dustwell sends out.]
  Water, from deep rock. The pumpjacks bring it up, and the trucks carry it down to <term=bowl>Bowl</term>'s canals and to the <term=granary>Granary</term>. # speaker: Agnes
  The pumpjacks wear out tools. <term=nose>Nose</term> makes them, and somebody has to bring them up the road. # speaker: Agnes
  { works_down():
    The pump's broken down, and the jack hangs still over the well. # speaker: Agnes
  }
  { short_of("tools"):
    The crews are out of tools. One more stripped bolt and my well runs at half. # speaker: Agnes
  }
  -> about_water
+ [Back.]
  -> hub

= about_drum
+ {not asked_man and not trusted} [Ask the man on the drum what he's waiting for.]
  ~ asked_man = true
  Just finishing my tea. # speaker: Watchman
  He doesn't look at you. He keeps watching Agnes.
  -> about_drum
+ {not trusted and watchman != "told" and (skill("perception") >= 2 or watchman == "silent")} [Tell her the man on the drum is listening.]
  -> warned
+ [Back.]
  -> hub

= about_job
+ {pipe_fate == "none" and knows_copy and not knows_why} [Ask why she picked you.]
  ~ knows_why = true
  { watchman == "covered": You lied to the watchman for me. | You warned me about the watchman. } # speaker: Agnes
  You stood at the tank wall with me and watched the household truck fill. Every driver who fills here has watched the tank sink, but none will go to Bowl and say so. # speaker: Agnes
  People notice a pump keeper on the Bowl road. A driver is one more truck, and next week you're halfway across the basin. # speaker: Agnes
  -> about_job
+ {pipe_fate == "none" and knows_copy and not knows_pay} [Ask what the job pays.]
  ~ knows_pay = true
  Mirela pays {fee} M from the lock house box when the copy arrives. I have nothing to add. # speaker: Agnes
  The danger is the Bowl gate. The patrol there works for the Senate, and the household's steward gives them orders. # speaker: Agnes
  -> about_job
+ {pipe_fate == "none" and knows_copy} [Say you'll carry the copy.]
  ~ begin("pump_pipe")
  -> END
+ [Back.]
  -> hub

= watched
# checkpoint: start.watched
What's she been telling you? # speaker: Watchman
+ [Tell him she was talking about pump pressures.]
  ~ watchman = "covered"
  He doesn't look convinced, but he goes back to his drum.
  -> copy
+ [Tell him what she said.]
  -> told
+ [Say nothing.]
  ~ watchman = "silent"
  He waits, then goes back to his drum. On the way he takes a long look at your truck.
  Agnes goes on writing. She doesn't look at you either.
  -> hub

= told
~ watchman = "told"
~ pipe_fate = "searched"
You tell him about the cloth and the household truck's bare hose.
He takes a small purse from his coat and holds it out to you.
The household thanks you. # speaker: Watchman
Agnes heard all of it. She wipes the next ring and doesn't look at you.
+ [Take the purse.]
  ~ marr_regard = "bought"
  ~ give_money(tip)
  You take it. It holds {tip} M.
  -> gone
+ [Leave it in his hand.]
  He shrugs and puts it away.
  -> gone

= gone
As you drive out, household men in grey coats walk past your truck and into Agnes's shed.
-> END

= copy
~ trusted = true
~ knows_copy = true
Agnes stays at the tank wall and lowers her voice.
Over the winter I pressed a cloth to the tank wall and drew the rings on it, and it's under my pillow in the shed behind me. Take the cloth to Mirela Duarte at the lock house in Bowl. # speaker: Agnes
Mirela will see Bowl's trucks reach the trough as short as they left here, with the pump clay still whole on every bung, and nobody can say the water went missing on the road. # speaker: Agnes
Nobody in Bowl has seen this tank wall, but you have, and Mirela can speak for the trough while you speak for the wall. # speaker: Agnes
-> hub

= shunned
+ [Goodbye.]
  -> END

= warned
~ trusted = true
Agnes doesn't look at the drum. She keeps writing and speaks quietly.
He works for the household. He's been on that drum since spring. # speaker: Agnes
{ knows_pipe:
  -> copy
}
-> hub
