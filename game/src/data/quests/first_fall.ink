# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
The truck stops so hard that the belt you never fastened would not have helped, and your forehead meets the dash with a sound you feel in your teeth. # place: The cab
Something warm runs into your left eye and keeps running. A single high note fills your ears, and under it, far away, your engine ticks as it cools.
+ [Wipe your eye.]
  ~ first_knockout_seen = true
  Your sleeve comes away dark and wet. You blink until the cracked glass in front of you stops sliding sideways.
  -> look
+ [Keep it shut.]
  ~ first_knockout_seen = true
  Behind the lid the dark beats in time with your heart. When you finally open your good eye, the glass in front of you is a web of cracks.
  -> look

=== look ===
# checkpoint: look
Out past the hood, where the dust is settling, the other truck has stopped side on, far enough that you could not hit it with a thrown stone. # page
Its gun is still swung toward you on the mount, and a thin grey thread of smoke climbs from the muzzle and leans away with the wind. Behind it, a figure in goggles stands braced in the bed with both hands on the grips.
Your hands lie in your lap and will not lift. You wonder, quite calmly, how long a body keeps in this heat, and whether anyone would think to look.
+ [Hold the gunner's gaze.]
  You cannot see the eyes behind the goggles. You look anyway, because it is the last thing left that you can choose.
  -> mercy
+ [Close your eyes and wait.]
  You listen to the wind push sand across the hood and wait for the sound you will not hear.
  -> mercy

=== mercy ===
The sound does not come. # page
When you look again, the barrel has swung up and away and points at nothing in the empty sky. The gunner pushes the goggles onto their forehead, spits over the side and climbs down.
They walk to your truck slowly, a rifle slung across the back, and do not even glance at the cab as they pass your window. You hear the bed creak under their weight and the tarp lift, and for a while you hear them sorting through what you carried.
On the way back they stop by your door. A dented canteen lands on the seat beside you, half full, sloshing. Then boots on gravel, a door slamming, and an engine climbing away into the flat until the wind takes it. # page
You are alive. You hold onto that thought the way you would hold a rope, and it is enough to keep the canteen in your lap while the dark comes up around the edges of everything, soft and patient and in no hurry at all.
-> END
