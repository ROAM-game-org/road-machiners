# view: page
# stat: money Money
# fact: office_files Pierce filing room: hook crates left by the north gate in Dell Marr's hand. His last line ends mid-word. The pages after it are cut out.
# fact: yard_tally Crane book: hook crates left the old yard by the north gate, week after week. Each line ends with a sealed order and one initial, L.
# fact: otto_wheel Otto: he strapped the hook crates for the yard and signed each strap. The wheel crates went out roped.
# fact: otto_lid Ridge Wrecks: a crate lid with a hook burned in, strapped with Otto's mark. Chalk on the edge says north gate, by L.
INCLUDE world.ink

VAR office_files = false
VAR yard_tally = false
VAR otto_wheel = false
VAR otto_lid = false
VAR look_price = 40
VAR proof_pay = 180
VAR lucan_pay = 240

=== function weight() ===
~ return office_files + yard_tally + otto_wheel + 2 * otto_lid

=== start ===
# checkpoint: start
-> desk

=== desk ===
# checkpoint: desk
The Pierce office at Nose keeps its blinds drawn against the dust. # page # place: Pierce office
{ weight() > 0: Your papers lie in order on the high desk. | Constance has asked for a paper or a mark. You have neither yet. }
+ {not office_files} [Go through the filing room.]
  -> files
+ {found("salvage-yard") and not yard_tally} [Ask Sully Okafor for the old crane book.]
  -> crane
+ {found("ridge-wrecks") and not otto_wheel} [Drive to Ridge Wrecks and ask Otto Brann about his marks.]
  -> ridge
+ {otto_wheel and not otto_lid} [Ask Otto for the lid on his wall.]
  -> lid
+ {weight() >= 1} [Take what you have to Constance.]
  -> to_constance
+ {weight() >= 2} [Sell what you have to Lucan Pierce.]
  -> to_lucan
+ {weight() >= 1} [Bury what you have.]
  -> bury
+ [Leave it for now.]
  -> END

=== files ===
~ office_files = true
~ note("cratesFiles")
Constance unlocks the filing room and leaves the key in the door. She does not ask what you read. # place: Filing room
The shelves hold crate manifests, bound by the year. Most lines are in one tidy hand.
Crate; Mark; Out by; Entered by # head
Army rifles; Wheel; Yard south gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Mar # row
Dell Marr's last line ends mid-word. The pages after it are cut out with a blade.
-> desk

=== crane ===
Sully Okafor leans on the crane desk. He is not flipping a coin. # place: Crane office
That book is old Pierce paper. Pierce does not own this yard anymore. I sell what I own. # speaker: Sully
+ [Pay for a look. # cost: {look_price}]
  -> tally
+ [Walk away.]
  -> desk

=== tally ===
~ yard_tally = true
~ note("cratesTally")
Sully slides the crane book across the desk and stands with his back to the window. # place: Crane office
Week; Crates; Out by; Order # head
Early; Hook; North gate; Sealed, L. # row
Next; Hook; North gate; Sealed, L. # row
Next; Wheel; South gate; Clerk's slip # row
Later; Hook; North gate; Sealed, L. # row
I do not read what it means. I read what it says. # speaker: Sully
I care for my people as I can. This book is not one of them. # speaker: Sully
-> desk

=== ridge ===
~ otto_wheel = true
Otto Brann sits at his bench with a half-welded ring across his knees. His granddaughter Lenka signs a pivot ring with a tiny chisel. # place: Ridge Wrecks
You ask about his marks.
I put my mark on every weld I make. A Brann mark means the weld holds. # speaker: Otto
The yard paid me to strap crates for the long haul. The ones with a hook burned in. I strapped every one and signed every strap. # speaker: Otto
The wheel crates went out roped. I never touched those. # speaker: Otto
Otto stops. He looks at his hands.
If that mark hangs somebody, it hangs me too. # speaker: Otto
-> desk

=== lid ===
Otto goes to the wall of his shed. A crate lid hangs there, its edge scorched. # place: Ridge Wrecks
Lenka shifts. Grandfather. Give it to her. # speaker: Lenka
Take it. Better in your truck than on my wall. # speaker: Otto
+ [Take the lid.]
  ~ otto_lid = true
  ~ note("cratesLid")
  A hook is burned into the wood and a Brann mark runs along the strap. Chalk on the edge reads <i>north gate, by L.</i>
  Otto does not watch you carry it out.
  -> desk
+ [Leave it on his wall.]
  -> desk

=== to_constance ===
{ weight() >= 3: -> proof }
Constance reads what you have. She sets each paper square to the one before it. # place: Pierce office
A mark, a line, a lid. A board will say it is a clerk's mistake and a welder's grudge. # speaker: Constance
Bring me more, or bring me something I can hold. # speaker: Constance
-> desk

=== proof ===
~ crates_fate = "proof"
~ give_money(proof_pay)
Constance reads every page twice. She does not smile. # page # place: Pierce office
Her finger rests on the last line of Dell Marr's page. Then on the initial in the crane book.
It is not a name. It is a pattern. It is enough for the board to ask the question. # speaker: Constance
She counts <b>{proof_pay} M</b> into your hand. She writes your name in a small book. # reveal: all
I never forget a favor. # speaker: Constance
-> END

=== to_lucan ===
~ crates_fate = "lucan"
~ give_money(lucan_pay)
A clerk meets you at the door and leads you up a stair you did not know the office had. # page # place: Upper room, Pierce office
Lucan Pierce sits behind a bare table. He is a soft man with careful hands.
He does not ask what you found. He asks what you want for it. # speaker: Lucan
He takes your papers and puts them in a leather case. He does not read them.
Pierce only insures the road. I would hate to see a good clerk's page cause a family quarrel. # speaker: Lucan
He counts <b>{lucan_pay} M</b> onto the table. # reveal: all
My cousin asks many questions. Tell her you found nothing. She will stop when the questions run out. # speaker: Lucan
-> END

=== bury ===
~ crates_fate = "buried"
You carry the papers out past the gate, to a dry ditch by the road. # page # place: Nose road
{ otto_lid: You break the lid over your knee and put it in with the pages. Otto's mark goes into the ground with the rest. | You put the pages in and kick the dust over them. }
Nobody sees you. Nobody pays you.
At the Pierce office Constance does not ask where you went.
-> END
