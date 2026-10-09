# view: page
INCLUDE world.ink

=== start ===
# checkpoint: start
Water drips somewhere close. It is the first sound that is not an engine. # place: Green Pit
Your cheek rests on a cool plank. Light falls through holes in a roof of rusted sheet.
A well mouth opens beside you, ringed with green moss. Your head throbs where the glass cut you.
+ [Sit up.]
  ~ intro_step = "done"
  The room tilts and settles. Your truck stands in the dust outside the door, its engine cold.
  Whoever stopped you took what rode in the bed. Someone towed you here. Nobody left a name.
  -> hooks

=== hooks ===
Rifles hang on iron hooks by the door, row on row, like coats. Nobody watches them. # page
A woman sets a tin cup on the plank beside you. She does not ask who you are.
Drink. You are fed once under this roof. After that you pay like the rest. # speaker: Hadiza
Hang your gun on a hook before you sit. That is all I ask. # speaker: Hadiza
+ [Drink.]
  The water is cold and tastes of stone. A bowl of hot grain follows it.
  -> END
