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
- "delivered": Agnes Ondra. I took Mirela this week's figures myself, the top pipe line too, in my own hand. I didn't thank her and she didn't thank me. Your name is in her book, so mine doesn't have to be.
- "filed": Agnes Ondra. Mirela has the copy and no driver's name beside it. The steward calls it a forgery by a keeper with a grudge, and the drivers at the well believe him.
- "sold": Agnes Ondra. I sent the steward's oil back to the top terrace, every barrel. Whatever he paid you for my book, I want none of it near my pump.
- "read": Agnes Ondra. I stood at the back of the crowd at the Granary gate while my own lines were read out. Then I came home and shut the shed. Please go.
- "seized": Agnes Ondra. The patrol came and asked me about a book. I told them I never owned one, and I read them every gauge from memory. I named nobody.
- "metered": Agnes Ondra. My old meter sat on the top pipe for one night. The household took it off again, but its number is chalked on the Granary board, and nobody has dared wash it off. I haven't asked who fitted it, and I won't.
- "searched":
  Agnes's cot stands on its end by the door, and the pillow is slit open. The drum by the gate stands empty. Agnes doesn't look up from her gauge. She writes the number down and waits for you to leave.
  -> shunned
- else:
  { trusted:
    Agnes looks up from her dials, and then past you at the drum by the gate.
    Changed your mind about the road? # speaker: Agnes
    -> hub
  }
  The Pump Station sits behind a wall of stacked oil drums, and the whole place smells of hot iron and standing water. A woman in a canvas apron stands at a row of dials with a pencil stub and an open book, and she doesn't look up.
  A man in a grey coat sits on an upturned drum by the gate with a mug of tea.
  { skill("perception") >= 2: His tea stopped steaming a while ago, and he hasn't drunk any. He's listening to her. }
  Tank's by the drums if you want water. If you want to be useful while it fills, read me the big dial. My eyes are going. # speaker: Agnes
}
-> hub

= hub
# checkpoint: start.hub
+ {not knows_book} [Read her the big dial.]
  ~ knows_book = true
  You read her the number on the big dial. She writes it at the foot of a column, then swings the book round so you can see the page.
  Barrels a week; Pumped up from the floor; Out through the metered pipes; The top pipe's meter # head
  Last spring; 410; 390; 20 # row
  Midsummer; 380; 350; 30 # row
  Autumn; 350; 300; meter taken off # row
  This week; 300; 230; meter taken off # row
  The big dial counts what the pump brings up from the crater floor. Every other pipe has a meter. While the top pipe had one, it read the difference to the barrel. # speaker: Agnes
  Now it has none, and the difference grows every week. I write it down, and nobody reads it. # speaker: Agnes
  -> hub
+ {knows_book and not asked_leak} [Ask whether the pipes could just be leaking.]
  ~ asked_leak = true
  I walk every line once a month. A leak that size would leave the ground all mud, and the ground round my pipes is dust. # speaker: Agnes
  -> hub
+ {knows_book and not knows_pipe} [Ask which pipe has no meter.]
  ~ note("pipeBook")
  ~ knows_pipe = true
  The one up to the top terrace, where the Archon's household lives. The Archon heads the Senate, and the Senate sent an order with a seal on it, and I unbolted the meter myself. The pipe's still running. # speaker: Agnes
  { trusted:
    -> copy
  }
  The man in the grey coat puts his mug down and comes over. There is a lantern stitched on his collar.
  -> watched
+ {not asked_man and not trusted} [Ask the man on the drum what he's waiting for.]
  ~ asked_man = true
  My relief. # speaker: Watchman
  He says it to you, but he doesn't take his eyes off Agnes.
  -> hub
+ {not trusted and watchman != "told" and (skill("perception") >= 2 or watchman == "silent")} [Tell her the man on the drum is listening.]
  -> warned
+ {pipe_fate == "none" and knows_copy and not knows_why} [Ask why she picked you.]
  ~ knows_why = true
  { watchman == "covered": You lied to a grey coat for a pump keeper you'd only just met. | You saw him on his drum, and you told me instead of him. } # speaker: Agnes
  And a pump keeper on the Bowl road is a story before supper. A driver is one more truck in the dust. # speaker: Agnes
  And when the household asks who took my copy to the Bowl, the answer is a truck that's long gone. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy and not knows_pay} [Ask what the job pays.]
  ~ knows_pay = true
  Mirela pays {fee} M out of her lock box for carried proof. I've nothing to add to it. # speaker: Agnes
  The risk is the gate. The patrol there answers to the Senate, and the household's steward talks to the patrol. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy} [Say you'll carry it.]
  ~ begin("pump_pipe")
  -> END
+ [Fill your tank and go.]
  -> END

= watched
# checkpoint: start.watched
What's the pump keeper been telling you? # speaker: Watchman
+ [Tell him it was pump talk.]
  ~ watchman = "covered"
  You tell him she was on about pressures and pipes. He looks at you a while, then nods and goes back to his drum.
  -> copy
+ [Tell him what she said.]
  -> told
+ [Say nothing.]
  ~ watchman = "silent"
  You say nothing. He waits, then goes back to his drum, and he looks hard at your truck on the way.
  Agnes goes on writing. She doesn't look at you either.
  -> hub

= told
~ watchman = "told"
~ pipe_fate = "searched"
You tell him about the falling numbers and the pipe with no meter.
He takes a small purse out of his coat and holds it out to you.
The household thanks you. # speaker: Watchman
Agnes heard every word. She writes the next number down.
+ [Take the purse.]
  ~ marr_regard = "bought"
  ~ give_money(tip)
  You take it. It holds {tip} M.
  -> gone
+ [Leave it in his hand.]
  He shrugs and puts it away.
  It's all one to the household. # speaker: Watchman
  -> gone

= gone
Agnes doesn't look at you again. As you pull out of the yard, a pair of men in grey coats walk past your truck and into her shed.
-> END

= copy
~ trusted = true
~ knows_copy = true
{ watchman == "covered": Agnes comes back to the dials. She heard every word, and she talks low now. | She talks low, and she keeps her back to the drum. }
I made a copy of the book over the winter, and it's under my pillow. It belongs in the lock house at the bottom of the Bowl, beside Mirela Duarte's book. Mirela counts the water that reaches the canal. # speaker: Agnes
Her count beside mine, and nobody can call mine a grudge. # speaker: Agnes
-> hub

= shunned
+ [Goodbye.]
  -> END

= warned
~ trusted = true
Agnes doesn't look at the drum. She keeps writing and talks lower.
He watches for the household. He's sat on that drum since the spring. # speaker: Agnes
{ knows_pipe:
  -> copy
}
-> hub
