# view: page
# stat: money Money
# fact: saw_hooks By the hooks, through the smoke glass: the soldier marks each hung rifle by its stock stamp, wheel or hook, and by the hand that hung it.
# fact: asked_drinkers Green Pit tables: a Kiln rider says the soldier asks nothing and only counts. A Yard welder says he counted her crew too.
# fact: read_tally His sheet: a column of faces and stamps. Yard crews sit beside Kiln riders on every line, and the glass cutter from the Yard stalls is on one.
# fact: saw_drop Silver's post, inside the Yard: a clerk pins the sheet by the captain's door and inks a line under it. Yard crews drink with raiders.
# fact: soldier_talked The soldier: the sergeant takes his sheet each week, and the clerk takes it from the sergeant.
INCLUDE world.ink

VAR lens_held = false
VAR saw_hooks = false
VAR asked_drinkers = false
VAR read_tally = false
VAR saw_drop = false
VAR soldier_talked = false
VAR soldier_shut = false
VAR lens_price = 15
VAR bribe = 40
VAR fee = 20
VAR outcome = "none"

=== start ===
# checkpoint: start
{
  - outcome != "none" or hooks_report != "none": -> after_hooks
}
Pim Arslan sits behind a plank counter with a diamond saw and a heap of dark glass, and the saw whines every time she touches a lump of it. She holds a lens up to the sun and squints through it before she looks at you. # place: Salvage Yard stalls
Glass from the Flats. It cuts the glare and shows what the glare hides, which is more useful than it sounds. # speaker: Pim
She sets the lens down and rubs her thumb on her apron, as if the glass had left something there.
I've a favor to ask of somebody who doesn't look like anybody. I haven't found such a person yet. # speaker: Pim
-> hub

