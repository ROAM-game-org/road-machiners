# view: page
# fact: wagon_saw Hollow: no shell casing in the grit and no bullet hole in the wagon. Every dent in her is from the slope.
# fact: followed Ridge: the newer tracks go up to the bend, where a truck stood and turned round. Its tread matches the wagon's own tires.
# fact: mount_seen Brakes: the front brake rod is thin depot steel, and it snapped in two. One half still hangs in the linkage.
# fact: wagon_read Brake rod: the broken face is bright and flat. No saw marks, no rust. Cheap steel that broke in one go.
# fact: wagon_watched Ridge: somebody up there watched you work and was gone when you looked.
INCLUDE world.ink

VAR walked = false
VAR followed = false
VAR mount_seen = false

=== start ===
# checkpoint: start
The wagon lies nose-down at the bottom of the hollow, below the bend in the Bowl north road. It left the road on the bend and ran all the way down the slope. Army green under the dust. The stencil on the door is the Nose Army's, from the town on the mountain to the east, and under it is a white 7. # place: A hollow off the Bowl north road
You've been through everything that opens. The radio is gone from the cab, and its bracket hangs empty. The bed is bare: wooden chocks for a row of water drums, and no drums.
The cannon still sits on its swivel ring on the bed, so it went over the edge with her. The front of the cab is crumpled where she hit the verge, and the driver's door is caved in.
A tow chain is wrapped round the cannon's barrel and runs up the slope. Somebody tried to drag the gun off her. The chain has been cut since. The cut ends are still bright.
-> hub

= hub
+ {not walked} [Walk the hollow. # check: perception 2]
  ~ walked = true
  Wide tire tracks with chain marks come down the slope to the wagon's bed and go back up. Rain has softened them. The drums are gone, and you'd bet on that truck, though tracks don't say what it carried.
  The tracks of two men climb out side by side to the east, as old as the tire tracks. After the rain somebody else came down alone, stood by the cab a while and went back up the way he came.
  { passed():
    You walk a slow circle and then a wider one. There's no brass in the grit. Not one casing.
    You go over the wagon's sides with your hand. Road dents, rust, a scraped fender. There isn't a bullet hole in her. Raiders shoot. If they shot here, they picked up every casing after and missed the whole wagon.
    Every dent in her is from the slope, from the verge down to the rocks at the bottom.
    ~ wagon_saw = true
  - else:
    You crouch over the tracks longer than they're worth. When you stand up, something moves on the ridge above the bend. You look, and it's gone. Somebody up there may have watched you work.
    ~ wagon_watched = true
  }
  -> hub
+ {walked and not followed} [Follow the newer tracks up the slope.]
  ~ followed = true
  The lone tracks climb straight to the bend, where the road runs past above the hollow. A truck stood there and turned round. Its tread matches the wagon's own tires. You'd guess an Army truck, though plenty of trucks run on Army tires.
  { wagon_watched:
    Further along the ridge you find small bare footprints, a child's, running off to the east, the way the Salvage Yard lies. So that was your watcher.
  }
  -> hub
+ {not mount_seen} [Crawl under the cab and look at the brakes. # check: machining 1]
  ~ mount_seen = true
  A steel rod runs from the brake pedal to the front brakes. When the driver stands on the pedal, the rod pulls the brakes on. Most drivers fit a forged rod as thick as a thumb. This one is thin grey depot steel with a Nose stamp on it.
  The rod has snapped in two. One half still hangs in the linkage. The other half is gone.
  { passed():
    You thumb the broken face. It's bright and flat. No saw marks, no rust, no lead smeared on it. You've seen cheap steel snap like that, all at once, when a hard stop wrenches it.
    Inside the face the steel is coarse and grey, like cast scrap. A forged rod would have bent before it broke. Whoever stood on that pedal on the bend got nothing back.
    ~ wagon_read = true
  - else:
    It's a broken rod. It looks like any other broken rod to you. Somebody who fits these brakes for a living could tell you more.
  }
  The half rod is the one piece of this wagon you could carry up to Nose and put on a desk. Its bolts have rusted solid in the linkage. Getting it out would take a punch and most of an hour, and a slip would ruin the broken face.
  -> hub
+ {mount_seen and wagon_rod == "none"} [Spend an hour working the half rod free. # check: machining 2]
  { passed():
    You set the punch square on the first bolt and tap, and tap again, and don't hurry. Sweat runs into your eyes. Then the half rod drops out of the linkage into your palm.
    Its broken face is still bright, without a new mark on it.
    ~ wagon_rod = "held"
  - else:
    The punch slips on the third blow, and the hammer comes down on the broken face. You swear at it. The half rod comes out in the end, bent, and its face is a grey smear.
    ~ wagon_rod = "bent"
  }
  -> hub
+ [Leave the hollow.]
  { wagon_rod != "none":
    ~ note("wagonRod")
  }
  -> leave

=== leave ===
# checkpoint: leave
{ wagon_saw and wagon_read:
  If anybody asked, you'd tell it like this: the brake rod snapped on the bend, the wagon couldn't slow, and she went over the edge with her cannon on her. The crew walked out. You can't prove the last part. You can prove that a rod snapped.
}
{ wagon_rod:
- "held": The half rod goes in your shirt pocket with its face clean.
- "bent": The bent half rod goes in your pocket. Its face is a smear now. All it shows is that a rod broke.
- else: You leave the half rod in the linkage and the cannon on her bed.
}
The Nose Army owns this wagon, and somebody up there wrote down what happened to it. Whether that matches what's in this hollow is the question.
Your own water is warm by now. You drink it anyway.
-> END
