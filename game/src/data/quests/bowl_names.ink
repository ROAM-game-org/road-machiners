# view: page
# stat: money Money
# fact: drunk_said Toll hut: a drunk man says Karl Vosk shot Hal Sorensen below the bridge, the year the road went unguarded.
# fact: brass_held Spent brass from the drunk man: Old Army rifle, found on the road below the bridge the morning after Hal was shot.
# fact: runner Toll hut: a wheel is burned into the heel of the drunk man's boot.
# fact: book_seen Dario Feld's book, the day before: a pair of men in Army coats watched the trucks from the rise below the bridge. The younger had red thread at his cuff.
# fact: hal_letter_read Hal's last letter: a stranger on the road offered him a rifle for grain, and he wouldn't pay for a thing he hadn't asked for.
# fact: kiln_known Guild mail: a letter capped with a Burnt Convoy seal was addressed to Karl Vosk at Kiln Camp.
INCLUDE world.ink

VAR drunk_said = false
VAR brass_held = false
VAR runner = false
VAR book_seen = false
VAR hal_letter_read = false
VAR kiln_known = false
VAR drink_price = 10
VAR refused = false
VAR bounty = 40
VAR sergeant_fine = 30
VAR outcome = "none"

=== function proof() ===
~ return drunk_said + brass_held + book_seen + (kiln_known or letter_fate == "read" or letter_fate == "delivered")

=== start ===
# checkpoint: start
{
  - outcome != "none" or names_vosk != "none": -> after_reading
}
Lusa Fenwick sits on an upturned crate by the Bowl well with a worn sheet of road drawing across her knees. She isn't drawing this morning. She's saying names under her breath, one after another, and ticking each against the edge of the sheet with her thumbnail. # place: Bowl
She looks up and smiles at you, as if she'd been waiting for a quiet face.
Tonight's the night. Once a year, on the day the road below Canyon Bridge first took someone, I stand on the bridge deck and read the names of the people it's taken since. # speaker: Lusa
Drivers come from all over the basin. They park along the deck and stand bareheaded beside their cabs, and each one answers when a name is read, like men answering a roll. Nobody asked us to start it. We only never stopped. # speaker: Lusa
I saw you at the well yesterday with no cab to be in tonight. Come with me. A reading goes better with someone in it who doesn't carry any of them yet. # speaker: Lusa
-> hub

= hub
# checkpoint: start.hub
+ [Who is on the list?]
  Hal Sorensen drove grain for the Granary, and he was shot below the bridge the year the road went unguarded. Jens Vosk was a robber who died to a tenant's swivel at the Burnt Convoy, back when the burnt trucks still stood by the road. # speaker: Lusa
  Brother Anselm buried both of them, one on each side of the road, and he's buried between them now. Wendell Ondra kept the pump book at the Pump Station and died at the Green Pit sluice. Emil Kessel drove for Nose and died on the north bend, on a mount with a single pin. # speaker: Lusa
  I read them all the same way, a robber beside a driver. The road doesn't sort them, so I don't try. # speaker: Lusa
  -> hub
