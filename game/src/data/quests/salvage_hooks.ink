# view: page
# stat: money Money
# fact: saw_hooks By the hooks, through the smoke glass: the soldier marks each hung rifle by its stock stamp, wheel or hook, and by the hand that hung it.
# fact: asked_drinkers Green Pit tables: a Kiln rider says the soldier asks nothing and only counts. A Yard welder says he counted her crew too.
# fact: read_tally His sheet: a column of faces and stamps. Yard crews sit beside Kiln riders on every line.
# fact: saw_drop Silver's post, inside the Yard: a clerk pins the sheet by the captain's door and inks a line under it. Yard crews drink with raiders.
INCLUDE world.ink

VAR lens_held = false
VAR saw_hooks = false
VAR asked_drinkers = false
VAR read_tally = false
VAR saw_drop = false
VAR lens_price = 15
VAR bribe = 40
VAR fee = 50
VAR outcome = "none"

=== start ===
# checkpoint: start
{
  - outcome != "none" or hooks_report != "none": -> after_hooks
}
Pim Arslan sits behind a plank counter with a diamond saw and a heap of dark glass. # place: Salvage Yard stalls
She holds a lens up to the sun and squints through it before she looks at you.
Glass from the Flats. It cuts the glare and shows what the glare hides. # speaker: Pim
-> hub

