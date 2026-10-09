INCLUDE world.ink

VAR heard_mount = false

=== start ===
# checkpoint: start
Captain Silver stands at the post gate with his hands clasped behind his back and his weight on his heels. He is watching the road through the gate as though it owed him something, and he looks round only when your shadow reaches his boots.
{ pin_pact == "signed": A single ledger lies open on a table behind him, and a page in it carries your name. }
{ pin_pact == "silver": A single ledger lies open on a table behind him. }
{ bend_fate:
- "silver": The north bend is quiet now, and my drivers pass it without trouble. I would prefer that you did not wait for me to thank you. # speaker: Silver
- "kiln": I hear that a pair of Kiln riders have been sitting at the north bend all week. Either you did that, or you let it be done, and I will remember which it was. # speaker: Silver
- "ash": The man at the north bend still stops my drivers and tells them their mounts are bad, and I am told that you were standing next to him when he started again. # speaker: Silver
- "bench": I hear a bench stands at the north bend now and bores second pins for anyone who drives up. My soldiers have orders to leave it alone, and that order will last as long as I decide that it does. # speaker: Silver
- "exposed": A scrap of Kiln red cloth hangs in the window of the crane office, and the Administrator shows it to anyone who asks. I know whose hand carried it to him, and I do not forget a hand. # speaker: Silver
- "hush": We have an understanding about the north bend, you and I. I would advise you to keep it exactly as it is. # speaker: Silver
- else:
  { pin_fate:
  - "silver": The ring is ash and the page is filed, which is the way I like a matter to end. # speaker: Silver
  - "sully": I am told the crane office keeps a ring in a locked drawer. A ring can be carried out of a drawer, Driver, and a drawer can be opened by more than one key. # speaker: Silver
  - else: State your business, and make it brief, since the road does not guard itself. # speaker: Silver
  }
}
-> hub

= hub
# checkpoint: start.hub
+ [What is your post doing here?]
  My post keeps the Yard safe for honest haulers. The repair crews here are skilled with a torch, but they cannot hold a gate against raiders, and my soldiers can. # speaker: Silver
  -> hub
+ [Why does every truck carry a gun?]
  ~ heard_mount = true
  Because the Army is gone and nobody patrols the road between the towns, so each town guards its own walls and nothing more. # speaker: Silver
  Nose will not let a truck out of its gate without a gun, and the line gives every driver a mount along with his pass. A truck that leaves unarmed is a gift to the raiders, and I have buried enough gifts. # speaker: Silver
  -> hub
+ {heard_mount} [Is the Nose mount safe?]
  It is cast steel, it swings and it locks, and a driver who knows his mount has no trouble with it. When a driver does have trouble, the cause is almost always that he did not look after what the line gave him. # speaker: Silver
  -> hub
+ {has_note("pinStamp") or has_note("talkOnePin")} [Who bores the second pin into a Nose mount?]
  The Yard does, for a fee, and the Administrator sets the fee. A man who sells a second hole to drivers that the line sent out with only one is a man who profits from the one hole, and you may ask yourself whether he wishes the line to mend its mounts. # speaker: Silver
  -> hub
+ {yard_power == "post"} [The Yard gate seems to answer to your sergeant now.]
  It answers to order, and the crews are learning quickly what order costs and what it buys. # speaker: Silver
  -> hub
+ {yard_power == "yard"} [The crane hands stand very close to your gate.]
  They do. A yard that believes itself free tends to forget who sent its fuel through that gate last winter. # speaker: Silver
  -> hub
+ {post_file == "named"} [Is my name in your file?]
  Every name that crosses my gate is in my file, and some of them are in a second file that is thicker than the first. # speaker: Silver
  -> hub
+ {bend_fate == "none"} [Is there work for me?]
  { post_file == "named":
    I have no work for you, but I do have a file with your name in it. A man sits on the north bend and stops my drivers to look at their pins, and if you move him, I will shorten that file. # speaker: Silver
  - else:
    A man sits on the north bend and stops my drivers. He makes them show him their swivel pins and tells them that our mounts are bad, which is a fine thing to hear before a long drive. # speaker: Silver
    A post cannot run on talk, so I want him off that bend. How you manage it is your business, and I will pay for it when it is done. # speaker: Silver
  }
  ++ [I will see him.]
     ~ note("bendOffers")
     Do not bring me excuses, Driver. I have a drawer full of those already. # speaker: Silver
     ~ begin("bend_north")
     -> END
  ++ [Not my kind of work.]
     Then do not waste my time standing at my gate. # speaker: Silver
     -> hub
+ [Goodbye.]
  -> END
