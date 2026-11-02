INCLUDE world.ink

VAR asked_shelf = false
VAR read_stamp = false

=== start ===
# checkpoint: start
You've barely turned from the parts counter when Lena crosses the shed from her bench, wiping her hands on a rag. She looks over your truck before she looks at you.
That shelf's Army write-offs, and I wouldn't bolt them to a truck I wanted home. Tell me what you're bolting on, and where. # speaker: Lena
-> hub

= hub
# checkpoint: start.hub
+ {not asked_shelf} [What's wrong with the shelf?]
  ~ asked_shelf = true
  Those brake rods are the cheap ones command bought. A cheap rod snaps on a hard bend and leaves you with no brakes. # speaker: Lena
  { not has_note("talkBrakeRod"):
    ~ note("talkBrakeRod")
  }
  -> hub
+ {not read_stamp} [Pick up a rod and read the stamp yourself. # check: machining 1]
  ~ read_stamp = true
  { passed():
    You turn the rod to the light. The stamp is thin and the steel is thinner. Lena watches your thumb find the edge.
    Put it on the bench. Yeah, you read it right: depot issue, thin steel, fitted by order. # speaker: Lena
    { not has_note("talkBrakeRod"):
      ~ note("talkBrakeRod")
    }
  - else:
    You turn the rod over, squint at the stamp and call it sound. Lena takes it out of your hand.
    Leave the shelf to folks who know steel. You read that stamp wrong, and that thin rod'll snap under load. # speaker: Lena
  }
  -> hub
+ [Walk on.]
  She watches you to the door and goes back to her bolts.
  -> END
