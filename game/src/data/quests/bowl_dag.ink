INCLUDE world.ink

VAR dag_road = false
VAR dag_kiln = false
VAR dag_pay = false

=== start ===
# checkpoint: start
Dag. I ride with the Bowl Farmers, the patrol that keeps the roads near these walls. Keep your guns cold inside the gate and we'll get along fine.
-> hub

= hub
# checkpoint: start.hub
+ [What is the road like?]
  Dusty, and worse every season. A truck that breaks down out there waits a long time for a friendly face, so carry water and a spare belt, and don't wander off the track.
  Raiders sniff around the roads too. It's nothing we can't run off, but you'll want your gun ready.
  The Army at Nose watches the stretch in front of its own gate, and it does that well enough.
  ~ dag_road = true
  -> hub
+ [Any work?]
  {
    - board_full():
      You're carrying enough promises already. Finish a few and then ask me again.
      -> hub
    - not has_work() and has_offers():
      There's nothing on the board you could take right now. Make some room on your truck and ask again.
      -> hub
    - not has_work():
      The board's empty today. Come back in a couple of days, it fills slowly.
      -> hub
  }
  I might have a haul for you, if you want it. # work_offer
  ++ [I will take it.]
     ~ take_work()
     Good. Bowl remembers the people who deliver, so don't make me regret this.
     -> hub
  ++ [Not now.]
     -> hub
+ [Who pays the Farmers?]
  Not enough people, to be plain. The Granary pays out of its count of sacks. The drivers who cross Canyon Bridge pay a toll, the long convoys pay a fee, and the tenants put in a share of their harvest.
  Nose pays nothing, because it guards only its own walls. So each town watches the road by its own gate and nobody watches between the towns. I don't like it, and I don't know a cure.
  ~ dag_pay = true
  -> hub
+ {dag_road} [Who are the raiders?]
  There's a pair of camps. Kiln Camp sits out east, south of the big crater, and Scrapjaw Camp is far up north. Most days they'd rather rob you than kill you, because a dead driver hauls nothing next week.
  So pay them or outrun them, but don't fire the first shot if you want to grow old.
  ~ dag_kiln = true
  -> hub
+ {dag_road} [What do you make of Nose?]
  The Army's all right on the road. Off it, they act as though the basin belongs to them and the rest of us are only borrowing it. Bowl was feeding people long before Nose put up its first fence.
  -> hub
+ {dag_kiln} [What do you mean, pay the raiders?]
  The Granary pays Kiln Camp a sack of grain for every armed truck that crosses their road. It costs less than a funeral.
  If they close on you anyway, fight hard. They often let a hard fighter go, and they strip a soft one down to the frame. Don't start the fight. But once they start it, don't hold back.
  ~ note("talkKilnFight")
  -> hub
+ {dag_pay} [Do tenants serve with you?]
  Some do. They're good drivers, but they've got no vote, so they ride in our coats without being on the roll of citizens. The Senate wants them on the road and off the roll.
  Jory Baptiste keeps sending more of them, and I can't decide whether to thank him or watch him.
  -> hub
+ [Goodbye.]
  -> END
