INCLUDE world.ink

=== start ===
# checkpoint: start
Dag, Farmers patrol. Keep your guns cold inside the gates and we will get along fine.
-> hub

= hub
# checkpoint: start.hub
+ [Any trouble around here?]
  Raiders sniffing at the roads again. Nothing we cannot run off. The dust is worse. A truck that breaks down out there waits a long while for a friendly face.
  -> hub
+ [What about the raiders?]
  Kiln Camp sits out east, south of the crater. Scrapjaw is far up north, beyond Dustwell. Most days they would rather rob you than kill you. Pay them or outrun them, but <b>do not shoot first</b> if you want to grow old.
  -> hub
+ [What do you make of Nose?]
  The Army is all right on the road. Off it, they act like the basin is theirs and we are only borrowing it. Bowl was feeding people long before Nose put up its first fence.
  -> hub
+ [Any work?]
  {
    - board_full():
      You are carrying enough promises already. Finish a few first.
      -> hub
    - not has_work() and has_offers():
      Nothing on the board you could take on right now. Make some room and ask again.
      -> hub
    - not has_work():
      Nothing on the board today. Come back in a couple of days.
      -> hub
  }
  Could be. Interested? # work_offer
  ++ [I will take it.]
     ~ take_work()
     Good. Bowl remembers who delivers.
     -> hub
  ++ [Not now.]
     -> hub
+ [Who pays the patrol now?]
  The Granary count, the bridge toll, the convoy fee and what the tenants put in. Nose refuses to pay for the open road. It keeps its own.
  So each town guards the road near its walls. Between them nobody. I do not like it. I do not know a cure.
  -> hub
+ [Why does every truck carry a gun?]
  The Old Army is gone and its rifles are at every crossroads. Pierce wants a gun on the bed. The Senate lets tenants carry now.
  Truth is, a gun on the bed is a gun on the bed. Good for the man behind it. Not for the man in front.
  -> hub
+ [What about Kiln riders and the fee?]
  The Granary pays them a sack for each armed truck that crosses. Cheaper than a funeral. I said do not shoot first. Fight hard and they often let you go. Fight soft and they strip you.
  I never told you to fight soft. I tell you to know which one you are.
  ~ note("talkKilnFight")
  -> hub
+ [Do tenants serve with you?]
  Some. Good drivers, bad paper. They wear the same coat. The Senate wants them on the road and off the roll.
  Jory Baptiste keeps sending more. I do not know whether to thank him or watch him.
  -> hub
+ [Goodbye.]
  -> END
