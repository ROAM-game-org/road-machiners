INCLUDE world.ink

=== start ===
# checkpoint: start
{ pipe_fate:
- "delivered": Agnes Ondra. Mirela wrote back. Her book and mine say the same thing now. I sleep a little better.
- "sold": Agnes Ondra. Nobody has asked me for my book since. I do not like the quiet.
- "read": Agnes Ondra. They tell me my numbers were read out at the Granary gate. I only wanted them written down.
- else: Agnes Ondra. Pump book first, questions after.
}
-> hub

= hub
# checkpoint: start.hub
+ [What does the pump do?]
  It lifts seep water out of the crater floor and sends it up the terraces. Every drop goes through a meter, and every meter goes into the book. # speaker: Agnes
  -> hub
+ [Is the water running low?]
  Every meter I read is lower than last spring. I write it down and nobody reads it. # speaker: Agnes
  ~ note("pipeBook")
  -> hub
+ [Who kept the book before you?]
  My uncle Wendell. He died at the Green Pit sluice. Before him there was Rafe Ondra, who died with the book open on his knees. # speaker: Agnes
  -> hub
+ {pipe_fate == "none"} [What is under your pillow?]
  The pump book. A copy, I mean. I made one in case the Senate takes the first. # speaker: Agnes
  There is a pipe that climbs to the top terrace. It has no meter. The Senate made me take mine off it. The pipe still runs. # speaker: Agnes
  I want the copy at South Lock, in Mirela Duarte's hands. She keeps the Canal book. # speaker: Agnes
  ++ [I will carry it.]
     ~ note("pipeBook")
     ~ begin("pump_pipe")
     -> END
  ++ [Not my road.]
     -> hub
+ [Goodbye.]
  -> END
