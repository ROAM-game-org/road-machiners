# view: page
# stat: watches Watches
# stat: money M's
# stat: alarm Talk: quiet, talking, loud
# fact: ledger_read Ledger: cans went missing on the third, seventh and eleventh nights. Pell was on duty each time.
# fact: gate_checked Gate log: Corporal Vance signed out late on the third, seventh and eleventh nights, alone, with an empty truck bed.
# fact: saw_swap Fuel shed: Vance asked Pell to swap shifts tonight. Pell agreed without looking up. Vance has a scar across his chin.
# fact: knows_scar Sabine: a corporal brings her the cans. Big hands, a scar across the chin. Never a name.
# fact: found_seals Barracks: a tin of Army fuel seals under Vance's cot, cut clean.
# fact: saw_handoff Back fence: at dawn a corporal with a scar passed cans over the wire to a truck with Sabine's mark.
INCLUDE world.ink

VAR watches = 5
VAR alarm = 0
VAR ledger_read = false
VAR gate_checked = false
VAR pell_talked = false
VAR sabine_talked = false
VAR bunk_searched = false
VAR stakeout_done = false
VAR saw_swap = false
VAR knows_scar = false
VAR found_seals = false
VAR saw_handoff = false
VAR sabine_price = 20
VAR reward = 150
VAR envelope = 60

=== function facts_held() ===
~ return ledger_read + gate_checked + saw_swap + knows_scar + found_seals + saw_handoff

=== function knows_whom() ===
~ return gate_checked or saw_swap or knows_scar

=== function any_lead() ===
~ return knows_whom() or saw_handoff or ledger_read or pell_talked

=== start ===
# checkpoint: start
{ depot_thief == "open": -> desk }
Kovac shuts the dispatch door behind you before he says a word. # place: Dispatch office
The room smells of cold tea and machine oil, and the window rattles each time a truck passes the gate. On his desk lies a fuel can, empty, its Army seal cut clean through.
Fuel's walking out of my depot. A can here, a can there. Never enough to miss in a day, but the monthly count comes up short. # speaker: Kovac
A shipment leaves for the north road soon. I want the seller found before it rolls. Quietly. A thief who hears footsteps buries what he's taken. # speaker: Kovac
+ [I will look into it.]
  ~ depot_thief = "open"
  Good. Keep your questions soft. # speaker: Kovac
  -> desk
+ [Not my business.]
  Then we didn't speak. Close the door on your way out. # speaker: Kovac
  -> END

=== desk ===
# checkpoint: desk
The yard lies under a film of dust, and the shipment trucks stand fuelled by the gate with their engines ticking as they cool. # page # place: Dispatch office
{ alarm > 0: Two loaders stop talking as you pass, and they start again only when you are well beyond them. }
+ {not (ledger_read and gate_checked and bunk_searched and stakeout_done)} [Look around the depot…]
  -> look
+ {not pell_talked} [Talk to the fuel clerk.]
  -> pell
+ {not sabine_talked} [Talk to the trader by the gate.]
  -> sabine
+ {any_lead()} [Go to Kovac with a name.]
  -> accuse
+ [Let it go.]
  -> let_go

= look
+ {not ledger_read} [Read the depot ledgers.]
  -> ledger
+ {ledger_read and not gate_checked} [Check the gate log for the same nights.]
  -> gate
