INCLUDE world.ink

VAR heard_families = false
VAR asked_families = false
VAR heard_teo = false
VAR asked_teo = false
VAR heard_rim = false
VAR asked_rim = false
VAR heard_chant = false
VAR asked_chant = false
VAR heard_end = false
VAR asked_end = false

=== start ===
# checkpoint: start
I'm Ines Abend, of the Lunar Society. If you have a moment, I'll read you the count. I read it to anyone who stops.
-> hub

= hub
# checkpoint: start.hub
+ [What is the count?]
  A tone comes out of the central hull. It repeats a number, and the number grows by one each year. The tower has listened to it since my great-grandfather's day. We think it counts the years since the fall. This year's number hangs by the tower door, in my hand.
  -> hub
+ [Who are the Lunar Society?]
  We watched the sky from the Alpha Tower, to learn where the ship came from and whether more are coming. We were many once. Now there are few of us, scattered. I keep the tower door and read the count from there and from here. The old families of Nose keep asking me for it.
  ~ heard_families = true
  -> hub
+ [Why read it out loud to anyone?]
  A number kept in one head is a number kept from everyone. The Society voted on it, and I spoke first for reading it in the open. Teo wouldn't agree. He'd kept the count close since he was young. When the vote went against him, the Society cast him out.
  ~ heard_teo = true
  -> hub
+ {heard_families and not asked_families} [Why do the old families ask for it?]
  Many of them have a grandmother who woke in a pod. They want to know how long they've been waiting. I tell them the number, and they nod. Some of them say a word in the old tongue.
  ~ asked_families = true
  -> hub
+ {heard_teo and not asked_teo} [Who is Teo?]
  Teo took the tower when my great-grandfather died of burns. He read the plate when nobody else could. He read the count to me at the crater rim and told me to keep reading it after him. People call him the Apprentice now. I don't. He was never anyone's apprentice but the sky's. After the vote, the Sunward closed the rim to us. They're the people who keep it. I haven't stood there since.
  ~ asked_teo = true
  ~ heard_rim = true
  -> hub
+ {heard_rim and not asked_rim} [Why is the Society kept from the rim?]
  The Sunward shut it to us after the vote. Their Preacher says we count their god's patience. I'd call that fair, if I believed in the god. We read from the tower now, and from here. The glow doesn't mind. The Sunward chant a number of their own at the rim. I'd give a great deal to know where they found it.
  ~ asked_rim = true
  ~ heard_chant = true
  -> hub
+ {heard_chant and not asked_chant} [What do the Sunward chant at the rim?]
  A number, and it's larger than this year's. I believe it's where the count stops. I don't know how they came to it. Someone must have read further than we have.
  ~ note("talkSunwardNumber")
  ~ asked_chant = true
  ~ heard_end = true
  -> hub
+ {heard_end and not asked_end} [What happens when the count stops?]
  I don't know. Nobody does. Anyone who says he knows is selling something. I read the count anyway. A thing not read is a thing that happens to you.
  ~ asked_end = true
  -> hub
+ [Goodbye.]
  -> END
