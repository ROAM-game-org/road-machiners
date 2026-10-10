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
  I heard what Mirela read out. Her trough, my hoses and your dial, and yours was the number they couldn't argue with. The tanker still comes, but its meter's back on, and I write it down. # speaker: Agnes
- "filed":
  Mirela read my numbers out, and the household asked where the driver was who read the dial. Nobody could say. The tanker still comes, and I still can't write it down. # speaker: Agnes
- "sold":
  I sent the steward's oil back. Whatever he paid you to forget my dial, keep it away from my pump. # speaker: Agnes
- "read":
  I heard my numbers were read out in the Bowl market. Then I came home and shut the shed. Please go. # speaker: Agnes
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
  The <term=pump_station>Pump Station</term> is a pumphouse behind a wall of oil drums. It smells of hot iron and wet stone. Water trucks wait in a line at the loading bay.
  Every hose at the bay has a meter box on it, except one. A big grey tanker with a lantern painted on its door is filling from that one. It sits low on its springs already.
  A woman in a canvas apron stands at a row of dials and copies each number into a book.
  A man in a grey coat sits on a drum by the gate with a mug of tea. He watches the woman, not you.
  { skill("perception") >= 2: His tea has gone cold, and he hasn't drunk any. He is listening to her. }
  Water's in the tank by the drums. Read me the big dial while you fill. Every driver does, and I write the number down with your name. # speaker: Agnes
}
-> hub

= hub
# checkpoint: start.hub
+ {not knows_book} [Read her the big dial.]
  ~ knows_book = true
  You read her the number. She writes it in the book and your name beside it, then holds the book up so you can see the page. You've never had your name in a pump book before.
  Barrels a week; Pumped up, by the big dial; Loaded onto Bowl's trucks, by their meters; Household tanker, by its meter # head
  Last spring; 410; 390; 20 # row
  Midsummer; 380; 350; 30 # row
  Autumn; 350; 300; meter taken off # row
  This week; 300; 230; meter taken off # row
  The pump brings up less every season, and Bowl's trucks get less too. # speaker: Agnes
  Until autumn the tanker's hose had a meter, and the columns added up to the barrel. Since the meter came off, the gap grows every week. # speaker: Agnes
  -> hub
+ {knows_book and not asked_leak} [Ask whether the water could be leaking.]
  ~ asked_leak = true
  A leak that big would make the ground muddy. I check the tanks every day, and the ground is dry. # speaker: Agnes
  Nothing leaves here except through a hose. One hose has no meter. # speaker: Agnes
  -> hub
+ {knows_book and not knows_pipe} [Ask why the tanker's meter came off.]
  ~ note("pipeBook")
  ~ knows_pipe = true
  The <term=senate>Senate</term> ordered it. That tanker belongs to the Archon's household. The Archon heads the Senate, and his household lives on the top terrace of <term=bowl>Bowl</term>. # speaker: Agnes
  Now the tanker loads and goes, and I'm not allowed to write it down. Whatever the gap is, that's what it takes. # speaker: Agnes
  { trusted:
    -> copy
  }
  The man in the grey coat puts down his mug and walks over. The same lantern is stitched on his collar as painted on the tanker's door.
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
  And your name is beside this week's dial. Every driver's name is in my book, but none of them will go to Bowl and say so. # speaker: Agnes
  People notice a pump keeper on the Bowl road. A driver is one more truck, and next week you're halfway across the basin. # speaker: Agnes
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
You tell him about the gap in the book and the tanker's missing meter.
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
It needs to go to Mirela Duarte at the lock house in Bowl. Bowl's trucks pour into her trough, and she counts every barrel. Her count will show my hose column is honest. # speaker: Agnes
The dial is the other half. Nobody in Bowl has read it. You have, and your name is beside the number. # speaker: Agnes
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
