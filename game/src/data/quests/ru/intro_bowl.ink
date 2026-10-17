# view: page
INCLUDE world.ink

VAR asked_where = false
VAR asked_what = false
VAR asked_next = false
VAR asked_region = false
VAR asked_nose = false
VAR asked_yard = false
VAR asked_kiln = false
VAR asked_flats = false
VAR asked_tips = false

=== start ===
# checkpoint: start
Где-то рядом поднимают из колодца ведро на скрипучей веревке. Вы лежите неподвижно и слушаете. Лучше этого звука нет на свете. # place: Чаша # img: bowl_yard
Вы лежите на лавке под навесом из плетеного тростника. За полосой тени тянутся каналы с медленной бурой водой. За ними поля ступенями поднимаются по склону, зеленые от посевов. Этот цвет вы успели забыть.
Вы садитесь. Голова кружится, но скоро это проходит. Ваш пикап криво стоит у края двора, капот поднят и подперт. С бампера свисает чужая буксирная цепь, смотанная кольцами. На цепи латунная бирка, такая же, как на вашем ключе. # page
Кузов пуст. В моторе кто-то рылся и бросил болты там, где они упали. Ну что ж. Хоть грузовик оставили.
Крупная женщина с мукой на предплечьях ставит на лавку рядом с вами кружку воды. Потом садится с другого края. # page
Пей медленно. Буксировщик привез тебя на рассвете и положил на мою лавку. Спросил меня об одном и уехал. Имени не назвал, М не оставил. # speaker: Хэтти
Она кивает на цепь на вашем бампере.
Он спрашивал про женщину по фамилии Варга. Есть Рут Варга с третьей террасы, она каждое утро берет здесь воду и платит сорго. Та ли это Варга, что ему нужна, он выяснять не стал. # speaker: Хэтти
Чего бы у тебя в моторе ни недоставало, новые детали продают во дворе у ворот. Были бы М. Ты, смотрю, из тех, кто сначала ест, а платит потом. Ладно, запишу кашу в долг. # speaker: Хэтти
Вода холодная, с привкусом камня. Вы пьете медленно, потому что она смотрит. Следом вам приносят миску горячей каши. # page
Хэтти вытирает руки о передник и ждет — так ждут те, кому платят за каждый вопрос. # page
-> ask

= ask
# checkpoint: start.ask
Она склоняет голову набок. Ну давай, говорит. Ещё никто не сидел на моей лавке так, чтобы нечего было спросить. # speaker: Хэтти
-> questions

= questions
+ {not asked_where} [Где я?]
  ~ asked_where = true
  <term=bowl>Чаша</term>. Фермерский город, если это вообще можно назвать городом. Террасы по склону кратера, между ними каналы, а на самом дне моя колодезная, куда стекает вся вода. # speaker: Хэтти
  Рано или поздно сюда спускаются все: пить-то всем надо. # speaker: Хэтти
  -> questions
+ {towed_to_bowl and not asked_what} [Что со мной случилось?]
  ~ asked_what = true
  Меня там не было, так что цена моим словам грошовая. Кто-то сжег тебе мотор на дороге, забрал всё стоящее и оставил тебя в живых. На открытой дороге это считается хорошими манерами. # speaker: Хэтти
  Буксировщик повесил тебя на цепь и привез сюда. А дальше уже моя лавка и моя вода. # speaker: Хэтти
  -> questions
+ {not asked_next} [Что мне теперь делать?]
  ~ asked_next = true
  {towed_to_bowl:Поешь. Потом спустись во двор у ворот и узнай, сколько там попросят за мотор. А дальше — за руль.|Water the truck, if you haven't. Then walk down to the yard by the gate and see what they'll take for what you carry. After that, drive.} # speaker: Хэтти
  Она оглядывает вас: пыль, шея, пустые руки.
  Вид у тебя как у механтиста. Водитель в сцепке с грузовиком на любой дороге себе на жизнь заработает. Вози грузы для города, работай на двор — вот и М потекут. А хочешь ты им быть или нет, дело твое. Я тут только воду продаю. # speaker: Хэтти
  -> questions
+ {not asked_region} [Что там вокруг?]
  ~ asked_region = true
  В основном дороги. Города на дорогах и те, кто кормится за счет тех, кто по этим дорогам ездит. Выбирай любое место, а я расскажу, что слышала. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_nose} [А Нос?]
  ~ asked_nose = true
  Вверх по северной дороге, в <term=nose>Нос</term>. Солдаты, мастерская и стена. Они собирают моторы и пушки для половины котловины, и чужаков они любят куда больше, когда те у них что-нибудь купят. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_yard} [А дворы?]
  ~ asked_yard = true
  Где доживают свой век грузовики, там всегда есть двор с краном. Бригады разбирают мертвые машины и продают детали живым. Вези им лом или неси М — они не привередливые. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_kiln} [А рейдеры?]
  ~ asked_kiln = true
  На юге, в <term=kiln>лагере Обжиг</term>. Плати им долю — и дадут возить грузы. Не заплатишь и драться не станешь — покатишься домой на ободах. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_flats} [А на востоке?]
  ~ asked_flats = true
  <term=glass_flats>Стеклянная равнина</term>, а за ней — <term=sunward>Обращенные к Солнцу</term>. Туда грузы никто не возит. А кто ходит за линзами, возвращается с хорошим стеклом, только слов у них потом заметно убавляется. # speaker: Хэтти
  -> questions
+ {not asked_tips} [Что посоветуешь?]
  ~ asked_tips = true
  Запасай больше воды и топлива, чем думаешь потратить: дорога всегда длиннее, чем кажется. # speaker: Хэтти
  Пока опыта мало, держись поближе к городам. Дороги у ворот объезжают законники, и мало кто станет затевать свару у них на виду. А на открытой дороге никто не смотрит, и пушка найдется у каждого водителя. # speaker: Хэтти
  А если всё же застрянешь на дороге, кто-нибудь дотащит на буксире за плату, а во дворе подлатают за лом, если М не осталось. Всё дешевле, чем идти пешком. # speaker: Хэтти
  -> questions
+ [Я пойду.]
  {towed_to_bowl:Про свой счет не забывай. Миску зерна я не забываю.|Come back when you've M's for a bucket.} # speaker: Хэтти
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with flour on her forearms sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
Hattie, they call me, and that's the well, and that's the bench, and the water costs, so don't look at the bucket like it owes you. # speaker: Hattie
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
Water, grain, a word or two on the roads. That's what I sell. The word costs less than the grain, and I hear it twice as well. # speaker: Hattie
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. Somebody went through the engine and left the bolts where they fell.
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Back on my bench, and not on your own wheels this time. You get around, I'll give you that. # speaker: Hattie
She nods at the chain on your bumper.
A tow man brought you in at first light and asked me one thing. He asked after a Varga woman. There's a Ruth Varga up on the third terrace who buys her water here every morning. Whether she's his Varga, he didn't stay to find out. # speaker: Hattie
Whatever they pulled out of your engine, the yard by the gate sells new, if you have the M's. I'll put the grain on your slate. # speaker: Hattie
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
