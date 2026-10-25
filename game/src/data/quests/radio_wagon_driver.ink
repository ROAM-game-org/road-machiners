INCLUDE world.ink

=== start ===
# checkpoint: start
Not much more to tell, and I'm short of daylight. Ask fast. # speaker: Driver # reveal: char # speed: fast
-> ask

= ask
# checkpoint: start.ask
+ [Is anyone still around the wagon?]
  Not that I saw. There were tracks all over the hollow, the wide kind raiders make with chains on their tires. They were old, though. Rain's come through since and washed the edges soft. # speaker: Driver
  -> ask
+ {has_note("wagonNose")} [What became of the wagon's crew?]
  They walked to Nose, the way I heard it. They were lucky. Whoever ran that wagon down wasn't out for prisoners. # speaker: Driver
  -> ask
+ [Is anything left on it?]
  {
    - searched("story-wagon-seven"):
      You tell me. Sounds like you got there first. # speaker: Driver
    - else:
      Could be. Raiders strip what they can lift, but an Army gun is heavy. I wouldn't have wanted to carry one out of that hollow. # speaker: Driver
  }
  -> ask
+ [Over and out.]
  Over and out. Keep to the high ground. The hollows hide more than they show. # speaker: Driver
  -> END
