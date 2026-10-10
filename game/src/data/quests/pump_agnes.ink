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
  I took Mirela this week's numbers myself, the household's tanker too. Your name is in her book, so mine doesn't have to be. # speaker: Agnes
- "filed":
  Mirela has the copy, but no carrier's name is on it. The steward calls it a forgery, and people believe him. # speaker: Agnes
- "sold":
  I sent the steward's oil back. Whatever he paid you for my copy, keep it away from my pump. # speaker: Agnes
- "read":
  I heard my own numbers were read out in the Bowl market. Then I came home and shut the shed. Please go. # speaker: Agnes
- "seized":
  The patrol came and asked me about a copy. I said I never made one, and I named nobody. # speaker: Agnes
- "metered":
  My old meter sat on the household's tank for one night. They took it off, but its number is still chalked on the board in the Bowl market. I won't ask who fitted it. # speaker: Agnes
- "searched":
  Agnes's cot lies on its side by the door, and the pillow is cut open. The drum by the gate is empty. Agnes writes down a number and doesn't look up.
  -> shunned
- else:
  { trusted:
    Agnes looks up from her dials, then at the drum by the gate.
    Changed your mind about the copy? # speaker: Agnes
    -> hub
  }
  The Pump Station is a pumphouse behind a wall of oil drums. It smells of hot iron and wet stone. Water trucks wait in a line at the loading bay.
  A woman in a canvas apron stands at a row of dials. She copies each number into a book.
  A man in a grey coat sits on a drum by the gate with a mug of tea. He watches the woman, not you.
  { skill("perception") >= 2: His tea has gone cold, and he hasn't drunk any. He is listening to her. }
  Water's in the tank by the drums. Help yourself. # speaker: Agnes
}
-> hub

= hub
# checkpoint: start.hub
+ {not knows_book} [Ask what she's writing.]
  ~ knows_book = true
  She holds up the book so you can see it.
  Barrels a week; Pumped up; Loaded onto trucks in the book; Missing # head
  Last spring; 410; 390; 20 # row
  Midsummer; 380; 350; 30 # row
  Autumn; 350; 300; 50 # row
  This week; 300; 230; 70 # row
  Every truck that loads here goes in this book. The pump brings up less water every season, and more of it goes missing. # speaker: Agnes
  -> hub
+ {knows_book and not asked_leak} [Ask whether the water could be leaking.]
  ~ asked_leak = true
  A leak that big would make the ground muddy. I check the tanks every day, and the ground is dry. # speaker: Agnes
  -> hub
+ {knows_book and not knows_pipe} [Ask where the missing water goes.]
  ~ note("pipeBook")
  ~ knows_pipe = true
  Into the household's tanker. The Archon's household lives on the top terrace in Bowl, and the Archon runs the Senate. # speaker: Agnes
  Their tanker loads here every week. I used to put a meter on its hose, and it read the same as my missing column. Then the Senate sent an order, and I took the meter off. # speaker: Agnes
  Now the tanker loads and goes, and nobody writes it down. # speaker: Agnes
  { trusted:
    -> copy
  }
  The man in the grey coat puts down his mug and walks over. A lantern is stitched on his collar. It is the household's mark.
  -> watched
+ {not asked_man and not trusted} [Ask the man on the drum what he's waiting for.]
  ~ asked_man = true
  Just finishing my tea. # speaker: Watchman
  He doesn't look at you. He keeps watching Agnes.
  -> hub
+ {not trusted and watchman != "told" and (skill("perception") >= 2 or watchman == "silent")} [Tell her the man on the drum is listening.]
  -> warned
+ {pipe_fate == "none" and knows_copy and not knows_why} [Ask why she picked you.]
  ~ knows_why = true
  { watchman == "covered": You lied to the watchman for me. | You warned me about the watchman. } # speaker: Agnes
  People notice a pump keeper on the Bowl road. A driver is just one more truck. # speaker: Agnes
  And when the household asks who carried my copy, the answer is a driver who's long gone. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy and not knows_pay} [Ask what the job pays.]
  ~ knows_pay = true
  Mirela pays {fee} M from the lock house box when the copy arrives. I have nothing to add. # speaker: Agnes
  The danger is the Bowl gate. The patrol there works for the Senate, and the household's steward gives them orders. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy} [Say you'll carry the copy.]
  ~ begin("pump_pipe")
  -> END
+ [Fill your tank and go.]
  -> END

= watched
# checkpoint: start.watched
What's she been telling you? # speaker: Watchman
+ [Tell him she was talking about pump pressures.]
  ~ watchman = "covered"
  You tell him she was talking about pump pressures. He doesn't look convinced, but he goes back to his drum.
  -> copy
+ [Tell him what she said.]
  -> told
+ [Say nothing.]
  ~ watchman = "silent"
  You say nothing. He waits, then goes back to his drum. On the way he takes a long look at your truck.
  Agnes goes on writing. She doesn't look at you either.
  -> hub

= told
~ watchman = "told"
~ pipe_fate = "searched"
You tell him about the missing water and the household's tanker.
He takes a small purse from his coat and holds it out to you.
The household thanks you. # speaker: Watchman
Agnes heard all of it. She writes down the next number and doesn't look at you.
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
Agnes comes back to the dials and speaks quietly.
Over the winter I made a copy of this book. It's hidden under my pillow. # speaker: Agnes
It needs to go to Mirela Duarte at the lock house in Bowl. The water trucks unload into the canals there, and Mirela counts every barrel. # speaker: Agnes
If her count matches mine, nobody can say I made my numbers up. # speaker: Agnes
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
