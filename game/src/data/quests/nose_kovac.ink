INCLUDE world.ink

=== start ===
# checkpoint: start
{ depot_thief:
- "vance": Kovac. The depot is quiet these days. Good. <b>Be brief</b> anyway.
- "pell": Kovac. Fuel still walks out of my depot. <b>Be brief.</b>
- else: Sergeant Kovac, dispatch. <b>Be brief.</b>
}
-> hub

= hub
# checkpoint: start.hub
+ [What is this place?]
  Nose. Army post, now a town. We hold the north-east road and the canyon crossing. Anyone moves freight through here, we know.
  -> hub
+ [Who runs Nose?]
  The Army. Command gives orders, dispatch hands them out, everyone else follows. Simple. Works.
  -> hub
+ [Any work?]
  {
    - board_full():
      You are overcommitted. Clear your sheet first.
      -> hub
    - not has_work() and has_offers():
      Nothing on the board fits you right now.
      -> hub
    - not has_work():
      Board is empty. Try tomorrow.
      -> hub
  }
  Board has this. Yes or no? # work_offer
  ++ [Yes.]
     ~ take_work()
     Logged. Do not be late.
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
  Him. Sold us our own radio back, the nerve. That set came off <b>wagon Seven</b>. She went dark on the Pump Station run down to Bowl. Crew walked in with raiders on their heels, no wagon. The scavenger swore she sits a short hop off the track. Nobody went to look. Too far off our road to spare a truck.
  ~ note("wagonNose")
  -> hub
+ {searched("story-wagon-seven")} [We found wagon Seven.]
  Heard. Wagon Seven is written off. Whatever was left on her is yours. Do not make a habit of picking over Army property.
  ~ note("wagonFound")
  -> hub
+ [What is the gate law?]
  No truck leaves Nose for the open road without a gun. The line issues a steel mount with every pass. Simple. Works.
  -> hub
+ [What happened to Emil Kessel?]
  Driver. North bend. The mount shifted and swung the gun into the cab. Inquiry closed. His sister serves at the Yard post now.
  -> hub
+ [Who writes the paper on a truck?]
  Constance Pierce, at the Pierce office. No paper on a one-pin mount. Command issues one pin. Drivers pay the Yard to bore a second. I do not log it.
  -> hub
+ [Who drives the open road alone?]
  Tamsin Roe, Guild courier. No gun. Her pair carries the rifle. Brave or stupid. I have not decided.
  -> hub
+ [Where did the workshop line come from?]
  Old Orchard's machine tools. Command rents them. Hauled up the mountain, now they run. Who pays the rent is above my sheet.
  -> hub
+ [Goodbye.]
  -> END
