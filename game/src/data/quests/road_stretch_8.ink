# view: page
INCLUDE world.ink

VAR asked_hunters = false
VAR asked_run = false
VAR grief_said = "none"

=== start ===
# checkpoint: start
Dusk at the eighth fort, and the Keepers are counting the evening's trucks through the gate. # place: The eighth outpost # img: road_gate
Three and four trucks at a time came out of the badlands today, and some of them were army trucks from the old depots. Both of yours are still rolling. The scout is held together now with the yard's weld and most of the pay.
An old Keeper stands at the gate with a tally board, a man who has counted trucks for thirty years and looks it. He counts the hauler. He counts your scout. Then he stops counting and looks at the back of your neck, where your collar rides low. # page
I knew a man with a burn like that. # speaker: Bram
He says it mildly, the way you'd mention the weather. Then he turns to the next truck and goes on counting. # page
Your hand has gone to your neck without asking you. It has started to shake against the scar, and Ala is watching it. # page
-> hand

= hand
+ [Keep your hand still.]
  ~ hand_shook = false
  -> still
+ [Let it shake.]
  ~ hand_shook = true
  -> shaking

= still
You press the hand flat against your thigh and hold it there until the shaking stops. It costs more than the stretch did.
Ala watches you do it. She sees that it was a choice, and she doesn't say what she thinks of the choice.
-> news

= shaking
You leave it where it is. It shakes, and you let her see it shake.
Ala watches it for a long moment. She doesn't look away, and she doesn't ask. That is a courtesy, of a kind.
-> news

= news
# checkpoint: start.news
She sits down on the hauler's step with a strip of paper from the fort's relay, folded small. She does not count the pay into your hand. It is the first time she hasn't. # page
Hedda Vell has changed the reward. It pays for the crates burned now, not brought back. # speaker: Ala
She reads it flat, line by line, the way she reads a sum. # page
Her soldiers wouldn't fire on the Yards. They found it half empty, and the rest at the gate with my mother in front, and they went home. Blackwell has shut its gates. The forts have opened the road north to the sick, toll-free. # speaker: Ala
The second slip is in her mother's hand, a few lines, hard as a nail. # page
Don't come back. Keep going north. Maya asks for you every hour. # speaker: Sara
The third slip is Northgate's, in a clerk's neat hand. # page
Come. Your niece will drink our water. # speaker: Warden's relay
-> loss

= loss
# checkpoint: start.loss
She folds the slips together and puts them in her coat. There is one more, and she holds it a moment before she reads it. A boy named Teo, six, died on the verge outside the southern fort three days ago. His family had been turned back at the gate. The forts changed their minds the day after. # page
She is waiting to see what you do with that.
+ [Tell her you're sorry.]
  ~ grief_said = "sorry"
  You say it. She takes it the way she takes an M, and checks it.
  Don't. Not yet. # speaker: Ala
  -> why
+ [Ask what she needs.]
  ~ grief_said = "ask"
  Nothing you carry, she says. It is the first time she has refused you something kindly.
  -> why
+ [Say nothing.]
  ~ grief_said = "silent"
  You don't say you're sorry. It would not help her, and she'd hold it against you.
  -> why

= why
Eight stretches, and you're still here with your hands on the wheel. Nobody does that for the pay. So why do you do this? # speaker: Ala
-> hub

= hub
# checkpoint: start.hub
She waits. At the gate the tally goes on. # page
-> menu

= menu
+ {not asked_hunters} [Why do so many hunt the truck?]
  ~ asked_hunters = true
  Because of what Blackwell paid, and because of what the bar says. On the hiring night a hunter sat at my table, and I said too much. By morning every driver on the road knew that I carry a cure. # speaker: Ala
  It isn't one. It's forty years of a doctor's notes, and they say that children from poisoned ground got well on the valley's water, season after season. The cure is the spring. The notes are the proof. # speaker: Ala
  She doesn't smile. She's too tired to.
  -> menu
+ {not asked_run} [Why don't you leave the truck and run?]
  ~ asked_run = true
  Run where? Two hundred people are walking north behind this truck. They can't stop, because there's nothing behind them to stop for. Maya's among them, or soon will be. # speaker: Ala
  My father died on this road because he wouldn't leave his tanker. I'll be damned if I do less. # speaker: Ala
  { not father_told:
    Jon, his name was. A linked driver, in the first water convoy Blackwell sent, and the <term=burnt_drivers>Burnt Drivers</term> took it at the pass sixteen years ago. I haven't told you that. # speaker: Ala
    You know the pass. You know which wall of it the sun leaves first. You keep your eyes on the tally board.
  }
  -> menu
+ [I thought this road would finish me.]
  ~ why_answer = "finish"
  -> finish
+ {promised} [I promised.]
  ~ why_answer = "promised"
  -> promised_answer
+ [The pay.]
  ~ why_answer = "pay"
  -> for_pay
+ [Say nothing.]
  ~ why_answer = "silent"
  -> silent

= finish
Out it comes, flat, and it's true. That was the plan: a road long enough, enough trucks, and sooner or later one of them would be the one. It never is.
Ala looks at you for a time. Her face doesn't change.
That's honest. It's also a terrible reason to hire a man. # speaker: Ala
She almost smiles, and doesn't.
-> close

= promised_answer
Two words, and you don't add a third.
Ala's face does something you haven't seen it do. She looks at the hauler instead of at you, and she nods at the hauler.
I know. I remember. # speaker: Ala
-> close

= for_pay
The pay, you tell her, as if the pay were a reason.
Nobody stays for the pay. # speaker: Ala
She says it without any heat. She's seen through it, and she lets you keep it.
-> close

= silent
You say nothing. The gate goes on counting.
She nods slowly, as if she'd put a price on the silence. Maybe she has.
-> close

= close
# checkpoint: start.close
Ala gets up and brushes off her coat. She walks to the hauler and stands with her hand on the door for a moment, longer than it takes to open. # page
Tomorrow. # speaker: Ala
You go and check the gun pins, both of them. { hand_shook: Your hand shakes through the first pin and is steady by the second. }{ not hand_shook: Your hand is steady, and you wonder how much it cost. } # page
-> END
