INCLUDE world.ink

VAR heard_workshop = false
VAR asked_workshop = false
VAR heard_gate_law = false
VAR asked_gate_law = false
VAR heard_courier = false
VAR asked_courier = false
VAR heard_paper = false
VAR asked_paper = false

=== start ===
# checkpoint: start
{ depot_thief:
- "vance": Sergeant Kovac, dispatch. The depot is quiet these days. That's your doing. State your business and keep it short.
- "pell": Sergeant Kovac, dispatch. Fuel's still walking out of my depot, so I'm short on patience. State your business.
- else: Sergeant Kovac, dispatch. State your business and keep it short. The roster won't fill itself.
}
-> hub

= hub
# checkpoint: start.hub
+ [What is this place?]
  Nose. The dispatch desk is mine. Freight on the north-east road or through the canyon crossing passes this desk, or it doesn't pass. If you want something to be proud of, ask the <term=committee>Committee</term> about the workshop line. It builds whole engines and guns. Bowl can't.
  ~ heard_workshop = true
  -> hub
+ [Who runs Nose?]
  On paper the Central Committee. In the street the Army. Command gives me orders, I hand them down, nobody argues. I hear <term=bowl>Bowl</term> votes on everything. I wouldn't last a morning there.
  -> hub
+ [What is the road like?]
  Bad once you're past the walls. Nobody keeps the road between our wall and Bowl's. Kiln riders, the raiders from the camp in the south, strip any truck that won't pay or fight. I log every truck out and every truck in. The ones that don't come back are the part I like least. That's why no truck gets out without a gun. That's the gate law. One courier goes without. I haven't decided what I think of her.
  ~ heard_gate_law = true
  ~ heard_courier = true
  -> hub
+ [What does Nose turn out?]
  Salt off the pans under the wall. Tools from the forge. Batteries from the cell shop.
  The forge burns scrap and diesel. The cell shop burns parts and diesel. The scrap and the parts come from the <term=salvage_yard>Yard</term>, the diesel from the Pump Station. Short of any of it, the line stops.
  { short_of("scrap"):
    Scrap's short. The forge is cold until the Yard trucks come in. I log it.
  }
  { short_of("fuelDrums"):
    Diesel's short. The forge and the cells both wait on the convoys. I log that too.
  }
  { short_of("parts"):
    Parts are short. The cell shop stands idle, and command asks me why.
  }
  -> hub
+ [Any work?]
  {
    - board_full():
      You're carrying all the work the log allows. Clear your sheet first.
      -> hub
    - not has_work() and has_offers():
      Nothing on the board fits you right now.
      -> hub
    - not has_work():
      Board's empty today. Try tomorrow.
      -> hub
  }
  The board has this one. Do you take it? # work_offer
  ++ [Yes.]
     ~ take_work()
     Logged. Don't be late.
     -> hub
  ++ [No.]
     -> hub
+ {depot_thief == "none"} [Anything off the books?]
  ~ begin("nose_depot_leak")
  -> END
+ {depot_thief == "open"} [About the depot.]
  ~ begin("nose_depot_leak")
  -> END
+ {has_note("wagonBowl")} [About that scavenger with the Army radio.]
  Him. He sold us our own radio back, and I paid stock price for it. That set came off wagon Seven. She ran water drums from Dustwell down the Bowl north road to Bowl every week, and she went dark on the bend in the Bowl north road. The crew walked in and reported raiders, and her cannon lost over the edge. Command wrote her off. I log it.
  The scavenger said for a little more that the cannon's still on her. I didn't pay a little more.
  ~ note("wagonNose")
  -> hub
+ {wagon_seen and wagon_fate == "none"} [We found wagon Seven.]
  Written off by order, so whatever's left on her is yours. Don't make a habit of picking over Army property.
  { wagon_pin != "none":
    You've got something in your hand you keep turning over. Don't show it to me. Show it to Lena at the bench. I log what I see there.
  }
  ~ note("wagonFound")
  -> hub
+ {wagon_fate == "logged" or wagon_fate == "admitted"} [About wagon Seven.]
  { wagon_fate == "admitted":
    Teller drives the water cart now. His stripes are in my drawer. Two depot trucks with the same one-pin mount are off the road until Lena has looked at them. Command hasn't answered. I log that too.
  - else:
    The raid report and the stub share a page, and command reads the top of it. Two depot trucks with the same one-pin mount are off the road until Lena has looked at them. That's as far as my sheet goes.
  }
  -> hub
+ {wagon_fate == "buried"} [About wagon Seven.]
  Corporal Teller came back from the wash pit with wet hands and a light purse. I don't log what I don't see, and I didn't see anything.
  -> hub
+ {wagon_fate == "told"} [About wagon Seven.]
  Soldiers buy water at Bowl, and Bowl talks over the cups. Now my men come back up the road asking whether their own pins will hold. You told Bowl before you told my log. I won't forget the order you did it in.
  -> hub
+ {wagon_fate == "sold"} [About wagon Seven.]
  A piece of Army steel from wagon Seven changed hands at the <term=salvage_yard>Yard</term>. I logged the sale. Your name is on the line, beside the price.
  -> hub
+ {heard_workshop and not asked_workshop} [Where did the workshop line come from?]
  Old Orchard, the Old Army's depot. The machine tools are the Guild's, and command rents them. Who pays that rent is above my sheet.
  ~ asked_workshop = true
  -> hub
+ {heard_gate_law and not asked_gate_law} [What is the gate law?]
  No gun, no gate pass. The line hands every driver a steel mount with his pass, so nobody can tell me he had nothing to bolt on. What happens to the mount after that is between the driver and <term=pierce>Pierce</term>. Pierce writes his paper. I don't ask.
  ~ asked_gate_law = true
  ~ heard_paper = true
  -> hub
+ {heard_courier and not asked_courier} [Who is the courier that goes without a gun?]
  Tamsin Roe, of the Guild. The Guild carries the mail between the towns. She drives with no gun of her own. The courier who runs with her carries the rifle. The two of them get through my gate, but I don't like what it teaches the other drivers. Brave or stupid, I haven't decided.
  ~ asked_courier = true
  -> hub
+ {heard_paper and not asked_paper} [What is Pierce paper?]
  It's the insurance that pays a driver when his truck is shot. Pierce won't write it for a mount with one pin. Command ordered one pin. What a driver does about that, I don't log.
  ~ asked_paper = true
  -> hub
+ [Goodbye.]
  -> END
