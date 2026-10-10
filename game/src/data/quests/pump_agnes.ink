INCLUDE world.ink

VAR knows_book = false
VAR knows_pipe = false
VAR knows_copy = false
VAR knows_senate = false
VAR knows_marr = false
VAR knows_carry = false
VAR knows_why = false
VAR knows_pay = false
VAR trusted = false
VAR watchman = "sitting"
VAR tip = 20

=== start ===
# checkpoint: start
{ pipe_fate:
- "delivered": Agnes Ondra. Mirela wrote back. Her book and mine agree now, and your name's in hers. I sleep a little better, though I notice I sleep with one ear open.
- "filed": Agnes Ondra. Mirela wrote that your name isn't in her book. So it's my word alone against a household, and a word like mine doesn't last long.
- "sold": Agnes Ondra. Nobody's asked me for my book since, and I don't like the quiet. Quiet like this usually means somebody already has what they wanted.
- "read": Agnes Ondra. They tell me my numbers were read out at the Granary gate. I only ever wanted them written down, but a number said aloud gets written in a great many heads.
- "seized": Agnes Ondra. The patrol has my copy. They haven't come for the first book, and I think they won't, because they know where it sleeps.
- "metered": Agnes Ondra. There's a meter on the Archon's pipe now, and I read it from the track with a glass every morning. I didn't put it there, and I've decided not to ask who did.
- "searched":
  Agnes's cot stands on its end by the door, and the pillow is slit open. Agnes doesn't look up from her gauge. She writes the number down and waits for you to leave.
  -> shunned
- else:
  The Pump Station sits behind a wall of stacked oil drums, and the whole place smells of hot iron and wet rope. A woman in a canvas apron stands at a gauge with a pencil stub, and she doesn't look up.
  A man in a grey coat sits on an upturned drum by the gate with a mug of tea.
  { skill("perception") >= 2: The tea stopped steaming a while ago, and he hasn't drunk any. He's listening to her. }
  Agnes Ondra. Let me get this number down, then ask what you like. # speaker: Agnes
}
-> hub

= hub
# checkpoint: start.hub
+ {not knows_book} [What are you writing?]
  ~ knows_book = true
  The pump book. The pump lifts seep water out of the crater floor and sends it up the terraces by pipe, with a meter on every line. I read each meter once a week and write the number down. For a year now I haven't liked the numbers. # speaker: Agnes
  -> hub
+ {knows_book and not knows_pipe} [What's wrong with the numbers?]
  ~ note("pipeBook")
  ~ knows_pipe = true
  They keep falling. Every meter I read is lower than it was last spring, and I write each one down and nobody reads it. One pipe has no number at all, because the Senate made me take my meter off it. The pipe's still running. # speaker: Agnes
  { trusted:
    ~ knows_copy = true
    She says the rest so low that you have to lean in.
    I made a second copy of the book over the winter. Nobody knows that, and the man on the drum doesn't either. # speaker: Agnes
    -> hub
  }
  Agnes goes off to read the next gauge. The man in the grey coat puts his mug down and comes over, and you see a lantern stitched on his collar.
  -> watched
+ {not trusted and watchman != "told" and (skill("perception") >= 2 or watchman == "silent")} [Tell her the man by the drums is listening.]
  -> warned
+ {knows_pipe and not knows_senate} [Why did the Senate take the meter off that pipe?]
  ~ knows_senate = true
  They said it was to stop the tenants panicking over the readings. The order came with a seal on it, so I unbolted the meter myself. # speaker: Agnes
  That pipe runs up to the top terrace, and the top terrace belongs to the Marr. # speaker: Agnes
  -> hub
+ {knows_senate and not knows_marr} [Who are the Marr?]
  ~ knows_marr = true
  The Archon's household. Gideon Marr sits at the head of the Senate, and his family has held the top terrace since before the Bowl had a wall. Their people wear grey coats with a lantern stitched on the collar. # speaker: Agnes
  The Canal families keep their own count of the water at the Bowl's locks, and they've never liked the top terrace. I only keep the book. # speaker: Agnes
  -> hub
+ {trusted and not knows_why} [Why trust me with it?]
  ~ knows_why = true
  { watchman == "covered": You lied to a grey coat for a pump keeper you met this morning. | Most drivers never see him on his drum, or they see him and tell him what I said. } # speaker: Agnes
  And you don't drink from my pipes. Everybody in the Bowl owes somebody on the terraces. You don't. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy} [Where's the second copy?]
  Under my pillow, wrapped in oilcloth with a wax seal on the knot. I trust the pillow more than any shelf. # speaker: Agnes
  I want it in Mirela Duarte's hands. She keeps the Canal families' water book in the lock house on the Bowl's lowest canal. Her cousin Tomas asked the wrong question about that pipe, and the Senate punished him with a patrol coat and the dullest post in the Bowl. # speaker: Agnes
  -> pillow
+ [Goodbye.]
  -> END

= pillow
+ {not knows_carry} [Why not carry it yourself?]
  ~ knows_carry = true
  The patrol watches the pump road, and a pump keeper on the Bowl road would be a story before supper. A driver on that road is one more truck in the dust. Mostly. # speaker: Agnes
  -> pillow
+ {not knows_pay} [What's in it for me?]
  ~ knows_pay = true
  Not much from me. Mirela pays for her own proof, and the Canal families remember who carried it. On a dry road that's worth more than my coin. # speaker: Agnes
  -> pillow
+ [I will carry it.]
  ~ note("pipeBook")
  ~ begin("pump_pipe")
  -> END
+ [Not my road.]
  -> hub

= watched
# checkpoint: start.watched
What's the pump keeper been telling you? # speaker: Watchman
+ [Pump talk. Pressures and pipes, and none of it worth the hearing.]
  ~ watchman = "covered"
  ~ trusted = true
  ~ knows_copy = true
  He looks at you a while, then nods and goes back to his drum.
  Agnes comes back with her pencil. She heard every word, and she talks low now.
  I made a second copy of the book over the winter. Nobody knows that, and the man on the drum doesn't either. # speaker: Agnes
  -> hub
+ [She says the numbers are falling, and one pipe has no meter.]
  ~ watchman = "told"
  ~ pipe_fate = "searched"
  ~ marr_regard = "bought"
  ~ give_money(tip)
  He listens to all of it and presses {tip} M into your hand. The household thanks you. # speaker: Watchman
  Agnes heard every word. She writes the next number down and doesn't look at you again.
  -> END
+ [Say nothing.]
  ~ watchman = "silent"
  You say nothing. He waits, then goes back to his drum, and he looks hard at your truck on the way.
  -> hub

= shunned
+ [Goodbye.]
  -> END

= warned
~ trusted = true
Agnes doesn't look at the drums. She keeps writing and talks lower.
He watches for the top terrace. He's sat on that drum since the Senate took my meter. # speaker: Agnes
{ knows_pipe:
  ~ knows_copy = true
  I made a second copy of the book over the winter. Nobody knows that, and the man on the drum doesn't either. # speaker: Agnes
}
-> hub
