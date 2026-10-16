# view: page
INCLUDE world.ink

VAR asked_trailer = false
VAR asked_north = false
VAR asked_hunters = false

=== start ===
# checkpoint: start
The fourth fort has a water cistern on its roof and a Keeper asleep beside it. # place: The fourth outpost
Four stretches in, and each one has sent two trucks at a time out of the badlands. This morning a gun truck came out from behind a rockfall with its barrel on the hauler's cab. You never decided anything. You took the corner of the rock and the truck's front wheel with your bumper, and then the gun was pointing at the sky and the driver wasn't doing anything about it.
Ala gets down from the hauler with the pay in her fist and doesn't count it. She watches you check the bumper for a long time instead. # page
-> death_machine

= death_machine
# checkpoint: start.death_machine
How the hell are you such a death machine? # speaker: Ala
She isn't joking. She's measuring what she's bought.
+ [Thirty years of this road.]
  ~ death_answer = "road"
  -> road
+ [I rode with Magnus.]
  ~ death_answer = "magnus"
  -> magnus
+ [Say nothing.]
  ~ death_answer = "silent"
  -> silent

= road
Thirty years of this road teaches you things, you tell her. Where a driver looks before he fires. How a truck leans before it turns.
That's not an answer. That's a calendar. # speaker: Ala
{ ring_told == "told":
  She taps the back of her own neck, where yours is burned.
  A man who pulls his own plug didn't learn that from a calendar. # speaker: Ala
}
-> hub_intro

= magnus
Tibor told that one. Every bar on this road has three men who rode with Magnus. # speaker: Ala
She lets it sit. She doesn't say whether she believes it. She says the sum again, under her breath, as if checking it against you.
-> hub_intro

= silent
You say nothing. A good truck can sit in silence, and so can a good driver.
Ala looks at you for a while, and then she nods slowly, as if silence were an answer of a kind. It is.
-> hub_intro

= hub_intro
Ala sits on the hauler's step. It's the first time she has sat down in front of you. # page
You can ask me something. One thing, maybe two. I'll tell you what I tell you. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
She waits with the pay still in her fist. The Keeper on the roof turns over in his sleep. # page
-> menu

= menu
+ {not asked_trailer} [What's in the trailer?]
  ~ asked_trailer = true
  Pump parts. Valves. Sealed casks, a few of them fuel. And books, my father's crews wrote them. Things people need where we're going and can't get any other way. # speaker: Ala
  She says it like a list she has learned, and she stops before she has said what the books say.
  My father packed it. He doesn't let anyone else pack. # speaker: Ala
  -> menu
+ {not asked_north} [Where are we going?]
  ~ asked_north = true
  <term=northgate>Northgate</term>. A valley at the end of the road with a spring. They don't open the gate to people who don't write first, so I wrote. # speaker: Ala
  Their water goes south in <term=blackwell>Blackwell</term>'s tankers. The <term=covenant>covenant</term>, twenty years of it. I'm taking something north that Blackwell would rather it didn't. # speaker: Ala
  -> menu
+ {not asked_hunters} [Who pays the hunters?]
  ~ asked_hunters = true
  Hedda Vell. The Oilmistress at Blackwell. She wants the trailer back sealed, and she doesn't much care what's left of me. # speaker: Ala
  She says the name like a weight she has been carrying for years and has set down on purpose.
  -> menu
+ [Enough.]
  You've heard what you need to hear. The rest is the road.
  Ala stands, tucks the pay away, and doesn't count it. That's how you know it has been a long day.
  Tomorrow, then. # speaker: Ala
  You go to check the pins, which have not moved since this morning. # page
  -> END
