INCLUDE world.ink

VAR heard_swivel = false
VAR asked_rods = false
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
{ wagon_fate:
- "buried": You. Teller drinks better this week. Put it on the bench or don't, I've got work.
- "logged": You again. The page is still in Kovac's log. Command hasn't read it. If it's broken, put it on the bench.
- "admitted": You again. Teller signed it himself, and two trucks are off the line. Nobody asked me, but that's new. Put it on the bench.
- else: Lena. If it's broken, put it on the bench. If it's talk, make it quick. My hands are busy.
}
-> hub

= hub
# checkpoint: start.hub
+ [What do you do here?]
  I keep the Army's trucks running. Anybody else's too, if they bring them to my bench. Engines, plate, mounts, whatever breaks. I can tell what's wrong with a truck by the sound of it pulling in.
  -> hub
+ [Any advice for my truck?]
  Every part does one job and fails at another. Heavy plate stops rounds, but it eats your speed. A big gun eats your deck on top of that. So buy what the road needs, not what shines on the shelf. And before you look at your guns, look at your brake rods.
  ~ heard_swivel = true
  -> hub
+ [Where do I find cheap parts?]
  The Salvage Yard, a way south-west of here. The crews strip whatever gets towed in, so parts go for next to nothing. You'll have to put up with the smell of burnt oil. For real plate you want the Fallen Sun, the big hull in the crater. I say that through my teeth.
  ~ heard_sun = true
  -> hub
+ [Where can I get clean water?]
  Green Pit, out past the road. It's a pump outpost round an old cistern, and they pull the water up from deep rock and sell it by the can. It's clean, and it isn't cheap. Bring M's.
  ~ note("greenPit")
  -> hub
+ {heard_swivel and not asked_rods} [Why check brake rods before guns?]
  Because command bought cheap ones for the depot trucks, and I fit them by order. I've seen what one does on a hard bend. It snaps, the pedal goes to the floor, and the truck goes where the road doesn't. Otto Brann, who made the first swivel, forges his rods twice as thick. He was right, and I told command so. Nobody asks a mechanic.
  ~ note("talkBrakeRod")
  ~ asked_rods = true
  ~ heard_brann = true
  -> hub
+ {heard_brann and not asked_brann} [Do you trust Brann's mounts?]
  The ones with his mark, yes. He signs every weld. A weld you can read is a weld you can trust. I've even seen <term=kiln>Kiln</term> riders running captured ones on their own trucks. Good steel doesn't care who owns it.
  ~ asked_brann = true
  ~ heard_kiln = true
  -> hub
+ {heard_kiln and not asked_kiln} [What do you make of the Kiln riders?]
  They're raiders from the camp in the south, and I'd sooner not fix a truck they've stripped. But the old woman who keeps their furnace, Dagny Brask, melts captured guns into tools. I own a few. They're decent. Don't tell command I said so.
  ~ asked_kiln = true
  -> hub
+ {(heard_sun or found("fallen-sun")) and not asked_sun} [What do you know about the Fallen Sun?]
  Best metal I ever put a torch to, and the worst place to fetch it. The brass call that hull a warship. I'd like them to show me one gun mount on it. I never found one. All I ever cut there was cargo hold. And the glare off the glass around it will blind you by noon.
  ~ asked_sun = true
  ~ heard_glare = true
  -> hub
+ {heard_glare and not asked_glare} [Anything for the glare at the Fallen Sun?]
  Lenses cut from the fused glass, dark as smoke. I wear an old pair on bad days. I don't know who sells them now.
  ~ asked_glare = true
  -> hub
+ {wagon_rod != "none" and wagon_fate == "none"} [I brought something from wagon Seven.]
  ~ begin("wagon_bench")
  -> END
+ [Goodbye.]
  -> END