+ {(gate_checked or saw_swap) and not bunk_searched} [Search Vance's bunk.]
  -> bunk
+ {not stakeout_done} [Watch the depot all night.]
  -> stakeout
+ [Back.]
  -> desk

=== after ===
{
  - alarm >= 2: -> trail_lost
  - watches <= 0: -> last_call
  - else: -> desk
}

=== ledger ===
~ ledger_read = true
~ watches -= 1
The ledger lies open on Pell's desk, and each loss is written in the same careful hand, the figures leaning a little to the right. # place: Dispatch office
Night; Missing; On duty # head
3rd; 2 cans; Pell # row
7th; 3 cans; Pell # row
11th; 2 cans; Pell # row
The ink on the last line is still wet, and a faint sour smell of it hangs over the page.
-> after

=== gate ===
~ gate_checked = true
~ watches -= 1
The gate sentry hands over the log without a word, then goes back to watching the road. # place: Gatehouse
Night; Signed out late; Truck bed # head
3rd; Ostrow; water drums # row
3rd; Vance; empty # row
7th; Vance; empty # row
11th; Ruiz; scrap # row
11th; Vance; empty # row
Every one of Vance's lines ends with the same note, written small: <i>back before dawn</i>.
-> after

=== pell ===
~ pell_talked = true
~ watches -= 1
{ ledger_read: -> swap }
Pell talks without stopping, about the dust, his bad back and the thin soup at the mess. His eyes slide past the ledger on his desk every time the talk comes near it. # place: Fuel shed
-> after

= swap
You mention the ledger. Pell's pen stops moving. # place: Fuel shed
The door bangs open and a corporal fills the frame, big hands hanging loose at his sides, a scar white across his chin.
Pell. I want tonight's shift again. Swap with me. # speaker: Vance
Pell nods at his desk without raising his eyes.
Vance looks at you a moment longer than he needs to. Then he is gone, and his boots fade away down the boards.
~ saw_swap = true
-> after

=== sabine ===
~ sabine_talked = true
~ watches -= 1
-> haggle

= haggle
# checkpoint: sabine.haggle
Sabine's stall leans against the depot fence, shaded by a strip of canvas that snaps in the wind. Her board is chalked in a neat hand. # place: The gate
; Sabine; Depot pump # head
Diesel, per can; 9 M; 16 M # row
Her cans are Army green, and the stencils have been scraped off with something sharp.
Buying or just looking? Looking's free, but it doesn't feed me. # speaker: Sabine
+ [Pay her {sabine_price} M to talk. # cost: {sabine_price}]
  ~ knows_scar = true
  She counts the M's twice and tucks them away.
  A corporal brings me the cans. Big hands, a scar across his chin. He never gives a name and I never ask. # speaker: Sabine
  -> after
+ [Lean on her.]
  ~ alarm += 1
  She laughs and waves the next customer up to the counter. By nightfall half the depot knows that someone has been asking about fuel.
  -> after
+ {facts_held() >= 2} [Let her see what you know.]
  Sabine studies you for a long while, weighing what you have. Then she slides an envelope across the counter.
  Forget the fuel. Everybody's got to eat, and this'll do more for you than the truth will. # speaker: Sabine
  ++ [Take the envelope.]
     -> sold
  ++ [Push it back.]
     ~ alarm += 1
     She shrugs and looks past you, at the sentry by the gate.
     -> after
+ [Leave her be.]
  -> after

=== bunk ===
~ bunk_searched = true
~ found_seals = true
~ alarm += 1
~ watches -= 1
The barracks are empty at noon, and the air is heavy with sweat, boot polish and old canvas. Vance's cot is made tight, Army style. # place: Barracks
Under it sits a tin of Army fuel seals, every one cut clean.
His boots stand by the door, still wet from the wash trough. Footsteps sound on the boards outside, and you slip out through the back.
-> after

=== stakeout ===
~ stakeout_done = true
~ watches -= 1
{ knows_whom(): -> seen }
You do not know whom to watch. The night passes cold and empty, and you hear only the wind in the wire. # place: Back fence, night
At dawn a sentry finds you crouched behind the fuel shed and asks what you are waiting for.
~ alarm += 1
-> after

= seen
Near dawn a truck rolls up to the back fence with its lights off. Its door carries Sabine's mark, painted in white. # place: Back fence, night
A corporal with a scar across his chin passes cans over the wire one at a time, and each one knocks against the next. <pop>You count every one.</pop>
~ saw_handoff = true
-> after

=== function vance_proof() ===
~ return gate_checked + saw_swap + knows_scar + found_seals + 2 * saw_handoff

=== accuse ===
Kovac looks up from the duty roster. # place: Dispatch office
Give me a name. # speaker: Kovac
+ {gate_checked or saw_swap} [Corporal Vance.]
  -> name_vance
+ {not (gate_checked or saw_swap) and (knows_scar or saw_handoff)} [The corporal with the scar.]
  -> name_vance
+ {ledger_read or pell_talked} [Pell, the clerk.]
  -> name_pell
+ [Not yet.]
  -> desk

=== last_call ===
# checkpoint: last_call
The shipment rolls at dawn, and the trucks are already warming in the cold. Kovac waits at his desk with the duty roster. # page # place: Dispatch office
+ {gate_checked or saw_swap} [Name Corporal Vance.]
  -> name_vance
+ {not (gate_checked or saw_swap) and (knows_scar or saw_handoff)} [Name the corporal with the scar.]
  -> name_vance
+ {ledger_read or pell_talked} [Name Pell, the clerk.]
  -> name_pell
+ [Let it go.]
  -> too_late

=== name_vance ===
You lay out what you have.
{ gate_checked: Kovac reads the late passes twice, then turns the log face down. }
{ saw_swap:
  So he picks his own nights, and Pell covers for him. # speaker: Kovac
}
{ knows_scar: At the word scar, Kovac touches his own chin and says nothing. }
{ found_seals: Kovac picks up the cut seal on his desk and rolls it between his fingers. }
{ saw_handoff: Kovac asks whether you saw the cans pass the wire yourself. You nod, and he is quiet for a long time. }
{ vance_proof() >= 3: -> caught }
-> no_proof

=== name_pell ===
{ not ledger_read: -> no_proof }
Kovac runs a finger down the ledger. Pell, Pell, Pell.
That's plain enough. Same name on every line. I don't need more. # speaker: Kovac
-> wrong_man

=== no_proof ===
~ alarm += 1
A name with nothing behind it's no use to me. Bring me proof, or bring me nothing. # speaker: Kovac
By evening the whole depot knows who you asked about, and the mess falls silent when you walk in.
-> after

=== caught ===
~ depot_thief = "vance"
~ give_money(reward)
Kovac sends two soldiers to the barracks. # page # place: Dispatch office
They come back with the cans, dug out from under the floor of Vance's bunk and wrapped in Army canvas.
Vance. I shared my water with that man. # speaker: Kovac
The Army pays its debts. Take this and keep it quiet. # speaker: Kovac
Kovac counts {reward} M into your hand. # reveal: all
-> END

=== wrong_man ===
~ depot_thief = "pell"
Pell sits in the cell by noon, crying into his sleeve. # page # place: Dispatch office
The shipment rolls out light anyway. The cans keep walking.
-> END

=== sold ===
~ depot_thief = "bought"
~ give_money(envelope)
The envelope holds {envelope} M. You tell Kovac the depot is clean. # reveal: all # page # place: Dispatch office
He believes you, for now.
-> END

=== trail_lost ===
~ depot_thief = "lost"
By morning the depot is spotless. # page # place: Dispatch office
The ledger has a new page, the gate log shows no late passes, and Sabine's stall stands empty with its canvas flapping.
-> END

=== too_late ===
~ depot_thief = "lost"
The shipment rolls out at dawn, light by a few cans. # page # place: The gate
Vance waves it through the gate himself, one big hand raised, while the dust of the wheels drifts over the wire.
-> END

=== let_go ===
~ depot_thief = "lost"
Your choice. Close the door when you leave. # speaker: Kovac # place: Dispatch office
-> END
