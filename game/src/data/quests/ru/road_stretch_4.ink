# view: page
INCLUDE world.ink

VAR asked_trailer = false
VAR asked_north = false
VAR asked_hunters = false

=== start ===
# checkpoint: start
The fourth fort has a water cistern on its roof and a Keeper asleep beside it. # place: The fourth outpost
Two trucks came out of the badlands this morning. You dealt with the first in the open, and it was quick. The second waited behind a rockfall with its gun on the hauler's cab. You never decided anything. You put your bumper into its front wheel at full speed, and it spun into the rocks. When the dust settled, the gun was pointing at the sky and the driver was not moving.
Ala climbs down from the hauler and counts the stretch's pay into your hand out loud, quickly, without her usual care. Her eyes keep going to your bumper. # page
-> death_machine

= death_machine
# checkpoint: start.death_machine
Four stretches, and every time you go at them like you're angry at the road. How the hell are you such a death machine? # speaker: Ala
She isn't joking. She's measuring what she bought.
+ [Thirty years of this road.]
  ~ death_answer = "road"
  -> road
+ [What Tibor told you: I rode with Magnus.]
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
Tibor told me that one. Every bar on this road has three men who rode with Magnus. # speaker: Ala
You have said that sentence in a lot of bars. You say it as flatly as a road sign.
She lets it sit. She doesn't say whether she believes it. She looks at your hands for a while, and then at your neck.
-> hub_intro

= silent
You say nothing. A good truck can sit in silence, and so can a good driver.
Ala looks at you for a while. Then she nods slowly, as if silence were an answer of a kind. It is.
-> hub_intro

= hub_intro
She sits down on the hauler's step. # page
Ask, if you're going to. I'll answer what I answer. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
She waits. The Keeper on the roof turns over in his sleep. # page
-> menu

= menu
+ {not asked_trailer} [What's in the trailer?]
  ~ asked_trailer = true
  Pump parts and valves. Sealed casks, some of them fuel. And books, my father's well crews kept them. Where we're going, nobody has any of it. # speaker: Ala
  She says it like a list she has learned, and she stops before she says what is written in the books.
  My father packed it himself. He lets nobody else pack. # speaker: Ala
  -> menu
+ {not asked_north} [Where are we going?]
  ~ asked_north = true
  <term=northgate>Northgate</term>. A valley at the end of the road, with a spring. Its gate opens only to people who wrote ahead. I wrote. # speaker: Ala
  Its water goes south in <term=blackwell>Blackwell</term>'s tankers. That's the <term=covenant>covenant</term>, and twenty years of it. The books are what I'm taking north. Blackwell wants them kept south. # speaker: Ala
  -> menu
+ {not asked_hunters} [Who set the reward?]
  ~ asked_hunters = true
  Hedda Vell. She runs Blackwell, and she posted it herself. She wants the trailer back sealed. Whether I come back with it, she doesn't care. # speaker: Ala
  She says the name flatly, like a debt she has carried for years.
  -> menu
+ [That's enough.]
  You know more than you did, and the road is no safer for it.
  Ala gets up. # page
  Dawn, then. # speaker: Ala
  You go and look at your bumper. It is folded in on the right, and the yard here has a welder who works at night.
  -> END
