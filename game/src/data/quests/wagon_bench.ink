# view: page
# stat: money M's
# fact: halves_fit Bench: Duvall's half of the brake rod and yours meet face to face, with no gap.
# fact: report_seen Dispatch log: Corporal Teller's report says raiders ran wagon Seven down at the bend and the cannon went over the edge. Command wrote the wagon off.
# fact: heard_duvall Duvall: the brake rod went on the bend, and the wagon couldn't slow. She hit the verge and went over. Nobody shot at them, and they walked.
# fact: offer_heard Yard: Corporal Teller offered M's to drop the half rod down the sump. His stripes pay his sister's ration card.
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
+ [Put the half rod on the bench and say where it came from.]
  { wagon_rod == "held":
    ~ halves_fit = true
  }
  -> bench
+ [Put it back in your pocket and leave.]
  You leave her to her bolts. Behind you the soldier goes back to sorting, one-handed.
  -> END

=== bench ===
# checkpoint: bench
You set the half rod down and tell her: the dead Army wagon in the hollow below the bend in the Bowl north road, the cannon still on her bed, and this, out of her brake linkage.
{ wagon_rod == "held":
  Lena holds the half rod up to the light, and her face goes still.
  Bright, flat, no rust, no saw marks. Nobody cut that. It broke in one go, with the brakes pulling on it. # speaker: Lena
  Ilan. Come and look at this. # speaker: Lena
  The soldier comes over. He takes half a brake rod from his shirt pocket and sets it face-down on yours. The broken faces meet with no gap between them.
  Private Ilan Duvall. He was the relief driver on wagon Seven. # speaker: Lena
  The rod went on the bend, and she wouldn't slow. We hit the verge, and that's how my arm went. I picked my half out of the wreck. # speaker: Duvall
- else:
  Lena looks it over once and puts it down.
  Somebody beat the face off this. I can't read a break that isn't there. # speaker: Lena
  The soldier comes over and takes half a brake rod from his shirt pocket. He holds it beside yours. Its face is bright. Yours is a grey smear, and they don't meet.
  Private Ilan Duvall. He was the relief driver on wagon Seven. # speaker: Lena
}
-> report

= report
# checkpoint: bench.report
Command bought cheap brake rods for the depot trucks, and I fitted them by order. I wrote to command that they would kill somebody, and they filed it. # speaker: Lena
Sergeant Kovac at dispatch logs every Army truck out and in. Here's his page for wagon Seven. I keep a copy, because my name's on her brakes. # speaker: Lena
She pulls a creased sheet from under a tin of bolts and flattens it with her rag.
Seven ; out ; cannon on swivel, depot brake rods # head
Report ; Cpl Teller ; raiders at the bend, cannon lost over the edge # row
Margin ; Pvt Duvall ; brake rod snapped # row
Command ; by order ; wagon written off # row
Raiders, it says. Raiders strip a cannon, and hers is still bolted to her bed. And raiders don't snap a brake rod. # speaker: Lena
It's the first thing you've heard her say slowly.
{ halves_fit:
  Ilan's half on its own is a bit of steel in a private's pocket. It could be off any truck. Yours came out of the linkage on wagon Seven. Together they say this is the brake rod from wagon Seven, and your half stayed on her with the cannon. # speaker: Lena
}
{ halves_fit:
  Give it to Kovac. Fixing the report is command's business, and command may never look. But a rod that snapped on the road is enough for Kovac to keep every truck with those rods in the yard. That much is his to do. # speaker: Lena
- else:
  With a clean face, I'd send you straight to Kovac. This one, he'd log as scrap, unless somebody saw the face before it was beaten. # speaker: Lena
}
You roll the half rod under your thumb on the bench. An hour with a punch in a hot hollow, and it comes down to who gets to hold it.
The yard door opens. A corporal comes in with sun-dark forearms and stripes on his sleeve. He looks at the soldier's half, then at yours, then at his watch.
Corporal Teller. A word outside, driver. # speaker: Teller
-> hub

= hub
+ {wagon_rod == "held"} [Send for Kovac and give him the half rod.]
  ~ report_seen = true
  -> sign
+ {wagon_rod == "bent" and wagon_read} [Tell Lena what the face looked like before you ruined it.]
  ~ report_seen = true
  You tell her: bright, one clean slant, no saw marks and no rust. She listens with her rag still in her hands.
  That's a rod that snapped on the road. Tell Kovac that, the way you told me. # speaker: Lena
  -> sign