= hub
# checkpoint: start.hub
+ {not lens_held} [Buy a smoke lens. # cost: {lens_price}]
  ~ lens_held = true
  She wraps it in a rag and sets it in your hand. It is cool and heavier than it looks.
  Look through it before you decide what you see. # speaker: Pim
  -> hub
+ [Ask what she wants.]
  -> errand
+ [Goodbye.]
  -> END

=== errand ===
Pim lowers her voice, though only the stalls are listening. # place: Salvage Yard stalls
Hadiza Okon keeps the well and the inn at Green Pit. She feeds anyone once, and nobody draws at her table. # speaker: Pim
A Nose soldier from Silver's post sits by her hooks now. He is polite. He writes. # speaker: Pim
She asked me for someone nobody knows. You are nobody she knows. # speaker: Pim
The glass is sand the ship melted when it came down. Every ripple leans one way. I scratched the lean lines on a plate and hung it by her door. # speaker: Pim
+ [I will go to Green Pit.]
  ~ note("hooksSoldier")
  Tell her I sent you. And hang your rifle. # speaker: Pim
  -> arrive
+ [Not my fight.]
  Then drink somewhere else. # speaker: Pim
  -> END

=== arrive ===
Green Pit lies in a dip, a well under a roof and an inn built around it. # page # place: Green Pit
Rifles hang on the hooks by the door, many of them, like coats. A scratched plate hangs beside them, every line leaning one way.
{ found("green-pit"): You know the place. | The well drops a hand's width when the year is dry. Nobody here says it aloud. }
Hadiza Okon fills a cup before you speak.
Hang it on the hook. Everyone drinks here, and nobody takes my well. # speaker: Hadiza
Her chin points to a young man in a Nose coat on a stool by the hooks. He has a sheet on a board across his knees.
That is the soldier. He came with the dry year. He sits, he watches, he writes. # speaker: Hadiza
I feed him once a day, like anyone. I want to know what he writes and who reads it. # speaker: Hadiza
Then I want you to tell me what to do about it. # speaker: Hadiza
-> hooks

=== hooks ===
# checkpoint: hooks
The soldier does not look up. The well drips behind the roof. # page # place: Green Pit
{ not lens_held: A man who watches the watcher gets seen. Dark glass would hide your eyes. }
+ {lens_held and not saw_hooks} [Watch him from the well through the smoke lens.]
  -> watch
+ {not asked_drinkers} [Ask the tables about him, and then the soldier.]
  -> drinkers
+ {saw_hooks and not read_tally} [Read his sheet while Hadiza feeds him.]
  -> tally
+ {not saw_drop} [Follow him when he leaves with the sheet.]
  -> follow
+ {saw_drop} [Go to Hadiza with what you know.]
  -> decide
+ [Leave.]
  -> END

=== watch ===
~ saw_hooks = true
You sit on the well curb and hold the dark glass to your eye. The soldier is just a shape on a stool. # place: Green Pit
A hauler hangs a rifle. The soldier does not move his head. His pencil does.
A Kiln rider hangs one. The pencil moves. A welder from the Yard, then another rider. The pencil keeps pace.
He never looks at the faces. He looks at the stocks, at the stamp cut into the wood, a wheel or a hook.
He writes the stamp. Then he writes who hung it.
-> hooks

=== drinkers ===
~ asked_drinkers = true
The tables go quiet when you ask, then loosen. # place: Green Pit
He asks nothing. He only counts. # speaker: Kiln rider
He counted my crew when I was here with the Yard. Names, I think. I don't like my name written. # speaker: Yard welder
Hadiza does not like it either. She says so with the soup. # speaker: Kiln rider
-> soldier

=== soldier ===
You sit down beside him. He moves the board a hand's width away and says nothing for a while. # place: Green Pit
I count. I write what I count. # speaker: Soldier
The sergeant takes the sheet when the week ends. I do not know what the sergeant does with it. # speaker: Soldier
Hadiza feeds me once a day. I eat it all. I am sorry for what I write. # speaker: Soldier
He looks at the hooks, not at you.
-> hooks

=== tally ===
~ read_tally = true
~ note("hooksSheet")
Hadiza brings the soldier a bowl and talks about the well. He sets the board down to take it. # place: Green Pit
You have the sheet in your hands for as long as it takes to read it.
Stamp; Hung by # head
Wheel; Hauler # row
Hook; Kiln rider # row
Wheel; Yard welder # row
Hook; Kiln rider # row
Wheel; Yard welder # row
Every line names a face. The Yard welders and the Kiln riders hang side by side on each one.
You put it back as you found it.
-> hooks

=== follow ===
~ saw_drop = true
~ note("hooksDrop")
At week's end the soldier climbs into a Nose truck with the sheet inside his coat. You keep a long way behind. # place: The road to the Yard
The Yard crane stands over the stacked wrecks. Silver's post sits inside the gate, a Nose flag over a tin roof.
The soldier hands the sheet to a clerk. The clerk does not read it. He pins it to a board by the captain's door.
A second hand has inked a line under it. Yard crews drink with raiders. # reveal: all
The line is in better ink than the sheet.
-> hooks

=== decide ===
Hadiza stands in the doorway of the inn with a cup in her hand, waiting. # page # place: Green Pit
The soldier writes the marks, and the faces, and the captain's clerk adds the rest. # speaker: Hadiza
{ read_tally: You read his sheet. It names who hangs beside whom. # speaker: Hadiza }
Tell me what I do. # speaker: Hadiza
+ [Tell her all of it and let her settle it.]
  -> told
+ [Pay the soldier to write the marks and leave out the faces. # cost: {bribe}]
  -> bought
+ [Read his sheet aloud to every table.]
  -> exposed
+ [Say nothing yet.]
  -> hooks

=== told ===
~ outcome = "told"
~ hooks_report = "told"
~ give_money(fee)
You tell Hadiza everything: the marks, the faces, the clerk's second hand, the captain's door. # place: Green Pit
She says nothing until you finish. Then she sets the cup down and goes to the soldier.
She feeds him at her own table, a full meal, with a cup of the good water.
Eat. Then write the stamps. The faces are mine. # speaker: Hadiza
He lowers his eyes. He nods. She does not ask if he means it.
She counts <b>{fee} M</b> into your hand for the telling. # reveal: all
The hooks go on holding the rifles. Nobody can say how many sheets reach the captain with faces on them.
-> END

=== bought ===
~ outcome = "bought"
You take the soldier aside behind the inn and put <b>{bribe} M</b> in his hand. # place: Green Pit
He looks at the coins, then at the hooks, then at you. He is quiet a long time.
I write the stamps. I do not write faces. # speaker: Soldier
He tucks the money inside his coat.
The sheets go to the captain thinner after that. The clerk's second hand has less to ink under them.
Hadiza says nothing to you. She fills your cup, which is as much as she says to anyone.
-> END

=== exposed ===
~ outcome = "exposed"
~ hooks_report = "exposed"
You stand on a table and read the sheet aloud. Every stamp, every face, every line of the clerk's second hand. # place: Green Pit
The inn goes still. A Kiln rider takes his rifle off the hook and does not put it back.
The Yard welders look at each other. A hauler laughs, then stops.
By midnight the benches are half empty. Rifles leave the hooks in ones and pairs. Nobody argues. Nobody sits.
Hadiza fills your cup last.
I asked you to find out. I did not ask you to say it. # speaker: Hadiza
The soldier sits on his stool until dawn with his board on his knees. Nobody comes to eat with him.
-> END

=== after_hooks ===
Pim is cutting a lens at her plank counter. # place: Salvage Yard stalls
{
  - hooks_report == "told": The hooks still hold rifles at Green Pit, she says. Hadiza sent word that the soldier eats there and writes less.
  - outcome == "bought": She says the soldier still sits at Green Pit. Hadiza feeds him once a day and says nothing.
  - hooks_report == "exposed": She says the hooks at Green Pit hold few rifles now. Drivers drink at the Yard instead, where no one hangs anything.
}
-> END
