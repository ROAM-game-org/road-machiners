INCLUDE world.ink

VAR knows_book = false
VAR knows_pipe = false
VAR knows_copy = false

=== start ===
# checkpoint: start
{ pipe_fate:
- "delivered": Agnes Ondra. Mirela wrote back. Her book and mine agree now, and your name's in hers. I sleep a little better, though I notice I sleep with one ear open.
- "filed": Agnes Ondra. Mirela wrote that your name isn't in her book. So it's my word alone against a household, and a word like mine doesn't last long.
- "sold": Agnes Ondra. Nobody's asked me for my book since, and I don't like the quiet. Quiet like this usually means somebody already has what they wanted.
- "read": Agnes Ondra. They tell me my numbers were read out at the Granary gate. I only ever wanted them written down, but a number said aloud gets written in a great many heads.
- "seized": Agnes Ondra. The patrol has my copy. They haven't come for the first book, and I think they won't, because they know where it sleeps.
- "metered": Agnes Ondra. There's a meter on the Archon's pipe now, and I read it from the track with a glass every morning. I didn't put it there, and I've decided not to ask who did.
- else: Agnes Ondra. Pump book first, questions after.
}
-> hub

= hub
# checkpoint: start.hub
+ [What does the pump do?]
  It lifts seep water out of the crater floor and sends it up the terraces by pipe, with a meter on every line. I read each meter once a week and write the number in the pump book. For a year now I haven't liked the numbers. # speaker: Agnes
  ~ knows_book = true
  -> hub
+ {knows_book} [What's wrong with the numbers?]
  They keep falling. Every meter I read is lower than it was last spring, and I write each one down and nobody reads it. One pipe has no number at all, because the Senate made me take my meter off it. The pipe's still running. # speaker: Agnes
  I was afraid the Senate would take the book one day, so I made a second copy over the winter. # speaker: Agnes
  ~ note("pipeBook")
  ~ knows_pipe = true
  ~ knows_copy = true
  -> hub
+ {knows_pipe} [Why did the Senate take the meter off that pipe?]
  They said it was to stop the tenants panicking over the readings. The order came with a seal on it, so I unbolted the meter myself. # speaker: Agnes
  Ask the household of the Archon and they'll tell you the meter broke and nobody replaced it. Ask the Canal families and they'll say it never read true. I can only tell you what my book says, and it doesn't take sides. # speaker: Agnes
  -> hub
+ {pipe_fate == "none" and knows_copy} [Where's the second copy?]
  Under my pillow, wrapped in oilcloth with a wax seal on the knot. I trust the pillow more than any shelf. # speaker: Agnes
  I want it taken to Bowl and put in Mirela Duarte's hands. She keeps the Canal book in the lock house on the lowest canal, the water record the canal families keep for themselves. # speaker: Agnes
  -> pillow
+ [Goodbye.]
  -> END

= pillow
+ [Why not carry it yourself?]
  The patrol watches the pump road, and a pump keeper on the Bowl road would be a story before supper. A driver's only a driver, and nobody remembers which one. # speaker: Agnes
  -> pillow
+ [I will carry it.]
  ~ note("pipeBook")
  ~ begin("pump_pipe")
  -> END
+ [Not my road.]
  -> hub
