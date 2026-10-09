# view: page
# stat: money Money
# fact: office_files Pierce filing room: hook crates left by the north gate in Dell Marr's hand, week after week. His last line ends mid-word, and the pages after it are cut out.
# fact: yard_tally Crane book: hook crates left the old yard by the north gate, week after week. Each line ends with a sealed order and one initial, L.
# fact: otto_wheel Otto: he strapped the hook crates for the yard and signed each strap. The wheel crates went out roped.
# fact: otto_lid Ridge Wrecks: a crate lid with a hook burned in, strapped with Otto's mark. Chalk on the edge says north gate, by L.
# fact: mara_copy Mara Kessel's old case, second copy: the day each insured truck was filed at the Nose office and the night it was stopped on the road. The last line sends the clerk west, by order, L.
# fact: caught Filing room: the clerk at the side table wrote a line when you took the book down.
INCLUDE world.ink

VAR office_files = false
VAR yard_tally = false
VAR otto_wheel = false
VAR otto_lid = false
VAR caught = false
VAR dear = false
VAR mara_copy = false
VAR lid_how = "none"
VAR look_price = 40
VAR rush_price = 80
VAR proof_pay = 60
VAR lucan_pay = 80
VAR forged_pay = 30

=== function weight() ===
~ return office_files + yard_tally + otto_wheel + 2 * otto_lid + (lid_how == "rubbing") + 2 * mara_copy + (pin_fate == "pierce")

=== function price_high() ===
~ return caught or dear

=== start ===
# checkpoint: start
-> desk

=== desk ===
# checkpoint: desk
The Pierce office at Nose keeps its blinds drawn against the dust, and the only sound in the room is the scratch of a pen on the other side of the high desk. # page # place: Pierce office
{ weight() > 0: Your papers lie in order on the corner of the desk. | Constance has asked for a paper or a mark that a board will read, and you have neither yet. }
+ {not office_files} [Go through the filing room.]
  -> files
+ {found("salvage-yard") and not yard_tally} [Ask Sully Okafor for the old crane book.]
  -> crane
