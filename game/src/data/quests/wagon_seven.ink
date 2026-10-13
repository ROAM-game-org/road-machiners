# view: page
# fact: wagon_saw Hollow: no shell casing in the grit and no bullet hole in the wagon. The dents in the cab push inward from the bed side.
# fact: followed Ridge: the newer tracks go up to the bend, where a truck stood and turned round. Its tread matches the wagon's own tires.
# fact: mount_seen Gun mount: the ring was drilled for one locking pin, with no hole for a second. The pin snapped in the ring.
# fact: wagon_read Gun mount: the stub's broken face is bright and flat. No saw marks, no rust, no lead smeared on it.
# fact: wagon_watched Ridge: somebody up there watched you work and was gone when you looked.
INCLUDE world.ink

VAR walked = false
VAR followed = false
VAR mount_seen = false

=== start ===
# checkpoint: start
The wagon lies nose-down at the bottom of the hollow, below the bend in the Bowl north road. It left the road on the bend and ran all the way down the slope. Army green under the dust. The stencil on the door is the Nose Army's, from the town on the mountain to the north-east, and under it is a white 7. # place: A hollow off the Bowl north road
You've been through everything that opens. The radio is gone from the cab, and its bracket hangs empty. The bed is bare: wooden chocks for a row of water drums, and no drums.
The cannon is still on its swivel ring, but it has swung right round. Its back end lies across the cab roof, and the back wall of the cab is caved in.
A tow chain is wrapped round the gun where it lies and hooked to the cab frame, so somebody tied it down after it swung. The chain has been cut since. The cut ends are still bright.
-> hub

= hub
# checkpoint: start.hub
+ {not walked} [Walk the hollow. # check: perception 2]
  ~ walked = true
  Wide tire tracks with chain marks come down the slope to the wagon's bed and go back up. Rain has softened them. The drums are gone, and you'd bet on that truck, though tracks don't say what it carried.
  The tracks of two men climb out side by side to the north-east, as old as the tire tracks. After the rain somebody else came down alone, stood by the cab a while and went back up the way he came.
  { passed():
    You walk a slow circle and then a wider one. There's no brass in the grit. Not one casing.
    You go over the wagon's sides with your hand. Road dents, rust, a scraped fender. There isn't a bullet hole in her. Raiders shoot. If they shot here, they picked up every casing after and missed the whole wagon.
    The dents in the cab push inward, from the bed side toward the seats.
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
+ {not mount_seen} [Look at the gun mount. # check: machining 1]
  ~ mount_seen = true
  A steel pin through the ring locks a gun so it can't swing on a bend. Most drivers have a second hole drilled and a second pin fitted, so the gun stays put if one pin goes. This ring has one hole.
  The pin has snapped. Its stub still sits in the hole.
  { passed():
    You thumb the stub's broken face. It's bright and flat. No saw marks, no rust, no lead smeared on it. You've seen pins snap like that, all at once, when a heavy load wrenches them.
    There's a dent in the back of the cab the shape of the gun's back end, at the height of a man sitting down. Whoever sat there took that blow.
    ~ wagon_read = true
  - else:
    It's a broken pin. It looks like any other broken pin to you. Somebody who fits these mounts for a living could tell you more.
  }
  The stub is the one piece of this wagon you could carry up to Nose and put on a desk. It's wedged tight. Getting it out would take a punch and most of an hour, and a slip would ruin the broken face.
  -> hub
+ {mount_seen and wagon_pin == "none"} [Spend an hour tapping the stub out. # check: machining 2]
  { passed():
    You set the punch square on the stub and tap, and tap again, and don't hurry. Sweat runs into your eyes. Then the stub drops out of the bottom of the hole into your palm.
    Its broken face is still bright, without a new mark on it.
    ~ wagon_pin = "held"
  - else:
    The punch slips on the third blow, and the hammer comes down on the broken face. You swear at it. The stub comes out in the end, bent, and its face is a grey smear.
    ~ wagon_pin = "bent"
  }
  -> hub
+ [Leave the hollow.]
  { wagon_pin != "none":
    ~ note("wagonPin")
  }
  -> leave

=== leave ===
# checkpoint: leave
{ wagon_saw and wagon_read:
  If anybody asked, you'd tell it like this: the pin snapped on the bend, the gun swung into the cab, and the crew tied it down and walked out. You can't prove the last part. You can prove that a pin snapped.
}
{ wagon_pin:
- "held": The stub goes in your shirt pocket with its face clean.
- "bent": The bent stub goes in your pocket. Its face is a smear now. All it shows is that a pin broke.
- else: You leave the stub in the ring and the gun on the roof.
}
The Nose Army owns this wagon, and somebody up there wrote down what happened to it. Whether that matches what's in this hollow is the question.
Your own water is warm by now. You drink it anyway.
-> END
