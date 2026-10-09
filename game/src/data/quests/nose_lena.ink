INCLUDE world.ink

VAR heard_swivel = false
VAR asked_pins = false
VAR heard_brann = false
VAR asked_brann = false
VAR heard_kiln = false
VAR asked_kiln = false
VAR heard_sun = false
VAR asked_sun = false
VAR heard_glare = false
VAR asked_glare = false

=== start ===
# checkpoint: start
Lena. If it's broken, put it on the bench. If it's talk, make it quick. My hands are busy.
-> hub

= hub
# checkpoint: start.hub
+ [What do you do here?]
  I keep the Army's trucks running. Anybody else's too, if they bring them to my bench. Engines, plate, mounts, whatever breaks. I can tell what's wrong with a truck by the sound of it pulling in.
  -> hub
+ [Any advice for my truck?]
  Every part does one job and fails at another. Heavy plate stops rounds, but it eats your speed. A big gun eats your deck on top of that. So buy what the road needs, not what shines on the shelf. And if you've got a gun on a swivel, look at the pins first. The swivel's the ring that swings the gun across your bed.
  ~ heard_swivel = true
  -> hub
+ [Where do I find cheap parts?]
  The Salvage Yard, a way south of here. The crews strip whatever gets towed in, so parts go for next to nothing. You'll have to put up with the smell of burnt oil. For real plate you want the Fallen Sun, the big hull in the crater. I say that through my teeth.
  ~ heard_sun = true
  -> hub
+ [Where can I get clean water?]
  Green Pit, out past the road. The water there runs clean and nobody guards it. Fill your cans if you're out that way.
  ~ note("greenPit")
  -> hub
+ {heard_swivel and not asked_pins} [Why look at the pins?]
  Because the copy they bolt on at the gate has one. I've seen what one does on a hard bend. The mount slides and the gun swings round into your own cab. Otto Brann made the first swivel, at Ridge Wrecks. He gave his a second pin. He was right, and I told command so. Nobody asks a mechanic. The Yard will bore you a second pin for a fee. Pay it.
  ~ note("talkOnePin")
  ~ asked_pins = true
  ~ heard_brann = true
  -> hub
+ {heard_brann and not asked_brann} [Do you trust Brann's mounts?]
  The ones with his mark, yes. He signs every weld. A weld you can read is a weld you can trust. I've even seen Kiln riders running captured ones on their own trucks. Good steel doesn't care who owns it.
  ~ asked_brann = true
  ~ heard_kiln = true
  -> hub
+ {heard_kiln and not asked_kiln} [What do you make of the Kiln riders?]
  They're raiders from the camp in the south, and I'd sooner not fix a truck they've stripped. But the old woman who keeps their furnace, Dagny Brask, melts captured guns into tools. I own a few. They're decent. Don't tell command I said so.
  ~ asked_kiln = true
  -> hub
+ {(heard_sun or found("fallen-sun")) and not asked_sun} [What do you know about the Fallen Sun?]
  Best metal I ever put a torch to, and the worst place to fetch it. The brass call that hull a warship. I'd like them to show me one gun mount on it. There isn't one. It's cargo holds, all of it. And the glare off the glass around it will blind you by noon.
  ~ asked_sun = true
  ~ heard_glare = true
  -> hub
+ {heard_glare and not asked_glare} [Is there anything for the glare?]
  Lenses. Pim Arslan cuts them from the fused glass at the Yard, and they come out dark as smoke. They're worth it. I wear a pair on bad days.
  ~ asked_glare = true
  -> hub
+ [Goodbye.]
  -> END