+ {(wagon_rod == "held" or wagon_read) and not offer_heard} [Ask Teller in front of Lena what happened on the bend. # check: social 2]
  ~ report_seen = true
  -> admit
+ {(wagon_rod == "held" or wagon_read) and offer_heard} [Take Teller back in and make him say it to Lena. # check: social 2]
  -> admit
+ {not offer_heard} [Step outside with Teller.]
  ~ offer_heard = true
  ~ report_seen = true
  The yard is hot and smells of the oil sump. Teller stands where the shed wall hides him from the bench. # page
  Look. I wrote that raiders ran her down and the cannon went over the edge. A wagon down a slope isn't worth a tow, so command wrote her off, and nobody drove out to look at her brakes. # speaker: Teller
  Command's order says a depot rod holds if you take the bends slow. So if a rod goes on a bend, the driver took it fast. I was driving. # speaker: Teller
  In Nose a corporal's family eats on his card. My sister draws her bread on my stripes. Lose them, and her card goes back to the clerk, and she's got a boy of her own. # speaker: Teller
  Ilan says the rod broke. Lena says the rod broke. Kovac can't pull trucks off the road on a private's word or a mechanic's letter. A broken part off her brakes, he has to log as a fault. # speaker: Teller
  I'll pay you for it. It goes down the sump, and you never saw the hollow. # speaker: Teller
  He names a sum: {price} M. # reveal: all
  He checks his watch while he waits. It's a good sum. You think about the sister, and then about the soldier's arm, and you can't make them weigh the same.
  He stays out in the yard to wait for your answer. You go back in to the bench.
  -> hub
+ {not heard_duvall} [Ask Duvall what happened on the bend.]
  ~ heard_duvall = true
  The soldier looks at the yard door before he answers.
  We came down onto the bend a bit fast. The corporal stood on the brakes, and the pedal went to the floor. She hit the verge and went over, and the door came in on my arm. The corporal pulled me out. Nobody shot at us. There wasn't anybody to shoot. # speaker: Duvall
  We climbed out of the hollow and walked. He wrote raiders at the desk. I told Kovac it was the brake rod, and he put me in the margin. # speaker: Duvall
  -> hub
+ {offer_heard} [Take Teller's M's.]
  -> sold
+ [Pocket the half rod and leave.]
  Teller watches you go all the way to your truck. Lena doesn't look up.
  -> END

= sign
~ wagon_fate = "logged"
~ give_money(fee)
Lena sends Duvall across the yard. He comes back with Sergeant Kovac, who has the log under his arm and reads the page standing up. # page
You put the half rod in his palm and tell him where it came from.
Off wagon Seven's brakes, with the cannon still on her. I log it. Army steel brought in pays a finder's rate. # speaker: Kovac
He counts {fee} M onto the bench, then writes the half rod in under Teller's report in the same ink. He doesn't strike the report out.
The report is command's. Whether they read past the first line isn't mine to decide. # speaker: Kovac
Then he opens the depot list and draws a line through two trucks that run on the same cheap rods. They stay off the road until Lena has looked at them.
Teller goes out to the yard without a word. Duvall picks up his half of the rod and puts it back in his shirt pocket.
-> END

= admit
{ offer_heard:
  You call Teller in from the yard. # page
  You put it to him in front of Lena, with the half rod between you on the bench: out in the yard he told you he wrote raiders so nobody would drive out and look at her brakes.
  I said nothing in the yard. It was dusty, and they were shooting. It was raiders. # speaker: Teller
- else:
  Teller is still waiting by the door for his word outside. You give it to him here instead. # page
  You put it to him in front of Lena, with the half rod between you on the bench: his report says raiders, and you took this off her brakes with the cannon still bolted to her bed.
  Then they left the cannon. It was dusty, and they were shooting. It was raiders. # speaker: Teller
}
{ passed():
  You don't argue.
  { wagon_saw:
    Then you ask him what the raiders shot with. You walked that hollow and found no casing in the grit and no bullet hole in the wagon.
  }
  You don't look at Teller. You look at Duvall, and so does Teller. The boy rubs the strap of his sling. When he speaks, he uses Teller's first name.
  Bram. You pulled me out of that cab. You stood on that pedal, and nothing happened. Say it. # speaker: Duvall
  Teller takes his hand off his watch. It's the soldier who breaks him, not you, and you're glad of it.
  The brake rod went on the bend, and she went over. I took the bend fast. I said raiders to keep my stripes. They pay my sister's ration card. # speaker: Teller
  Lena sends Duvall for Sergeant Kovac. Teller says it again in front of him and signs it. Kovac writes it under the raid report and crosses nothing out.
  Corporal. Barrel runs, from tomorrow. Leave the stripes on my desk. # speaker: Kovac
  And my sister's bread? # speaker: Teller
  A barrel runner's card feeds one man. Rations aren't mine to give. # speaker: Kovac
  Kovac holds out his hand for the half rod. It's what you carried it up here for, and you give it to him. He counts out the finder's rate for it, {fee} M. Then he draws a line through two depot trucks with the same rods, off the road until Lena has looked at them.
  ~ wagon_fate = "admitted"
  ~ give_money(fee)
- else:
  You lean on it and tell him he lied in his report, that raiders don't leave a cannon behind. It comes out too fast and too loud, an accusation instead of a question. He hears that, and he steadies.
  I said it at the desk and I say it now. And this one was down in the hollow picking over Army property. Ask what else is in that truck. # speaker: Teller
  Lena sends Duvall for Sergeant Kovac. Kovac comes and logs the half rod as found, with your name as the finder and Teller's word beside it, and leaves the report standing above both.
  You'd have had a finder's rate for that. The Corporal says you stripped her, and that's one word against another. I don't pay out on those. # speaker: Kovac
  ~ wagon_fate = "logged"
  He still draws a line through two depot trucks with the same rods. Teller goes out. Lena wipes her hands on her rag and looks at neither you nor Teller. You can't tell which of you she's angrier with.
}
-> END

= sold
~ give_money(price)
~ wagon_fate = "buried"
You go back out to the yard. Teller counts M's into your hand one at a time, and holds out his other hand for the half rod. # page
{ wagon_rod == "bent":
  He doesn't look at its face. He doesn't know what he's looking for.
}
He walks it to the oil sump and drops it through the grate. You hear it hit the oil.
When you go back past the shed, Lena is writing on a scrap of sign-out sheet and doesn't look up. Duvall is turning his half of the rod over in his fingers. Kovac's page still says raiders, and the trucks with the same rods still go out in the morning.
-> END
