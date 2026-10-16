# view: page
INCLUDE world.ink

VAR asked_trailer = false
VAR asked_north = false
VAR asked_hunters = false

=== start ===
# checkpoint: start
The fourth fort has a water cistern on its roof and a Keeper asleep beside it. # place: The fourth outpost # img: road_hauler
The hunters came two at a time on the way up, and both trucks got through. The hauler's cab still has its glass.
Ala climbs down from the hauler and counts the stretch's pay into your hand out loud, quickly, without her usual care. Her eyes keep going to your scout. # page
-> death_machine

= death_machine
# checkpoint: start.death_machine
Four stretches, and you're always the one still rolling when it's over. How the hell are you such a death machine? # speaker: Ala # img: road_ala
She isn't joking. She's measuring what she bought.
+ [Thirty years of this road.]
  ~ death_answer = "road"
  -> road
+ [I rode with hard men. Did things I'm still running from.]
  ~ death_answer = "hard_men"
  -> hard_men
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

= hard_men
It comes out before you have weighed it. Hard men, you say, and things you did beside them, and you are still running, and that is the whole of it.
Running from what? # speaker: Ala
You look at the road. She lets the road be the answer, and she doesn't ask twice.
{ father_told: Her hand has gone to her cuff. She doesn't turn it over. }
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
She sits down on the hauler's step. # page # img: road_hauler
Ask, if you're going to. I'll answer what I answer. # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
She waits. The Keeper on the roof turns over in his sleep. # page
-> menu

= menu
+ {not asked_trailer} [What's in the trailer?]
  ~ asked_trailer = true
  Books. A dead doctor's journals from the valley, forty years of them. My mother hid them three years. Then the Commandant read the name on the cover, and now they're sealed in her wax. # speaker: Ala
  She says it like a list she has learned, and she stops before she says what is written in them.
  The bar says it's a cure. It's paper. # speaker: Ala
  -> menu
+ {not asked_north} [Where are we going?]
  ~ asked_north = true
  <term=northgate>Northgate</term>. A valley at the end of the road, with a spring. The Warden's relay says turn back. It said so at the first fort, and at the second, and it says it politely. # speaker: Ala
  I'm not turning back. # speaker: Ala
  -> menu
+ {not asked_hunters} [Who pays the hunters?]
  ~ asked_hunters = true
  Hedda Vell. She runs Blackwell, and she posted it herself, in diesel. Whether I come back with the trailer or not, she doesn't care. # speaker: Ala
  She says the name flatly, like a debt she has carried for years.
  -> menu
+ [That's enough.]
  You know more than you did, and the road is no safer for it.
  -> maya

= maya
# checkpoint: start.maya
Ala doesn't get up. She looks at the cistern, and then at her hands. # page # img: road_ala
Maya's fever came back on the third night. Sara's slip said she shakes, and she asks for me every hour, and then she asks what the valley looks like. I don't know what to tell her. I've never seen it. # speaker: Ala
She waits. She isn't asking for anything. That is how you know she wants it.
-> promise

= promise
+ [I'll get you there.]
  ~ promised = true
  You hear yourself say it. It isn't a thing you say. You've never said it to anyone, and you know exactly how heavy it is.
  Ala looks at you for a long time. She nods once, and doesn't thank you, because a debt like that can't be thanked.
  -> close
+ [Say nothing.]
  You say nothing. It is the safest thing a man like you can say.
  She nods, as if she'd expected it, and that is somehow worse.
  -> close

= close
Ala gets up. # page
Dawn, then. # speaker: Ala
You go and check the gun pins, both of them. A loose pin will swing your own gun into your cab. The yard here has a welder who works at night, and you leave him a few M's for the scout's weld.
-> END
