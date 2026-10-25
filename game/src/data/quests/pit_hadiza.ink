INCLUDE world.ink

VAR asked_hooks = false
VAR asked_want = false

=== start ===
# checkpoint: start
Hadiza. I keep the pump and the canteen at Green Pit. Hang your rifle on the hook. Your first plate and your first cup are free. After that you pay, like everyone.
-> hub

= hub
# checkpoint: start.hub
+ [What does Green Pit sell?]
  Water, and not much of it. The pump draws a barrel at a time from deep rock, and in a dry year it draws mud by noon.
  What the rock doesn't give, I buy. Salt for the pot, cloth for the tables, rations when the pot runs thin, and drums for the trucks that fill here.
  -> hub
+ {not asked_hooks} [Why the hooks?]
  ~ asked_hooks = true
  Because everybody drinks here. Riders from <term=kiln>Kiln</term> and soldiers from <term=nose>Nose</term> sit at the same table, and a gun on a hook can't start anything between them.
  The <term=farmers>Farmers</term> won't come in while the riders do. They chase riders off Bowl's roads all week, so they won't share a bench with them. If they want my water, they can drink it in their trucks.
  -> hub
+ {not asked_want} [What do you want from me?]
  ~ asked_want = true
  Bring your fights to the road, not to my door. And if you're carrying salt or cloth, sell it here before you drive on. I need it more than Bowl does.
  -> hub
+ [Goodbye.]
  Fill your cans before you go. The next water is a long way off.
  -> END
