# view: page
# stat: money M's
# fact: halves_fit Bench: Duvall's half of the pin and yours meet face to face, with no gap.
# fact: report_seen Dispatch log: Corporal Teller's report says raiders ran wagon Seven down at the bend and the cannon went over the edge. Command wrote the wagon off.
# fact: heard_duvall Duvall: the gun came loose on the bend and swung into the cab. Nobody shot at them. Teller tied the gun down, and they walked.
# fact: offer_heard Yard: Corporal Teller offered M's to drop the stub down the sump. His stripes pay his sister's ration card.
INCLUDE world.ink

VAR halves_fit = false
VAR report_seen = false
VAR offer_heard = false
VAR heard_duvall = false
VAR price = 60
VAR fee = 20

=== start ===
# checkpoint: start
Lena looks at your truck through the shed door before she looks at you. Then at your hand, closed round something. # place: Nose, the Army bench
A young soldier sits on a crate by the bench with his left arm in a sling, sorting bolts into a tin with his right.
+ [Put the stub on the bench and say where it came from.]
  { wagon_pin == "held":
    ~ halves_fit = true
  }
  -> bench
+ [Put it back in your pocket and leave.]
  You leave her to her bolts. Behind you the soldier goes back to sorting, one-handed.
  -> END

=== bench ===
# checkpoint: bench
You set the stub down and tell her: the dead Army wagon in the hollow below the bend in the Bowl north road, the gun swung back over the cab, and this, out of the gun's ring.
{ wagon_pin == "held":
  Lena holds the stub up to the light, and her face goes still.
  Bright, flat, no rust, no saw marks. Nobody cut that. It broke in one go, with the gun pulling on it. # speaker: Lena
  Ilan. Come and look at this. # speaker: Lena
  The soldier comes over. He takes a half pin from his shirt pocket and sets it face-down on yours. The broken faces meet with no gap between them.
  Private Ilan Duvall. He was the gunner on wagon Seven. # speaker: Lena
  The pin went on the bend, and the gun came round into the cab. That's how my arm went. I picked my half off the cab floor. # speaker: Duvall
- else:
  Lena looks it over once and puts it down.
  Somebody beat the face off this. I can't read a break that isn't there. # speaker: Lena
  The soldier comes over and takes a half pin from his shirt pocket. He holds it beside yours. Its face is bright. Yours is a grey smear, and they don't meet.
  Private Ilan Duvall. He was the gunner on wagon Seven. # speaker: Lena
}
-> report

= report
# checkpoint: bench.report
I fitted that swivel by order, with one pin. I wrote to command that it would kill somebody, and they filed it. # speaker: Lena
Sergeant Kovac at dispatch logs every Army truck out and in. Here's his page for wagon Seven. I keep a copy, because my name's on the swivel. # speaker: Lena
She pulls a creased sheet from under a tin of bolts and flattens it with her rag.
Seven ; out ; cannon on swivel, one pin # head
Report ; Cpl Teller ; raiders at the bend, cannon torn off the wagon and lost over the edge # row
Margin ; Pvt Duvall ; pin sheared # row
Command ; by order ; wagon written off # row
Lost over the edge, it says. You took this stub out of the ring with the cannon still sitting on it. # speaker: Lena
It's the first thing you've heard her say slowly.
{ halves_fit:
  Ilan's half on its own is a bit of steel in a private's pocket. It could be off any truck. Yours came out of the ring on wagon Seven. Together they say this is the pin from wagon Seven, and your half stayed in the ring with the gun on it. # speaker: Lena
}
{ halves_fit:
  Give it to Kovac. Fixing the report is command's business, and command may never look. But a pin that snapped on the road is enough for Kovac to keep every truck with that mount in the yard. That much is his to do. # speaker: Lena
- else:
  With a clean face, I'd send you straight to Kovac. This one, he'd log as scrap, unless somebody saw the face before it was beaten. # speaker: Lena
}
You roll the stub under your thumb on the bench. An hour with a punch in a hot hollow, and it comes down to who gets to hold it.
The yard door opens. A corporal comes in with sun-dark forearms and stripes on his sleeve. He looks at the soldier's half, then at yours, then at his watch.
Corporal Teller. A word outside, driver. # speaker: Teller
-> hub

= hub
# checkpoint: bench.hub
+ {wagon_pin == "held"} [Send for Kovac and give him the stub.]
  ~ report_seen = true
  -> sign
+ {wagon_pin == "bent" and wagon_read} [Tell Lena what the face looked like before you ruined it.]
  ~ report_seen = true
  You tell her: bright, one clean slant, no saw marks and no rust. She listens with her rag still in her hands.
  That's a pin that snapped on the road. Tell Kovac that, the way you told me. # speaker: Lena
  -> sign