+ [I'll come.]
  ~ note("namesReading")
  Good. Wear something warm, because the wind off the gorge is cold even in summer. # speaker: Lusa
  -> reading
+ [Not tonight.]
  The names get read again next year, and they won't mind waiting. # speaker: Lusa
  -> END

=== reading ===
Canyon Bridge hangs over the gorge with the last light on its rails, and the wind hums in the cables like a long held note. Trucks stand along the bare deck with their cabs dark, and the drivers stand beside them with their caps in their hands. # page # place: The bridge deck
A toll hut sits at the Bowl end. Graves lie at the far end, and Hal's and Jens's face each other across the road while Anselm's lies between.
Lusa stands in the middle of the deck with her back to the drop. She reads without a book, in a clear voice that carries to the last truck.
Hal Sorensen, who drove the Granary's grain and would not pay a stranger for a rifle he hadn't asked for.
<i>Here,</i> says a voice from a cab. Others take it up.
Jens Vosk, who robbed insured trucks on the Nose road and died to a tenant's swivel. # reveal: all
Nobody answers for a moment. Then a driver at the back says it, low.
Brother Anselm, who buried them. Wendell Ondra, who kept the pump book. Emil Kessel, who drove the north road for Nose.
Each name gets its answer. The wind takes the last one off the bridge.
+ [Stay until the crowd breaks up.]
  -> after_reading_scene
+ [Leave before the last name.]
  You're on the road before she finishes. The bridge hums behind you.
  -> END

=== after_reading_scene ===
The trucks start one by one and file off the deck, and their lamps swing across the rails. # page # place: The bridge deck
At the toll hut a man sits on the step with a bottle between his boots. He's loud and drunk, though not unkind, and he's watched you since the reading began.
You stayed to the end. Sit down, will you? Nobody ever sits with me. # speaker: Drunk man
-> hub_drunk

= hub_drunk
# checkpoint: after_reading_scene.hub_drunk
+ {not drunk_said} [Sit with him.]
  ~ drunk_said = true
  ~ note("namesDrunk")
  He pats the step, and you sit.
  She reads Jens like he was a saint, and that's the part I can't stand. Jens never killed a man in his life. Jens held the wheel. # speaker: Drunk man
  It was Karl who shot Hal, the younger Vosk. I know because I was there on this bridge. He wanted the grain and the truck, and Hal wouldn't pay for a rifle that he hadn't asked for. # speaker: Drunk man
  Then he lifts the bottle and finds it empty.
  -> hub_drunk
+ {drunk_said and not brass_held} [Buy him a drink. # cost: {drink_price}]
  ~ brass_held = true
  He drinks it slowly and doesn't talk for a while.
  The next morning I walked the road below the bridge, and I took this off the stones. # speaker: Drunk man
  He opens his hand. In his palm lies a spent brass case, dull green, with an Army stamp on the base.
  I kept it so I wouldn't forget. I forget everything else. # speaker: Drunk man
  -> hub_drunk
+ {drunk_said and not runner} [Look at how he's sitting.]
  { skill("perception") >= 2:
    ~ runner = true
    He keeps one boot tucked under the other. When he shifts, you see the heel. A wheel is burned into the leather, the same mark that goes on a crate lid at the crossroads.
    He sees you looking and takes a long pull on the bottle.
    -> hub_drunk
  - else:
    He catches you staring at him and draws himself up.
    I'm not a sight, friend. I'm only a man at a toll hut. # speaker: Drunk man
    He puts his shoulder to you and says nothing else for a while.
    -> hub_drunk
  }
+ [Go and find Lusa.]
  -> hub_lusa

=== hub_lusa ===
# checkpoint: hub_lusa
Lusa is rolling up her sheet on the toll hut rail, with the graves dark behind her. # page # place: The bridge deck
{ refused: The step of the toll hut is empty. The cell door beside it is shut. }
{ drunk_said: If somebody told you a story tonight, Dario Feld's book is the only record I trust. He wrote down every convoy day. # speaker: Lusa }
+ {drunk_said and not book_seen} [Ask for Dario Feld's book.]
  -> book
+ {not hal_letter_read} [Ask about Hal's last letter.]
  -> hal_letter
+ {has_note("courierLetter") and not kiln_known and (drunk_said or book_seen)} [Mention the letter with the Burnt Convoy seal.]
  -> mail
+ {drunk_said} [Decide what to do with what you heard.]
  -> decide
+ [Walk away.]
  The bridge lights go out one by one behind you.
  -> END

=== book ===
~ book_seen = true
~ note("namesBook")
Lusa unwraps a book bound in truck canvas. Dario Feld, the old convoy master, gave it to her when he gave her the western road. # place: The bridge deck
She finds the page without looking.
The day before the shooting, the entry says there were a pair of men in Army coats on the rise below the bridge. The elder watched. The younger counted the trucks and mended nothing.
Beside it Dario wrote a second line. The younger one had red thread at his cuff, a woman's stitch.
Dario wrote it. I only carry it. # speaker: Lusa
-> hub_lusa

=== hal_letter ===
~ hal_letter_read = true
~ note("namesLetter")
Lusa folds back a letter from inside the sheet. The paper is soft from carrying. # place: The bridge deck
Hal wrote it the night before. He never sent it. His family kept it, and Lusa copied it.
He says he'll cross the bridge in the morning. He says a stranger on the road offered him a rifle for grain, and he won't pay for a thing he didn't ask for.
He says the road will empty if men pay for fear.
It doesn't say who the stranger was. # speaker: Lusa
-> hub_lusa

=== mail ===
~ kiln_known = true
You've seen that name already. A thick letter in a Guild bag, a Burnt Convoy seal on it, Karl Vosk, care of Kiln Camp. # place: The bridge deck
The Kiln riders have a new man, and he sat at the Green Pit tables and asked what the courier bag carries.
Lusa watches your face and asks nothing. # speaker: Lusa
-> hub_lusa

=== decide ===
You hold a name and what stands behind it. # place: The bridge deck
Lusa hangs the sheet on its peg and waits. She doesn't say what she would do.
+ [Take it to the sergeant of the Bowl road patrol.]
  -> patrol
+ [Take it to Hal's people at the Granary.]
  -> kin
+ {has_note("courierKarl")} [Ride south and find the rider with the red thread.]
  -> south
+ [Say nothing.]
  -> kept
+ [Not yet.]
  -> hub_lusa

=== patrol ===
The sergeant sits at the toll window with the day's tally and a cold cup. # place: Toll window
{
  - letter_fate == "delivered": -> sergeant_doubts
  - else: -> patrol_weigh
}

=== sergeant_doubts ===
He looks at you for a long moment before he reads anything. # place: Toll window
The Guild board sold me a loop sheet this week. A name on it carried a letter to Kiln, and it's the name standing at my window. Why would I ride on your word? # speaker: Sergeant
{ skill("social") >= 2:
  You tell him that a courier carries what she's handed and that a driver on the seat behind her carries nothing but a rifle she never asked for. You tell him that a man who wanted Karl Vosk safe wouldn't be standing here.
  He thinks about it. Then he nods and pulls the day's tally aside.
  -> patrol_weigh
- else:
  You start to explain, and the sergeant stops you with a raised hand.
  I'll have to look at you a while. Sit in the cell and keep the drunk company. # speaker: Sergeant
  { money() >= sergeant_fine:
    ~ pay(sergeant_fine)
    He fines you for the cell and for his time. {sergeant_fine} M goes onto the tally. # reveal: all
  }
  -> hub_lusa
}

=== patrol_weigh ===
{
  - proof() >= 3: -> patrol_acts
  - else: -> patrol_refuses
}

=== patrol_refuses ===
~ refused = true
A drunk's word? Whose word else? # speaker: Sergeant
Bring me more than a bottle, and I'll ride. # speaker: Sergeant
By morning the drunk man is in the toll cells, sleeping it off. He didn't ask for that.
-> hub_lusa

=== patrol_acts ===
~ outcome = "patrol"
~ names_vosk = "patrol"
~ give_money(bounty)
The sergeant reads the book entry twice and rolls the brass in his fingers. # place: Toll window
{ kiln_known or letter_fate != "none": He asks where the name has been seen, and you tell him: Kiln Camp. }
Kiln's outside our road. We ride anyway. # speaker: Sergeant
A patrol truck leaves at dawn, heading south.
It comes back after a few days with an empty seat. The crew say nothing. Kiln has shut the south bend to every Bowl truck for a season.
The sergeant counts {bounty} M across the window. # reveal: all
-> END

=== kin ===
~ outcome = "kin"
~ names_vosk = "kin"
The Granary yard is quiet. Hal's widow sits on the loading step with her hands in her lap. # page # place: The Granary
You tell her what you heard, and what stands behind it.
She says the name over, twice, as if tasting it.
Did he say it was quick? # speaker: Hal's widow
You tell her he didn't say.
{ runner:
  You tell her about the boot heel. She is silent for a long time. Then she asks where the man sleeps, and she walks out to the bridge that night and sits down beside him on the step. Neither of them speaks.
}
She nods. She doesn't ask for the patrol. She asks for nothing.
That night she walks out to the bridge and writes one more name in her own book, beside Hal's. She doesn't read it aloud.
-> END

=== south ===
You drive south until the road climbs to a bend between rock shoulders, and a truck stands crosswise on the rise with a Brann swivel bolted to its bed. # page # place: South bend
The rider sits on his fender in an Army coat with red thread at the cuff. He stands up when he sees your truck, and his hand goes to the gun, and then it doesn't.
You tell him who you are and what you read on the bridge. You tell him about the book and the letter.
{ skill("social") >= 2:
  ~ outcome = "answered"
  ~ names_vosk = "answered"
  You tell him that the names are read once a year and that every driver answers. You tell him that one name has never been answered, and that no one is going to ride after him if he comes to answer it himself.
  He's quiet for a long time. Then he pulls the cuff of his coat over his wrist.
  Ask Sefa if it's safe. Then ask Lusa if I may stand at the back. # speaker: Rider
  A year from now, one more voice may answer on the bridge. You ride back north with the wind in your face.
  -> END
- else:
  ~ outcome = "fled"
  ~ names_vosk = "fled"
  You say it badly. The rider's face goes pale, and then he's in his cab with the engine running.
  He swings round the rise. A shot cracks off the rock beside your truck, and a tire goes flat.
  { money() >= sergeant_fine:
    ~ pay(sergeant_fine)
    A Kiln rider passing by charges you for the lift out of the ditch. {sergeant_fine} M goes into his hand. # reveal: all
  }
  The rider doesn't come back to the bend. Kiln will say by dusk that a Bowl driver came asking after Karl Vosk.
  -> END
}

=== kept ===
~ outcome = "kept"
You say nothing. The lamps on the deck go out one by one. # place: The bridge deck
Lusa walks past you with her sheet under her arm.
Next year I'll read the same names. # speaker: Lusa
She doesn't look back. The name stays where you put it.
-> END

=== after_reading ===
Lusa is mending a strap on the crate by the well. # place: Bowl
{
  - names_vosk == "patrol": The patrol rode south. Bowl trucks use the long road now, and nobody says why.
  - names_vosk == "kin": Hal's widow lit a lamp at the bridge. Lusa says one more voice answered the names this year.
  - names_vosk == "answered": Lusa says a rider sent word through Sefa's families at the Salvage Yard asking where he may stand at the back. She hasn't answered him yet.
  - names_vosk == "fled": Lusa says nobody has seen the rider on the south bend since a Bowl truck was shot at there. She thinks a name has been lost.
  - outcome == "kept": Lusa read the same names again. She asks nothing of you.
}
-> END