+ {not mara_copy and (pin_pact == "signed" or pin_fate == "sully")} [Ask Sully Okafor for the second copy of Mara Kessel's old case.]
  -> copy
+ {found("ridge-wrecks") and not otto_wheel} [Drive to Ridge Wrecks and ask Otto Brann about his marks.]
  -> ridge
+ {otto_wheel and lid_how == "none"} [Ask Otto for the lid on his wall.]
  -> lid
+ {otto_wheel and lid_how == "none"} [Make a lid of your own.]
  -> forge
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
Constance unlocks the filing room and leaves the key in the door, and she does not ask what you read. # place: Filing room
The room smells of cold paper and lamp oil. A young clerk with fresh ink on his cuffs sits at a side table, copying figures that he does not seem to look at. He is new, and Constance does not introduce him.
The shelves hold crate manifests bound by the year, and most of the lines are in one tidy hand.
Crate; Mark; Out by; Entered by # head
Army rifles; Wheel; Yard south gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Marr # row
Army rifles; Hook; Yard north gate; Dell Mar # row
Dell Marr's last line ends in the middle of a word. The pages after it have been cut out with a blade.
-> files_look

= files_look
+ [Study the cut edge of the last page.]
  { skill("perception") >= 2:
    The blade went in from the left, and in the gutter of the binding a stub of paper still carries the head of a line, a date and a small chalked L. You read it while the clerk reaches for his pen, and you put the book back before his eyes come up.
    -> desk
  - else:
    ~ caught = true
    You hold the book at an angle to the lamp for a little too long. The young clerk looks up, watches you for a moment and then writes a line of his own on a sheet he keeps under his hand.
    -> desk
  }
+ [Leave the book alone.]
  -> desk

=== crane ===
Sully Okafor leans on the crane desk with his coin walking across his knuckles. # place: Crane office
That book is old Pierce paper, and Pierce doesn't own this yard anymore. I sell what I own, friend. I don't sell what I'm holding for somebody else. # speaker: Sully
{ price_high(): A clerk in a Pierce coat paid me for a look at that very page yesterday. The price has gone up with the interest. # speaker: Sully }
-> crane_deal

= crane_deal
+ {not price_high()} [Pay for a look. # cost: {look_price}]
  -> tally
+ {price_high()} [Pay the dear price for a look. # cost: {rush_price}]
  -> tally
+ {not price_high()} [Offer him a wager for it.]
  { skill("social") >= 2:
    You bet him that he cannot flip his coin onto the back of his own hand every time for as long as you can count, without looking. He takes the bet, because he has never refused one, and he drops it before you reach the middle of the count.
    A man who bets and loses pays. I suppose the book is yours to read. # speaker: Sully
    -> tally
  - else:
    You bet him something, and you word it badly, and he smiles the way a man smiles at a child with a clumsy knife.
    I used to bet on everything, friend, and I got good at hearing when somebody wanted to be beaten. The price is double now. # speaker: Sully
    ~ dear = true
    -> crane_deal
  }
+ [Walk away.]
  -> desk

=== tally ===
~ yard_tally = true
~ note("cratesTally")
Sully slides the crane book across the desk and stands with his back to the window, so that the light falls on the page and not on you. # place: Crane office
Week; Crates; Out by; Order # head
Early; Hook; North gate; Sealed, L. # row
Next; Hook; North gate; Sealed, L. # row
Next; Wheel; South gate; Clerk's slip # row
Later; Hook; North gate; Sealed, L. # row
I don't read what it means. I read what it says, and it says a column of hooks. # speaker: Sully
I care for my people as I can, and this book isn't one of them. Take your look and go. # speaker: Sully
-> desk

=== copy ===
~ mara_copy = true
~ note("cratesCopy")
Sully takes a key from his belt and opens a drawer under the window, and a thin folder lies at the front of it, tied with string. # place: Crane office
Mara Kessel said you might read this. She writes everything twice, so this is the copy nobody's looking for. # speaker: Sully
The folder holds the Bureau's case in her small slanted hand. A page of columns runs down the middle of it.
Filed at the Nose office; Stopped on the road # head
Morning of the first day; Night of the first day # row
Morning of the next filing; Night of the same day # row
Morning of the next filing; Night of the same day # row
The last line is not a column. It says that the clerk Dell Marr left for the western towns by order of the underwriting floor and is not expected back. An initial stands beside it, and the initial is L.
Sully closes the folder when you look up. He does not say whether he has read it.
-> desk

=== ridge ===
~ otto_wheel = true
Otto Brann sits at his bench under a sheet of hull plate with a half-welded ring across his knees, and his granddaughter Lenka signs a pivot ring with a tiny chisel at the next bench. # place: Ridge Wrecks
You ask him about his marks.
I put my mark on every weld I make. A Brann mark tells the next driver the weld holds. The yard paid me to strap crates for the long haul, the ones with a hook burned into the lid. I strapped every one and signed every strap. # speaker: Otto
The wheel crates went out roped. I never touched those. # speaker: Otto
Otto stops, and he looks down at his own hands.
If that mark hangs somebody, it hangs me too. I've spent a long time making it mean something. # speaker: Otto
-> desk

=== lid ===
{ caught:
  ~ lid_how = "rubbing"
  Lenka meets you at the shed door before you reach the wall, and she keeps her voice low. # place: Ridge Wrecks
  A man in a Pierce coat came yesterday. He paid my grandfather in clean paper for the crate lid, and Grandfather let him have it. I made a charcoal rubbing first. I make one of everything he sells. # speaker: Lenka
  She holds out a sheet of paper gone grey with rubbing. A hook shows plainly on it, and a Brann mark runs along one strap.
  -> desk
}
Otto goes to the wall of his shed, where a crate lid hangs with its edge scorched. # place: Ridge Wrecks
{ pin_fate == "mara" or pin_fate == "sully" or pin_fate == "pierce":
  ~ otto_lid = true
  ~ lid_how = "gift"
  ~ note("cratesLid")
  He studies you for a long time. You carried Emil Kessel's ring out of the yard. That's the first honest thing anyone has done with a Nose ring. # speaker: Otto
  Take it. It's better in your truck than on my wall. # speaker: Otto
  A hook is burned into the wood, a Brann mark runs along the strap, and chalk on the edge reads <i>north gate, by L.</i> Otto does not watch you carry it out.
  -> desk
}
Lenka shifts at her bench. Give it to someone who'll use it, Grandfather. # speaker: Lenka
-> lid_ask

= lid_ask
+ [Tell him what it would hang, and what it would free.]
  { skill("social") >= 2:
    ~ otto_lid = true
    ~ lid_how = "gift"
    ~ note("cratesLid")
    You tell him that a man who strapped a crate does not hang for the man who ordered it, and that a mark on a strap is a smaller thing than a signature on a sealed order. You tell him that the order was never his.
    Otto breathes out for a long time and takes the lid from the wall. Better in your truck than on my wall, he says.
    A hook is burned into the wood, a Brann mark runs along the strap, and chalk on the edge reads <i>north gate, by L.</i>
    -> desk
  - else:
    ~ lid_how = "shut"
    You say what you came to say, but it comes out as a lecture. Otto listens to the end with his chin on his chest, then lifts the lid off its nail and puts it facedown behind the bench.
    If that mark hangs somebody, it hangs me. Go and ask your underwriter to hang it. Tell her my granddaughter won't be at the shed door. # speaker: Otto
    -> desk
  }
+ [Say nothing and go.]
  -> desk

=== forge ===
You borrow a plank from the scrap behind the shed and burn a hook into it with a shaped iron, working in the shade of your own truck where no one can see. # place: Ridge Wrecks
{ skill("machining") >= 2:
  ~ otto_lid = true
  ~ lid_how = "forged"
  Otto's mark sits on every weld of every strap he has made, and you have seen it many times on his bench. You cut it into a strap of rusted band with a chisel, scorch the edge of the board and rub chalk into the grain: <i>north gate, by L.</i>
  Held up to the light, it looks like a lid that has hung on a wall for years.
  -> desk
- else:
  You scorch the board and cut a mark into the strap, but the tail of the mark curls the wrong way.
  Lenka is standing behind you with her arms folded. She says nothing at first. Then she says quietly that her grandfather will want to hear about this.
  ~ lid_how = "shut"
  -> desk
}

=== to_constance ===
{ weight() >= 3: -> proof }
Constance reads what you have and sets each paper square to the one before it. # place: Pierce office
{ lid_how == "rubbing": A rubbing, a line and a mark. A board will tell me it's a clerk's mistake and a welder's grudge. # speaker: Constance }
{ lid_how != "rubbing": A mark, a line and a lid. A board will tell me it's a clerk's mistake and a welder's grudge. # speaker: Constance }
Bring me more. Or bring me something I can hold in my hand. # speaker: Constance
-> desk

=== proof ===
Constance reads every page twice, and she does not smile. # page # place: Pierce office
Her finger rests on the last line of Dell Marr's page, and then on the initial in the crane book.
It isn't a name. It's a pattern, and a pattern is enough for the board to ask the question. # speaker: Constance
She slides a page toward you. It says that the undersigned found these papers in the Pierce filing room of his own accord and gave them to the underwriting office.
The board can't read a paper from my hand, because I'm a Pierce. It can read a paper from yours. # speaker: Constance
{ lid_how == "forged": She rolls the lid under the lamp and tilts it, and her thumb stops at the tail of the mark. Her face does not change. }
+ {lid_how != "forged"} [Sign the page.]
  ~ crates_fate = "proof"
  ~ give_money(proof_pay)
  She counts {proof_pay} M into your hand and writes your name in a small book. # reveal: all
  I never forget a favor. The board meets after the week. A driver whose name is in the minutes doesn't have to explain himself to a clerk at a gate. # speaker: Constance
  -> END
+ {lid_how == "forged"} [Sign the page.]
  ~ crates_fate = "forged"
  ~ give_money(forged_pay)
  She counts {forged_pay} M into your hand and writes your name in a small book. # reveal: all
  I need a lid more than I need an honest one. So I'll put this one in front of the board with your name beside it. If anyone asks Otto Brann about it, we'll both find out how well you can chisel. # speaker: Constance
  -> END
+ [Take your papers back.]
  A paper no one will stand behind is a paper of mine. I've just told you why that won't do. # speaker: Constance
  -> desk

=== to_lucan ===
A clerk meets you at the door and leads you up a stair that you did not know the office had. # page # place: Upper room, Pierce office
Lucan Pierce sits behind a bare table with his soft hands folded on it. He does not ask what you found. He asks what you want for it.
Everyone wants something. I find it so much easier when they say what it is. # speaker: Lucan
He takes your papers, puts them into a leather case without reading them and sets the case under his chair.
Pierce only insures the road, you understand. I'd hate to see a good clerk's page cause a family quarrel. # speaker: Lucan
+ [Take his fee.]
  ~ crates_fate = "lucan"
  ~ give_money(lucan_pay)
  He counts {lucan_pay} M onto the table and slides a receipt across it, for services rendered to the company, over a line for your name. You sign where his clerk points.
  My cousin asks many questions. Tell her you found nothing at all. She'll stop when the questions run out. # speaker: Lucan
  -> END
+ [Ask for his word and no fee.]
  { skill("social") >= 2:
    ~ crates_fate = "lucan"
    You tell him that coin is for strangers, and that a man in his position can afford to owe a favor to someone who knows what is in the case. Lucan looks at you for a long moment.
    He writes a line on a small card and signs it. The card says that the bearer is to be treated as a friend of the underwriting floor, at any Pierce office on the road.
    That will be worth more than coin the next time a clerk questions you at a gate. It'll be worth less than coin the day I decide to disown it. # speaker: Lucan
    -> END
  - else:
    ~ crates_fate = "lucan"
    Lucan smiles at you warmly, as though you had said something generous, and he rings a small bell.
    How very kind of you. I'll remember it, I assure you. # speaker: Lucan
    A clerk walks you down the stair and out of the door. The case went up the stair with Lucan, and nobody says a word about a fee.
    -> END
  }

=== bury ===
~ crates_fate = "buried"
You carry the papers out past the gate to a dry ditch by the road. # page # place: Nose road
{ lid_how == "gift" or lid_how == "forged": You break the lid over your knee and put it in with the pages, and Otto's mark goes into the ground with the rest. | You put the pages in and kick the dust over them. }
Nobody sees you, and nobody pays you.
At the Pierce office Constance does not ask where you went.
-> END
