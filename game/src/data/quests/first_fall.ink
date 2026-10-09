# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The truck stops dead. Your chest hits the wheel and your head hits the dash. # place: The cab
Something warm runs into your eye. One high note rings in your ears. The world swims.
The engine ticks as it cools. Nothing else moves.
+ [Wipe your eye.]
  ~ first_knockout_seen = true
  Your hand comes away red. You blink until the glass holds still.
  -> look
+ [Keep it shut.]
  ~ first_knockout_seen = true
  The dark behind your lid pulses with your heart. After a while you make yourself look.
  -> look

=== look ===
# checkpoint: look
Through the cracked glass hangs a barrel, wreathed in smoke. It is pointed at you. # page
Dust drifts across the hood. The other truck idles close, its driver a shape behind a screen.
You know how this ends. A dry end, in a dry land. Nobody will come to bury you.
+ [Look it in the eye.]
  The barrel does not waver. Your mouth tastes of copper and dust.
  -> mercy
+ [Close your eyes.]
  You hear your own breath. You hear the wind take sand over the hood.
  -> mercy

=== mercy ===
It does not come. # page
The seconds pile up. Then the barrel sinks.
The other driver has seen what you are now. A dead truck and a driver who cannot lift a hand. Nobody out here kills that.
A door slams somewhere. An engine climbs, then fades into the flat.
The ringing eases. You are going to live. # page
You did not know how much you wanted that. The warmth in your eye does not matter. The dash is cool against your cheek.
The edges of the world close in, soft and slow.
-> END
