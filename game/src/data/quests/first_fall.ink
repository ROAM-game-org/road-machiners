# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The truck stops dead, and your forehead meets the dash with a sound you feel in your teeth. The belt you never bothered with wouldn't have helped anyway. # place: The cab
Something warm runs into your left eye and keeps running. A thin high note fills your ears. Under it, far off, your engine ticks as it cools, like it's counting something.
+ [Wipe your eye.]
  ~ first_knockout_seen = true
  Your sleeve comes away dark and wet. You blink until the cracked glass in front of you stops sliding sideways.
  -> look
+ [Keep it shut.]
  ~ first_knockout_seen = true
  Behind the lid the dark beats in time with your heart. When you open the good eye, the glass in front of you is a web of cracks. Some window you've got now.
  -> look

=== look ===
# checkpoint: look
Out past the hood, where the dust is settling, the other truck has stopped side on. It's too far to hit with a thrown stone, not that you could lift one. # page
Its gun is still swung your way, and a thin grey thread of smoke climbs from the muzzle and leans off with the wind. A figure in goggles stands braced in the bed with both hands on the grips.
Your hands lie in your lap and won't lift. You wonder, calm as anything, how long a body keeps in this heat. Not long, you figure. Then the dust gets it, and then nobody remembers there was a truck here at all. One with the dust, then.
+ [Hold the gunner's gaze.]
  You can't see the eyes behind the goggles. You look anyway. It's the last thing left you can choose, and you'll be damned if you choose the floor.
  -> mercy
+ [Close your eyes and wait.]
  You listen to the wind push sand across the hood, and you wait for the sound you won't get to hear.
  -> mercy

=== mercy ===
The sound doesn't come. # page
When you look again, the barrel has swung up and away and points at nothing in the empty sky. The gunner pushes the goggles up, spits over the side and climbs down.
They walk to your truck slow, with a rifle slung across their back, and they don't even glance at the cab as they pass. The bed creaks under their weight. The tarp lifts. For a while you listen to them sort through what you carried, unhurried, like somebody doing chores.
On the way back they stop by your door. A dented canteen lands on the seat beside you, half full and sloshing. Then boots on gravel, a door slamming, and an engine climbing off into the flat until the wind takes it. # page
You're alive. You hold onto that the way you'd hold a rope. It's enough to keep the canteen in your lap while the dark comes up around the edges of everything, soft and patient and in no hurry at all.
-> END