= hub
# checkpoint: start.hub
+ {not lens_held} [Buy a smoke lens. # cost: {lens_price}]
  ~ lens_held = true
  She wraps it in a rag and sets it in your hand. It's cool and heavier than it looks.
  Look through it before you decide what you see. # speaker: Pim
  -> hub
+ [Ask what the favor is.]
  -> errand
+ [Goodbye.]
  -> END

=== errand ===
Pim lowers her voice, though only the stalls are listening. # place: Salvage Yard stalls
It's about Hadiza Okon, who runs the pump and the canteen at Green Pit. She feeds anyone once, and she has a rule at her door. Everybody hangs their rifle on a hook by the threshold before they drink, so that raiders, haulers and Yard crews can share one room without a gun in it. # speaker: Pim
A Nose soldier from Silver's post sits by those hooks now. He's polite, and he writes. Hadiza wants to know what he writes and who reads it, and she asked me for someone she doesn't know. # speaker: Pim
You're nobody she knows. I scratched the lean lines of the Flats' glass on a plate and hung it by her door, so she'll listen if you say I sent you. # speaker: Pim
+ [I'll go to Green Pit.]
  ~ note("hooksSoldier")
  Tell her I sent you. And hang your rifle on the hook, because nobody drinks there with it on. # speaker: Pim
  -> arrive
+ [Not my fight.]
  Then drink somewhere else. # speaker: Pim
  -> END

=== arrive ===
Green Pit is a pump yard behind a wall of stacked drums under green tarp. Water tanks stand over it on steel legs, the pump thuds day and night, and the air smells of wet iron and diesel. # page # place: Green Pit
Hadiza's canteen leans against the tank wall. Rifles hang on the iron hooks by its door, many of them, like coats in a hall. A scratched plate hangs beside them, and every line on it leans the same way.
{ found("green-pit"): You know the place. | In a dry year the pump draws mud by noon. Nobody here says so out loud. }
Hadiza Okon fills a cup before you speak.
Hang it on the hook. Everyone drinks here, and nobody takes my pump. # speaker: Hadiza
Her chin points at a young man in a Nose coat on a stool by the hooks. He has a sheet on a board across his knees.
That's the soldier. He came with the dry year. He sits, he watches, and he writes. # speaker: Hadiza
I feed him once a day, same as anyone. I want to know what he writes and who reads it. Then I want you to tell me what I should do about it. # speaker: Hadiza
-> hooks

=== hooks ===
# checkpoint: hooks
The soldier doesn't look up. The pump thuds behind the wall, and now and then a rifle clinks on its hook. # page # place: Green Pit
{ not saw_hooks: A man who watches the watcher gets seen. }
+ {not saw_hooks} [Watch him from the drums.]
  -> watch
+ {not asked_drinkers} [Ask the tables about him.]
  -> drinkers
+ {saw_hooks and not read_tally} [Read his sheet while Hadiza feeds him.]
  -> tally
+ {asked_drinkers and not soldier_talked and not soldier_shut} [Sit down beside the soldier.]
  -> soldier
+ {not saw_drop} [Follow him when he leaves with the sheet.]
  -> follow
+ {saw_drop} [Go to Hadiza with what you know.]
  -> decide
+ {saw_drop} [Carry the clerk's line to the Administrator.]
  -> sully
+ [Leave.]
  -> END

=== watch ===
You sit on an upturned drum by the tank wall. # place: Green Pit
{ lens_held or skill("perception") >= 2:
  ~ saw_hooks = true
  { lens_held:
    You hold the dark glass to your eye, and the soldier becomes a shape on a stool with the light carved out of his edges.
  - else:
    You look at nothing in particular and watch him from the edge of your eye, the way a hunter watches a bird.
  }
  A hauler hangs a rifle. The soldier doesn't move his head, but his pencil moves.
  A Kiln rider hangs one, and the pencil moves again. A welder from the Yard comes next, then another rider, and the pencil keeps pace.
  He never looks at the faces. He looks at the stocks, at the stamp cut into the wood, a wheel or a hook. He writes the stamp, and then he writes who hung it.
  -> hooks
- else:
  You stare at the soldier for far too long. He lifts his head, meets your eyes and writes a line on his sheet.
  ~ post_file = "named"
  He doesn't say a word, but the pencil has got your face now.
  -> hooks
}

=== drinkers ===
~ asked_drinkers = true
The tables go quiet when you ask, then loosen. # place: Green Pit
He asks nothing. He only counts. # speaker: Kiln rider
He counted my crew when I was here with the Yard. Names, I think. I don't like my name written down. # speaker: Yard welder
Hadiza doesn't like it either. She says so with the soup. # speaker: Kiln rider
-> hooks

=== soldier ===
You sit down beside him. He moves the board a hand's width away and says nothing for a while. # place: Green Pit
{ skill("social") >= 2:
  ~ soldier_talked = true
  You ask him how his week has been. You ask where he's from and whether his mother knows where he sits. He answers the first, then the second, and then his shoulders drop.
  I count. I write what I count. The sergeant takes the sheet at the week's end, and the clerk takes it from the sergeant. I don't know what the clerk does with it. # speaker: Soldier
  Hadiza feeds me once a day, and I eat all of it. I'm sorry for what I write. # speaker: Soldier
  He looks at the hooks, not at you.
  -> hooks
- else:
  ~ soldier_shut = true
  You ask what he writes. He closes the board against his chest.
  I count. That's all, and I'm not to say more. # speaker: Soldier
  He watches you for the rest of the evening, and he writes when you reach for your cup.
  ~ post_file = "named"
  -> hooks
}

=== tally ===
~ read_tally = true
~ note("hooksSheet")
Hadiza brings the soldier a bowl and talks about the pump. He sets the board down on his knee to take it. # place: Green Pit
You have the sheet in your hands for as long as it takes to read it.
Stamp; Hung by # head
Wheel; Hauler # row
Hook; Kiln rider # row
Wheel; Yard welder # row
Plate by the door; Glass cutter from the Yard stalls # row
Hook; Kiln rider # row
Wheel; Yard welder # row
Every line names a face. The Yard welders and the Kiln riders hang side by side on each one.
You put it back as you found it.
-> hooks

=== follow ===
At week's end the soldier climbs into a Nose truck with the sheet inside his coat. # place: The road to the Yard
{ skill("driving") >= 2:
  ~ saw_drop = true
  ~ note("hooksDrop")
  You keep a long way behind, using the dust of other trucks and the dips in the road. He never looks in his mirror.
  The Yard crane stands over the stacked wrecks. Silver's post sits inside the gate, a Nose flag over a tin roof.
  The soldier hands the sheet to a clerk. The clerk doesn't read it. He pins it to a board by the captain's door.
  A second hand has inked a line under it. Yard crews drink with raiders. # reveal: all
  The line is in better ink than the sheet.
  -> hooks
- else:
  You stay too close. At the first long straight the soldier's mirror catches your grille.
  He stops and gets out. Without a word he writes down the number of your truck, and then he drives on.
  ~ post_file = "named"
  -> hooks
}

=== decide ===
Hadiza stands in the doorway of the inn with a cup in her hand, waiting. # page # place: Green Pit
The soldier writes the marks and the faces, and the captain's clerk adds the rest. # speaker: Hadiza
{ read_tally: You read his sheet. It names who hangs beside whom. # speaker: Hadiza }
Tell me what I do. # speaker: Hadiza
+ [Tell her all of it and let her settle it.]
  -> told
+ [Pay the soldier to write the marks and leave out the faces. # cost: {bribe}]
  -> bought
+ [Talk the soldier into writing the stamps and nothing else.]
  -> turned
+ [Read his sheet aloud to every table.]
  -> exposed
+ [Say nothing yet.]
  -> hooks

=== told ===
~ outcome = "told"
~ hooks_report = "told"
~ give_money(fee)
You tell Hadiza everything: the marks, the faces, the clerk's second hand and the captain's door. # place: Green Pit
{ read_tally: You tell her about the plate and the glass cutter's line. She says Pim's name softly, once, and does not say it again. }
She says nothing until you finish. Then she sets the cup down and goes to the soldier.
She feeds him at her own table, a full meal, with a cup of the good water.
Eat. Then write the stamps. The faces are mine. # speaker: Hadiza
He lowers his eyes and nods. She doesn't ask whether he means it.
She counts {fee} M into your hand for the telling. # reveal: all
The hooks go on holding the rifles. Nobody can say how many sheets reach the captain with faces on them.
-> END

=== bought ===
~ outcome = "bought"
~ hooks_report = "bought"
You take the soldier aside behind the inn and put {bribe} M in his hand. # place: Green Pit
He looks at the coins, then at the hooks, then at you. He is quiet for a long time.
I write the stamps. I don't write faces. # speaker: Soldier
He tucks the money inside his coat.
The sheets go to the captain thinner after that. The clerk's second hand has less to ink under them.
Hadiza says nothing to you. She fills your cup, which is as much as she says to anyone.
-> END

=== turned ===
{ skill("social") >= 2:
  ~ outcome = "turned"
  ~ hooks_report = "turned"
  You find the soldier alone by the well and speak to him as one man speaks to another who was handed a pencil. You tell him what the faces on his sheet are used for, and what Hadiza has fed him.
  He's quiet for a while. Then he draws a line down the margin of his board and writes only the stamp column.
  They'll send another, you know. But for as long as it's me, I'll write what I'm told and not what I could. # speaker: Soldier
  Hadiza fills your cup when you come in, which is the way she says thanks.
  -> END
- else:
  ~ post_file = "named"
  You find the soldier alone by the well and speak to him badly. He listens to the end, white-faced, and he says nothing back.
  The sheet that reaches the clerk that week has a new line under Hadiza's door. The Yard welders are underlined, and a stranger who talks to the soldier is named at the bottom.
  Hadiza fills your cup last.
  -> hooks
}

=== exposed ===
~ outcome = "exposed"
~ hooks_report = "exposed"
~ yard_power = "post"
You stand on a table and read the sheet aloud. Every stamp, every face, every line of the clerk's second hand. # place: Green Pit
The inn goes still. A Kiln rider takes his rifle off the hook and doesn't put it back.
The Yard welders look at each other. A hauler laughs, then stops.
By midnight the benches are half empty. Rifles leave the hooks in ones and pairs. Nobody argues, and nobody sits.
Hadiza fills your cup last.
I asked you to find out. I didn't ask you to say it. # speaker: Hadiza
The soldier sits on his stool until dawn with his board on his knees. Nobody comes to eat with him.
-> END

=== sully ===
~ outcome = "sully"
~ hooks_report = "sully"
~ yard_power = "yard"
~ post_file = "named"
You tell the Administrator about the sheet and the line in better ink. He listens with the coin still in his hand. # page # place: Crane office
He asks you to say the line again. You say it, and he writes it down.
Yard crews drink with raiders. A fine charge, friend, for a post that has been drinking from the Yard's well for a year. # speaker: Sully
I'll put it in front of the Committee in Nose. They owe Pierce more than they owe me, and they hate being asked what a soldier is doing with a pencil. # speaker: Sully
He doesn't say whose name will go beside the line.
-> END

=== after_hooks ===
Pim is cutting a lens at her plank counter. # place: Salvage Yard stalls
{
  - hooks_report == "told": The hooks still hold rifles at Green Pit, she says. Hadiza sent word that the soldier eats there and writes less.
  - hooks_report == "bought": She says the soldier still sits at Green Pit, but a second soldier turned up there this week and doesn't take coin.
  - hooks_report == "turned": She says the soldier writes stamps now and nothing more. A different pencil may come, and Hadiza knows it.
  - hooks_report == "exposed": She says the hooks at Green Pit hold few rifles now. Drivers drink at the Yard instead, where nobody hangs anything.
  - hooks_report == "sully": She says the Administrator has a page on his desk with a line in better ink. She hasn't been to Green Pit since.
}
-> END
