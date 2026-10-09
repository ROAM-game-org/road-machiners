INCLUDE world.ink

=== start ===
# checkpoint: start
Captain Silver stands at the post gate with his hands clasped behind his back. He's watching the road through the gate as if it owed him something, and he looks round only when your shadow reaches his boots.
{ pin_pact == "signed": A single ledger lies open on a table behind him, and a page in it carries your name. }
{ pin_pact == "silver": A single ledger lies open on a table behind him. }
{ bend_fate:
- "silver": The north bend is quiet now, and my drivers pass it without trouble. I'd prefer you didn't wait for me to thank you. # speaker: Silver
- "kiln": I hear a pair of Kiln riders have been sitting at the north bend all week. Either you did that or you let it be done, and I'll remember which. # speaker: Silver
- "ash": The man at the north bend still stops my drivers and tells them their mounts are bad. I'm told you were standing next to him when he started again. # speaker: Silver
- "bench": I hear a bench stands at the north bend now, boring second pins for anyone who drives up. My soldiers have orders to leave it alone. That order lasts as long as I say it does. # speaker: Silver
- "exposed": A scrap of Kiln red cloth hangs in the window of the crane office, and the Administrator shows it to anyone who asks. I know whose hand carried it to him. I don't forget hands. # speaker: Silver
- "hush": We have an understanding about the north bend, you and I. I'd advise you to keep it exactly as it is. # speaker: Silver
- else:
  { pin_fate:
  - "silver": The ring is ash and the page is filed. That's how I like a matter to end. # speaker: Silver
  - "sully": I'm told the crane office keeps a ring in a locked drawer. A ring can be carried out of a drawer, Driver, and a drawer can be opened by more than one key. # speaker: Silver
  - else: State your business, and make it brief. The road doesn't guard itself. # speaker: Silver
  }
}
-> hub

= hub
# checkpoint: start.hub
+ [What is your post doing here?]
  It keeps the Yard safe for honest haulers. The repair crews are skilled with a torch, but they can't hold a gate against raiders. My soldiers can. # speaker: Silver
  -> hub
+ {has_note("pinAsk") or has_note("pinStamp") or has_note("talkOnePin")} [Is the Nose mount safe?]
  Yes. It's cast steel, it swings and it locks. A driver who knows his mount has no trouble with it. # speaker: Silver
  When a driver does have trouble, it's almost always because he didn't look after what the line gave him. # speaker: Silver
  -> hub
+ {has_note("pinAsk") or has_note("pinStamp") or has_note("talkOnePin")} [Who bores the second pin into a Nose mount?]
  The Yard does, for a fee, and the Administrator sets the fee. # speaker: Silver
  A man who sells a second hole to drivers the line sent out with one is a man who profits from the one. You might ask yourself whether he wants the line to mend its mounts. # speaker: Silver
  -> hub
+ {yard_power == "post"} [The Yard gate seems to answer to your sergeant now.]
  It answers to order. The crews are learning quickly what order costs and what it buys. # speaker: Silver
  -> hub
+ {yard_power == "yard"} [The crane hands stand very close to your gate.]
  They do. A yard that thinks itself free forgets who sent its fuel through this gate last winter. # speaker: Silver
  -> hub
+ {post_file == "named"} [Is my name in your file?]
  Every name that crosses my gate is in my file. Some of them are in a second file, and that one is thicker. # speaker: Silver
  -> hub
+ {bend_fate == "none"} [Is there work for me?]
  { post_file == "named":
    I've no work for you, but I do have a file with your name in it. A man sits on the north bend and stops my drivers to look at their pins. Move him, and I'll shorten that file. # speaker: Silver
  - else:
    A man sits on the north bend and stops my drivers. He makes them show him their swivel pins and tells them our mounts are bad. That's a fine thing to hear before a long drive. # speaker: Silver
    A post can't run on talk, so I want him off that bend. How you manage it is your business. I'll pay when it's done. # speaker: Silver
  }
  ++ [I'll see him.]
     ~ note("bendOffers")
     Don't bring me excuses, Driver. I've a drawer full of those already. # speaker: Silver
     ~ begin("bend_north")
     -> END
  ++ [Not my kind of work.]
     Then don't waste my time at my gate. # speaker: Silver
     -> hub
+ [Goodbye.]
  -> END
