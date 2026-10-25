INCLUDE world.ink

VAR edda_answered = false
VAR edda_heard_links = false
VAR edda_asked_origin = false
VAR edda_asked_lose = false
VAR edda_asked_grandfather = false
VAR edda_asked_marks = false

=== start ===
# checkpoint: start
{ edda_answered:
  Back again. Have the clamps started to rub yet? Every seat on the road is old, so they will.
- else:
  Edda. I fit link seats on the workshop line, for the Army and for anyone who pays. Turn your head. That red ring at the base of your skull is fresh. You're a Machiner, then?
}
-> hub

= hub
# checkpoint: start.hub
+ {not edda_answered} [Yes. I drive linked.]
  Then you'll want a fitter soon. Every seat on the road is older than both of us, and old collars rub. Come and see me before your neck goes raw, not after.
  ~ edda_answered = true
  -> hub
+ {not edda_answered} [I've only linked once.]
  Then you're new to it. The first time knocks most people flat, and they shake for a day after. After a week or so of driving, the body stops fighting it.
  ~ edda_answered = true
  -> hub
+ {not edda_answered} [Why do you care?]
  Because a new Machiner comes back for seat work within the month. Collars rub, contacts work loose, cables crack. I'd like it to be my bench they come back to.
  ~ edda_answered = true
  -> hub
+ {edda_answered and not edda_heard_links} [What do you know about links?]
  More than anyone else on this mountain. The seat joins your nerves to the truck, and you know that part already. What you don't know is that nobody can make the contacts anymore. Those are the knobs down the backrest, all the way up your spine to your skull.
  They're left over from the <term=chaos>Chaos</term>, and we only rewire the ones still working. When the last contacts in a seat die, the truck goes back to being a plain truck.
  ~ edda_heard_links = true
  -> hub
+ {edda_heard_links and not edda_asked_origin} [Who made the first link?]
  My grandfather saw it start, the way he told it. In the Chaos the wars left more soldiers without arms or legs than anyone could count. So the workshops made artificial hands and wired them to a soldier's own nerves. Grandfather got two.
  Then somebody wired a soldier's nerves to a tank instead of a hand. He could feel the whole tank and drive it like his own body. Grandfather said the man nearly forgot where he ended and the tank began.
  But one soldier now did the work of a whole crew. After that every army wanted links, and none of them went back to plain tanks.
  ~ edda_asked_origin = true
  -> hub
+ {edda_asked_origin and not edda_asked_lose} [Could I lose myself in my truck?]
  Not like the first linked soldier. He lived in that tank for weeks and never climbed out. You get out every night and sleep in a bed. What happens to drivers is plainer. Old Machs feel half empty out of the seat, so they leave it as little as they can.
  ~ edda_asked_lose = true
  -> hub
+ {edda_asked_origin and not edda_asked_grandfather} [What happened to your grandfather?]
  He fixed seats until he died, with those same two hands. He taught me.
  ~ edda_asked_grandfather = true
  -> hub
+ {edda_answered and not edda_asked_marks} [What does the ring on my skull mean?]
  The plug leaves a ring at the base of the skull, and the clamps leave a mark on each side of the neck. Yours are new, so they'll fade. Drive linked for a year, and they stay for good. That's how you tell an old Mach.
  ~ edda_asked_marks = true
  -> hub
+ [Goodbye.]
  Go on, then. Turn your head for me next time, so I can see whether the ring has faded.
  -> END
