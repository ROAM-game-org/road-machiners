# view: page
INCLUDE world.ink

VAR asked_hunters = false
VAR asked_run = false

=== start ===
# checkpoint: start
Dusk at the eighth fort, and the Keepers are counting the evening's trucks through the gate. # place: The eighth outpost
Three and four trucks at a time came out of the badlands today, and some of them were army trucks with the paint still on. You drove at all of them. Ala drove straight through the middle of what was left.
An old Keeper stands at the gate with a tally board, a man who has counted trucks for thirty years and looks it. He counts the hauler. He counts your scout. Then he stops counting and looks at your collar. # page
I knew a man with a burn like that. # speaker: Old gatekeeper
He says it mildly, the way you'd mention the weather. Then he turns to the next truck and goes on counting. # page
Your hand has gone to your neck without asking you. It's shaking against the scar. You take it away, and the shaking goes on without you.
Ala has seen it. She watched your hand the whole time. { ring_told == "told": She knows what the scar cost. She says nothing about the plug. } # page
-> news

= news
# checkpoint: start.news
She sits down on the hauler's step with a strip of paper from the fort's relay, folded small. She doesn't count anything.
Hedda Vell had my father shot in the refinery yard. In front of the crews. It happened while we were at the fourth fort. # speaker: Ala
Her voice is level. It stays level, which is worse.
You don't say you're sorry. It would be a coin she'd have to count. # page
She folds the paper once more and puts it in her coat. # page
You've driven for me eight stretches, and you don't want the money. So why do you do this? # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
She waits. Nobody counts anything. Behind her at the gate the tally goes on without a sound. # page
-> menu

= menu
+ {not asked_hunters} [Why do so many hunt the truck?]
  ~ asked_hunters = true
  Because of what Blackwell paid and what the bar says. I said it in the fort bar last night, with a drink in me, where I was going. By morning every driver on the road knew. # speaker: Ala
  She doesn't smile. She's too tired to.
  -> menu
+ {not asked_run} [Why don't you leave the truck and run?]
  ~ asked_run = true
  Run where? The crews are in Blackwell's yard, and the families are at the last fort south of here. Northgate will take one crew, one truck, and I'm that truck. The books in the trailer are how they get in. # speaker: Ala
  Without them they're Blackwell's children and nothing else. I carry two hundred people. They don't get to know it yet. # speaker: Ala
  -> menu
+ [Answer her.]
  -> why

= why
# checkpoint: start.why
She asked you something, and she's still waiting for it. The gate, the board, the old Keeper's flat voice, none of it is going to answer for you. # page
+ [I thought this road would finish me.]
  ~ why_answer = "finish"
  -> finish
+ [The pay.]
  ~ why_answer = "pay"
  -> for_pay
+ [Say nothing.]
  ~ why_answer = "silent"
  -> silent

= finish
Out it comes, flat, and it's true. That was the plan: a road long enough, enough trucks, and sooner or later one of them would be the one. It never is.
Ala looks at you for a time. Her face doesn't change.
That's honest. Then you're the worst-paid man on the road. # speaker: Ala
She almost smiles, and doesn't.
-> close

= for_pay
The pay, you tell her, as if the pay were a reason.
You've never once counted it. # speaker: Ala
She says it without any heat. She's seen through it, and she lets you keep it.
-> close

= silent
You say nothing. The gate goes on counting.
She nods slowly, as if she'd put a price on the silence. Maybe she has.
-> close

= close
# checkpoint: start.close
Ala gets up and brushes off her coat. She walks to the hauler and stands with her hand on the door for a moment, longer than it takes to open. # page
Tomorrow, then. Same pay. # speaker: Ala
That's all. You go and check the pins, and you find out you're the one who needed it. # page
-> END
