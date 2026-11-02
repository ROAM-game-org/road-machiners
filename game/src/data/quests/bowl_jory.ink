INCLUDE world.ink

VAR jory_patrol = false
VAR jory_filled = false
VAR jory_green = false
VAR jory_nose = false

=== start ===
# checkpoint: start
Jory Baptiste. I speak for the tenants, which is to say I talk and the <term=senate>Senate</term> nods off. Sit down, the stool's free. It's the only free thing in <term=bowl>Bowl</term>, so enjoy it.
-> hub

= hub
# checkpoint: start.hub
+ [Who are the tenants?]
  We grow the food, and the citizens eat it. You can tell us apart by the dirt under the nails. We work the families' terraces and keep a share of what we grow. We've no vote in the Senate, so the families decide what we plant and what we're paid.
  The top terraces, where the old families live, stay green even in a dry year. Nobody's explained that to me, and I wouldn't dare ask. A miracle's a miracle.
  ~ jory_green = true
  ~ jory_nose = true
  -> hub
+ {jory_green or jory_patrol or jory_filled} [About the vote and the patrol…]
  -> about_vote
+ {jory_filled or jory_green or (jory_nose and found("nose"))} [About the grain…]
  -> about_grain
+ [Goodbye.]
  -> END

= about_vote
+ {jory_green} [How does a tenant get a vote?]
  A tenant who serves ten years in the Bowl road patrol goes on the Senate's roll and gets a vote. My grandfather served nine years and three seasons, then died. The Senate counted the one season he was missing more carefully than all the years he'd served.
  ~ jory_patrol = true
  -> about_vote
+ {jory_patrol} [Do tenants take up the patrol?]
  They do, because the Senate wrote the rule and I read it back to them slowly. They said service earns a vote, so I send them the service. They let tenants carry rifles on the road and pay half the cost on grain runs, and nobody asked what a rifle in a tenant's hands might mean on voting day.
  The patrol knows my face by now. I've noticed the patrol and the raiders in the south get paid out of the same sacks, but that's a longer story. I've been told I'm a long story myself.
  ~ jory_filled = true
  -> about_vote
+ {jory_filled} [Does the patrol trouble you?]
  It does, and it knows where I live. They searched my house at night once and said they were looking for a rifle. They found a spoon, and I told them to keep it because I've got more.
  -> about_vote
+ [Back.]
  -> hub

= about_grain
+ {jory_filled} [What do the raiders have to do with the Granary?]
  Kiln Camp, the raiders in the south, eat <term=granary>Granary</term> rations, and in return they let Granary trucks cross their road. The patrol is paid out of the tenants' share of the same harvest.
  The harvest leaves the terraces once and the Senate spends it twice. The Senate says the harvest stretches to cover both, and I've read its rules slowly and found nothing on breeding sacks.
  ~ note("talkGranaryGate")
  -> about_grain
+ {jory_green} [Why do the top terraces stay green?]
  Because, if the word's right, the household's own truck fills its barrels at Dustwell every week and drives straight up to the top gardens. Nobody at the pump is allowed to ask where that truck's water goes. If you say so in the market, they'll ask who told you, and names are the one crop the Senate knows how to harvest.
  Have I seen the truck unload? No. I've seen the kitchen gardens up there, and they're very green for a dry year. Either the truck exists or those cabbages are saints.
  ~ note("talkSeepPipe")
  -> about_grain
+ {jory_nose and found("nose")} [What do you make of Nose?]
  They ration everyone and call it kindness. A fed man in a line is still a man in a line. Ask me again in a famine and I might change my mind, or I might not, because I'm a stubborn fellow when I'm hungry.
  -> about_grain
+ [Back.]
  -> hub
