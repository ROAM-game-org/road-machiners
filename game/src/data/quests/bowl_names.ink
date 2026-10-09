# view: page
# stat: money Money
# fact: drunk_said Toll hut: a drunk man says Karl Vosk shot Hal Sorensen below the bridge, the year the road went unguarded.
# fact: brass_held Spent brass from the drunk man: Old Army rifle, found on the road below the bridge the morning after Hal was shot.
# fact: book_seen Dario Feld's book, the day before: a pair of men in Army coats watched the trucks from the rise below the bridge. The younger had red thread at his cuff.
# fact: hal_letter_read Hal's last letter: he will not pay a stranger for a rifle.
# fact: kiln_known Guild mail: a letter capped with a Burnt Convoy seal was addressed to Karl Vosk at Kiln Camp.
INCLUDE world.ink

VAR drunk_said = false
VAR brass_held = false
VAR book_seen = false
VAR hal_letter_read = false
VAR kiln_known = false
VAR drink_price = 10
VAR refused = false
VAR bounty = 80
VAR outcome = "none"

=== function proof() ===
~ return drunk_said + brass_held + book_seen + kiln_known

=== start ===
# checkpoint: start
{
  - outcome != "none" or names_vosk != "none": -> after_reading
}
Lusa Fenwick sits on an upturned crate by the well, a worn sheet of road drawing across her knees. # place: Bowl
She looks up and smiles as if she had been waiting for someone with a quiet face.
Once a year I read the names of the dead at Canyon Bridge. That night is tonight. # speaker: Lusa
Drivers stop on the bare deck with their rifles on the cab hooks. They answer each name. Nobody asks them to. # speaker: Lusa
Stand with us. Stay for the whole reading. # speaker: Lusa
-> hub

= hub
# checkpoint: start.hub
+ [Who is on the list?]
  Hal Sorensen, a Bowl grain driver. Jens Vosk, a robber. Brother Anselm, who buried them. Wendell Ondra of the Pump Station. Emil Kessel of the Nose. # speaker: Lusa
  A name read is a name carried. The road does not sort them. # speaker: Lusa
  -> hub
+ [I will come.]
  ~ note("namesReading")
  Bring a rifle if you carry one. There are hooks. # speaker: Lusa
  -> reading
+ [Not tonight.]
  The names are read again next year. They will not mind. # speaker: Lusa
  -> END

=== reading ===
Canyon Bridge hangs over the gorge with the last light on its rails. Trucks stand along the deck, cabs dark, rifles on the hooks. # page # place: Canyon Bridge
A toll hut stands at the Bowl end. Graves lie at the bridge end. Hal's and Jens's face each other across the road, and Anselm's lies between.
Lusa stands on the bare deck with her back to the drop. She reads without a book.
Hal Sorensen.
<i>Here,</i> says a voice from a cab. Others take it up.
Jens Vosk. # reveal: all
Nobody answers for a moment. Then a driver at the back says it, low.
Brother Anselm. Wendell Ondra. Emil Kessel.
Each name gets its answer. The wind takes the last one.
+ [Stay until the crowd breaks up.]
  -> after_reading_scene
+ [Leave before the last name.]
  You are on the road before she finishes. The bridge hums behind you.
  -> END

=== after_reading_scene ===
The trucks start one by one and file off the deck. # page # place: Canyon Bridge
At the toll hut a man sits on the step with a bottle between his boots. He is drunk, loud and not unkind.
He sees you stayed. Sit. Nobody sits with me. # speaker: Drunk man
-> hub_drunk

= hub_drunk
# checkpoint: after_reading_scene.hub_drunk
+ {not drunk_said} [Sit with him.]
  ~ drunk_said = true
  ~ note("namesDrunk")
  He pats the step. You sit.
  She reads Jens like he was a saint. Jens never killed a man. Jens held the wheel. # speaker: Drunk man
  Karl shot Hal. The younger one, Karl Vosk. I know because I was on this bridge. # speaker: Drunk man
  He wanted the grain and the truck, and Hal would not pay for a rifle he had not asked for. # speaker: Drunk man
  Then he lifts the bottle and finds it empty.
  -> hub_drunk