+ {(wagon_pin == "held" or wagon_read) and not offer_heard} [Ask Teller in front of Lena what happened on the bend. # check: social 2]
  ~ report_seen = true
  -> admit
+ {(wagon_pin == "held" or wagon_read) and offer_heard} [Take Teller back in and make him say it to Lena. # check: social 2]
  -> admit
+ {not offer_heard} [Step outside with Teller.]
  ~ offer_heard = true
  ~ report_seen = true
  The yard is hot and smells of the wash pit. Teller stands where the shed wall hides him from the bench. # page
  Look. I wrote that the cannon went over the edge. A wagon with no gun isn't worth a tow, so command wrote her off, and nobody drove out to look at the ring. # speaker: Teller
  Command's order says one pin holds if you take the bends slow. So if the pin goes on a bend, the driver took it fast. I was driving. # speaker: Teller
  In Nose a corporal's family eats on his card. My sister draws her bread on my stripes. Lose them, and her card goes back to the clerk, and she's got a boy of her own. # speaker: Teller
  Ilan says the pin broke. Lena says the pin broke. Kovac can't pull trucks off the road on a private's word or a mechanic's letter. A broken part out of the ring, he has to log as a fault. # speaker: Teller
  I'll pay you for it. It goes down the sump, and you never saw the hollow. # speaker: Teller
  He names a sum: {price} M. # reveal: all
  He checks his watch while he waits. It's a good sum. You think about the sister, and then about the soldier's arm, and you can't make them weigh the same.
  He stays out in the yard to wait for your answer. You go back in to the bench.
  -> hub
+ {not heard_duvall} [Ask Duvall what happened on the bend.]
  ~ heard_duvall = true
  The soldier looks at the yard door before he answers.
  We came down onto the bend a bit fast. The gun went loose and came round, all at once, and the back of it hit the cab where I sat. The corporal pulled me out. Nobody shot at us. There wasn't anybody to shoot. # speaker: Duvall
  Teller tied the gun down so it wouldn't swing again, and we walked. He wrote raiders at the desk. I told Kovac it was the pin, and he put me in the margin. # speaker: Duvall
  -> hub
+ {offer_heard} [Take Teller's M's.]
  -> sold
+ [Pocket the stub and leave.]
  Teller watches you go all the way to your truck. Lena doesn't look up.
  -> END

= sign
~ wagon_fate = "logged"
~ give_money(fee)
Lena sends Duvall across the yard. He comes back with Sergeant Kovac, who has the log under his arm and reads the page standing up. # page
You put the stub in his palm and tell him where it came from.
Out of wagon Seven's ring, with the cannon still on her. I log it. Army steel brought in pays a finder's rate. # speaker: Kovac
He counts {fee} M onto the bench, then writes the stub in under Teller's report in the same ink. He doesn't strike the report out.
The report is command's. Whether they read past the first line isn't mine to decide. # speaker: Kovac
Then he opens the depot list and draws a line through a pair of trucks that carry the same one-pin swivel. They stay off the road until Lena has looked at them.
Teller goes out to the yard without a word. Duvall picks up his half of the pin and puts it back in his shirt pocket.
If you drive down to Bowl, my mother buys her water at Hattie's well house. Tell her my arm's set. # speaker: Duvall
-> END

= admit
{ offer_heard:
  You call Teller in from the yard. # page
  You put it to him in front of Lena, with the stub between you on the bench: out in the yard he told you he wrote "over the edge" so nobody would drive out and look at the ring.
  I said nothing in the yard. It was dusty, and they were shooting. It was raiders. # speaker: Teller
- else:
  Teller is still waiting by the door for his word outside. You give it to him here instead. # page
  You put it to him in front of Lena, with the stub between you on the bench: his report says the cannon went over the edge, and you took this out of the ring with the cannon still sitting on it.
  Then I was wrong about the edge. It was dusty, and they were shooting. It was raiders. # speaker: Teller
}
{ passed():
  You don't argue.
  { wagon_saw:
    Then you ask him what the raiders shot with. You walked that hollow and found no casing in the grit and no bullet hole in the wagon.
  }
  You don't look at Teller. You look at Duvall, and so does Teller. The boy rubs the strap of his sling. When he speaks, he uses Teller's first name.
  Bram. You pulled me out of that cab. You were there when it came round. Say it. # speaker: Duvall
  Teller takes his hand off his watch. It's the soldier who breaks him, not you, and you're glad of it.
  The pin went on the bend, and the gun came round into the cab. I took the bend fast. I said raiders to keep my stripes. They pay my sister's ration card. # speaker: Teller
  Lena sends Duvall for Sergeant Kovac. Teller says it again in front of him and signs it. Kovac writes it under the raid report and crosses nothing out.
  Corporal. Water cart, from tomorrow. Leave the stripes on my desk. # speaker: Kovac
  And my sister's bread? # speaker: Teller
  A water carter's card feeds one man. Rations aren't mine to give. # speaker: Kovac
  Kovac holds out his hand for the stub. It's what you carried it up here for, and you give it to him. He counts out the finder's rate for it, {fee} M. Then he draws a line through a pair of depot trucks with the same swivel, off the road until Lena has looked at them.
  ~ wagon_fate = "admitted"
  ~ give_money(fee)
  If you drive down to Bowl, my mother buys her water at Hattie's well house. Tell her my arm's set. # speaker: Duvall
- else:
  You lean on it and tell him he lied in his report, that raiders don't leave a cannon behind. It comes out too fast and too loud, an accusation instead of a question. He hears that, and he steadies.
  I said it at the desk and I say it now. And this one was down in the hollow picking over Army property. Ask what else is in that truck. # speaker: Teller
  Lena sends Duvall for Sergeant Kovac. Kovac comes and logs the stub as found, with your name as the finder and Teller's word beside it, and leaves the report standing above both.
  You'd have had a finder's rate for that. The Corporal says you stripped her, and that's one word against another. I don't pay out on those. # speaker: Kovac
  ~ wagon_fate = "logged"
  He still draws a line through a pair of depot trucks with the same swivel. Teller goes out. Lena wipes her hands on her rag and looks at neither you nor Teller. You can't tell which of you she's angrier with.
}
-> END

= sold
~ give_money(price)
~ wagon_fate = "buried"
You go back out to the yard. Teller counts M's into your hand one at a time, and holds out his other hand for the stub. # page
{ wagon_pin == "bent":
  He doesn't look at its face. He doesn't know what he's looking for.
}
He walks it to the wash pit and drops it through the grate. You hear it hit water.
When you go back past the shed, Lena is writing on a scrap of sign-out sheet and doesn't look up. Duvall is turning his half of the pin over in his fingers. Kovac's page still says the cannon went over the edge, and the trucks with the same mount still go out in the morning.
-> END
