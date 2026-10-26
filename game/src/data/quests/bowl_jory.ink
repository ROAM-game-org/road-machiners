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
  ~ jory_green = true
  ~ jory_nose = true
  -> hub
+ {jory_green} [How does a tenant get a vote?]
  He serves in the Bowl road patrol for a decade. Then the Senate lets him drop a pebble in a jar. My grandfather died one season short, which was bad timing, but he always kept his own schedule.
  ~ jory_patrol = true
  -> hub
+ {jory_patrol} [Do tenants take up the patrol?]
  They do, because the Senate wrote the rule and I read it back to them slowly. They said service earns a vote, so I send them the service. They let tenants carry rifles on the road and pay half the cost on grain runs, and nobody asked what a rifle in a tenant's hands might mean on voting day.
  The patrol knows my face by now. I've noticed the patrol and the raiders in the south get paid out of the same sacks, but that's a longer story. I've been told I'm a long story myself.
  ~ jory_filled = true
  -> hub
+ {jory_filled} [Does the patrol trouble you?]
  It does, and it knows where I live. They searched my house at night once and said they were looking for a rifle. They found a spoon, and I told them to keep it because I've got more.
  -> hub
+ {jory_filled} [What do the raiders have to do with the grain?]
  Kiln Camp, the raiders in the south, gets a sack from the <term=granary>Granary</term> for every armed truck that crosses their road. The patrol is paid out of the tenants' share of the same grain.
  The sack leaves the store once and the Senate counts it twice. The Senate says it all adds up, and it does, the way a bucket with a hole adds up.
  ~ note("talkGranaryGate")
  -> hub
+ {jory_nose and found("nose")} [What do you make of Nose?]
  They ration everyone and call it kindness. A fed man in a line is still a man in a line. Ask me again in a famine and I might change my mind, or I might not, because I'm a stubborn fellow when I'm hungry.
  -> hub
+ [Goodbye.]
  -> END