+ {drunk_said and not brass_held} [Buy him a drink. # cost: {drink_price}]
  ~ brass_held = true
  He drinks it slowly and does not talk for a while.
  The next morning I walked the road below the bridge. I took this off the stones. # speaker: Drunk man
  He opens his hand. A spent brass case, dull green, Old Army stamp on the base.
  I kept it so I would not forget. I forget everything else. # speaker: Drunk man
  -> hub_drunk
+ [Go and find Lusa.]
  -> hub_lusa

=== hub_lusa ===
# checkpoint: hub_lusa
Lusa is rolling up her sheet on the toll hut rail. The graves lie dark behind her. # page # place: Canyon Bridge
{ refused: The step of the toll hut is empty. The cell door is shut. }
+ {not book_seen} [Ask for Dario Feld's book.]
  -> book
+ {not hal_letter_read} [Ask about Hal's last letter.]
  -> hal_letter
+ {has_note("courierLetter") and not kiln_known} [Think about the letter capped with the Burnt Convoy seal.]
  -> mail
+ {drunk_said} [Decide what to do with what you heard.]
  -> decide
+ [Walk away.]
  The bridge lights go out one by one behind you.
  -> END

=== book ===
~ book_seen = true
~ note("namesBook")
Lusa unwraps a book bound in truck canvas. Dario Feld, the old convoy master, gave it to her when he gave her the western road. # place: Canyon Bridge
She finds the page without looking.
The day before the shooting, the entry says: a pair of men in Army coats on the rise below the bridge. The elder watches. The younger counts the trucks and mends nothing.
Beside it Dario wrote a second line. The younger one had red thread at his cuff, a woman's stitch.
Dario wrote it. I only carry it. # speaker: Lusa
-> hub_lusa

=== hal_letter ===
~ hal_letter_read = true
~ note("namesLetter")
Lusa folds back a letter from inside the sheet. The paper is soft from carrying. # place: Canyon Bridge
Hal wrote it the night before. He did not send it. His family kept it and Lusa copied it.
He says he will cross the bridge in the morning. He says a stranger on the road offered him a rifle for grain, and he will not pay for a thing he did not ask for.
He says the road will empty if men pay for fear.
It says nothing of who the stranger was. # speaker: Lusa
-> hub_lusa

=== mail ===
~ kiln_known = true
You have seen that name already. A thick letter in a Guild bag, a Burnt Convoy seal on it, Karl Vosk, care of Kiln Camp. # place: Canyon Bridge
The Kiln riders have a new man. He sat at the Green Pit tables and asked what the courier bag carries.
Lusa watches your face and asks nothing. # speaker: Lusa
-> hub_lusa

=== decide ===
You hold a name and what stands behind it. # place: Canyon Bridge
Lusa hangs the sheet on its peg and waits. She does not say what she would do.
+ [Take it to the sergeant of the Bowl road patrol.]
  -> patrol
+ [Take it to Hal's people at the Granary.]
  -> kin
+ [Say nothing.]
  -> kept
+ [Not yet.]
  -> hub_lusa

=== patrol ===
The sergeant sits at the toll window with the day's tally and a cold cup. # place: Toll window
{
  - proof() >= 3: -> patrol_acts
  - else: -> patrol_refuses
}

=== patrol_refuses ===
~ refused = true
A drunk's word. Whose word else? # speaker: Sergeant
Bring me more than a bottle, and I will ride. # speaker: Sergeant
By morning the drunk man is in the toll cells, sleeping it off. He did not ask for that.
-> hub_lusa

=== patrol_acts ===
~ outcome = "patrol"
~ names_vosk = "patrol"
~ give_money(bounty)
The sergeant reads the book entry twice and rolls the brass in his fingers. # place: Toll window
{ kiln_known: He asks where the name has been seen, and you tell him: Kiln Camp. }
Kiln is outside our road. We ride anyway. # speaker: Sergeant
A patrol truck leaves at dawn, heading south.
It comes back after a few days with an empty seat. The crew say nothing. Kiln has shut the south bend to every Bowl truck for a season.
The sergeant counts <b>{bounty} M</b> across the window. # reveal: all
-> END

=== kin ===
~ outcome = "kin"
~ names_vosk = "kin"
The Granary yard is quiet. Hal's widow sits on the loading step with her hands in her lap. # page # place: The Granary
You tell her what you heard, and what stands behind it.
She says the name over, twice, as if tasting it.
Did he say it was quick? # speaker: Hal's widow
You tell her he did not say.
She nods. She does not ask for the patrol. She asks for nothing.
That night she walks out to the bridge and writes one more name in her own book, beside Hal's. She does not read it aloud.
-> END

=== kept ===
~ outcome = "kept"
You say nothing. The lamps on the deck go out. # place: Canyon Bridge
Lusa walks past you with her sheet under her arm.
Next year I will read the same names. # speaker: Lusa
She does not look back. The name stays where you put it.
-> END

=== after_reading ===
Lusa is mending a strap on the crate by the well. # place: Bowl
{
  - names_vosk == "patrol": The patrol rode south. Bowl trucks use the long road now, and nobody says why.
  - names_vosk == "kin": Hal's widow lit a lamp at the bridge. Lusa says one more voice answered the names this year.
  - outcome == "kept": Lusa read the same names again. She asks nothing of you.
}
-> END
