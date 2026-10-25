INCLUDE world.ink

VAR dag_road = false
VAR dag_kiln = false
VAR dag_pay = false
VAR dag_wagon = false

=== start ===
# checkpoint: start
Dag. I ride with the Bowl Farmers, the patrol that keeps the roads near these walls. Keep your guns cold inside the gate and we'll get along fine.
-> hub

= hub
# checkpoint: start.hub
+ [What is the road like?]
  Dusty, and worse every season. A truck that breaks down out there waits a long time for a friendly face, so carry water and a spare belt, and don't wander off the track.
  Raiders sniff around the roads too. It's nothing we can't run off, but you'll want your gun ready.
  The Army at <term=nose>Nose</term> watches the stretch in front of its own gate, and it does that well enough.
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
  Not enough people, to be plain. The <term=granary>Granary</term> pays out of its count of sacks, the long convoys pay a fee, and the tenants put in a share of their harvest.
  Nose pays nothing, because it guards only its own walls. So each town watches the road by its own gate and nobody watches between the towns. I don't like it, and I don't know a cure.
  ~ dag_pay = true
  -> hub
+ {dag_road} [Who are the raiders?]
  There are two camps. Kiln Camp sits out south-east, south-west of the big crater, and <term=scrapjaw>Scrapjaw Camp</term> is far up north. Most days they'd rather rob you than kill you, because a dead driver hauls nothing next week.
  So pay them or outrun them, but don't fire the first shot if you want to grow old.
  ~ dag_kiln = true
  -> hub
+ {dag_road} [What do you make of Nose?]
  The Army's all right on the road. Off it, they act as though the basin belongs to them and the rest of us are only borrowing it. Bowl was feeding people long before Nose built its workshop line.
  -> hub
+ {dag_kiln} [How does Bowl pay the raiders?]
  The Granary pays Kiln Camp a sack of grain for every armed truck that crosses their road. It costs less than a funeral.
  If they close on you anyway, fight hard. They often let a hard fighter go, and they strip a soft one down to the frame. Don't start the fight. But once they start it, don't hold back.
  ~ note("talkKilnFight")
  -> hub
+ {dag_pay} [Do tenants serve with you?]
  Some do. They're good drivers, but they've got no vote, so they ride in our coats without being on the roll of citizens. The <term=senate>Senate</term> wants them on the road and off the roll.
  Jory Baptiste keeps sending more of them, and I can't decide whether to thank him or watch him.
  -> hub
+ {dag_road} [Does the patrol go out to the crater?]
  { cult_broken():
    By day it does, and by night as well now. The lamps stopped crossing at dusk, and nobody has gone missing off the rim road since. Still keep off the green glow, whatever the hour.
  - else:
    By day, yes. After dark, no, and that goes for every truck I ride with. Lamps cross the open ground out there at dusk and go back before sunup, and a truck that stops by the rim at night isn't always there in the morning. Be off the crater road before sundown.
    ~ note("sunwardDragged")
  }
  -> hub
+ {has_note("wagonBowl") and not dag_wagon} [Do you know where that Army wagon is?]
  I do. She's in a hollow below the bend in our north road, below where the <term=pump_station>Pump Station</term> track branches off. East of here. I rode down to her myself.
  Rule first: take nothing from that hollow up to Nose. The reason is that Nose blames the first driver it finds near its guns, and then it sends trucks down my road to ask questions.
  ~ dag_wagon = true
  ~ note("wagonDag")
  -> hub
+ {wagon_saw and wagon_fate == "none"} [Nobody raided that wagon.]
  No. I walked that hollow too. Not one casing in the grit, and not a hole in her. Whatever stove in that cab was the slope, not a gun.
  Nose says raiders, and every driver who buys water here believes it. If you want it said, say it at the well house where they all drink. I'll stand next to you while you do.
  ++ [Say it at the well house.]
     ~ wagon_fate = "told"
     You say it at Hattie's, plainly, to whoever is holding a cup: no brass, no holes, every dent from the slope. Dag stands next to you and says he counted the same. # page
     A woman at the cistern puts her bucket down. Her son rode in the cab of that wagon, she says. Nobody had told her there was no fight.
     Two Nose soldiers buying water hear every word. They fill their drums and leave without talking to each other.
     -> hub
  ++ [Not yet.]
     -> hub
+ {wagon_fate == "told"} [What did the well house make of it?]
  Bowl talks over its cups, and Nose soldiers drink from the same well. Now they ask the Farmers whose brakes hold. I don't mind that question.
  I still want Nose trucks off my road. Before, they'd have come down asking who stripped their wagon. Now they'd come asking who told.
  -> hub
+ [Goodbye.]
  -> END
