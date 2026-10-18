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
Пей медленно. # speaker: Хэтти
На рассвете тебя приволок буксировщик, сгрузил на лавку, спросил одно и сразу дал по газам — ни имени не назвал, ни одной М не оставил. # speaker: Хэтти
Она кивает на цепь на вашем бампере.
Искал какую-то женщину из Варг: Рут Варга с третьей террасы берет у меня воду каждое утро и платит сорго, но его ли это Варга, он выяснять не стал. # speaker: Хэтти
Во дворе у ворот продают новые детали взамен всего, что выдрали у тебя из мотора, — если есть М. У тебя такой вид, будто сначала ешь, а платишь потом, так что зерно я запишу в долг. # speaker: Хэтти
Вода холодная, с привкусом камня. Вы пьете медленно, потому что она смотрит. Следом вам приносят миску горячей каши. # page
Хэтти вытирает руки о передник и ждет — так ждут те, кому платят за каждый вопрос. # page
-> ask

= ask
# checkpoint: start.ask
Она склоняет голову набок. На моей лавке ещё никто без вопросов не сидел, говорит она. Спрашивай, не начинай. # speaker: Хэтти
-> questions

= questions
+ {not asked_where} [Где я?]
  ~ asked_where = true
  <term=bowl>Чаша</term>, если это можно назвать городом. Террасы идут уступами по склонам кратера, между ними каналы, а внизу моя колодезная — сюда вся вода стекает. # speaker: Хэтти
  Все ко мне рано или поздно спускаются, пить-то каждому надо. А ты сразу на лавку, даже воды не просишь. # speaker: Хэтти
  -> questions
+ {towed_to_bowl and not asked_what} [Что со мной случилось?]
  ~ asked_what = true
  Меня там не было, но говорят, на дороге у тебя перебрали двигатель, сняли всё ценное, а тебя оставили в живых. # speaker: Хэтти
  Буксировщик подцепил тебя на цепь и притащил сюда. А тут уже моя лавка, моя вода, и ты пока только расходуешь. # speaker: Хэтти
  -> questions
+ {not asked_next} [Что мне теперь делать?]
  ~ asked_next = true
  {towed_to_bowl:Сперва поешь, а то с тебя сейчас только пыль стряхнуть. Потом иди во двор у ворот, узнай, что возьмут за движок. А дальше — за руль.|Water the truck, if you haven't. Then walk down to the yard by the gate and see what they'll take for what you carry. After that, drive.} # speaker: Хэтти
  Она оглядывает вас: пыль, шея, пустые руки.
  С виду ты механтист: вози грузы для города, работай на двор, вот и пойдут М. Хочешь им быть или нет, дело твоё, я только воду продаю. # speaker: Хэтти
  -> questions
+ {not asked_region} [Что там вокруг?]
  ~ asked_region = true
  Там дороги, вдоль них города, а в городах тебя ждут — не тебя лично, твои М. Выбирай дорогу, расскажу, что про неё слышно. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_nose} [А Нос?]
  ~ asked_nose = true
  По дороге на северо-восток будет <term=nose>Нос</term>: солдаты, мастерская и стена. Там делают двигатели и пушки для половины котловины, а ты им больше понравишься, если купишь хоть что-нибудь из этого. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_yard} [А дворы?]
  ~ asked_yard = true
  Где собираются грузовики, там и двор с краном: мёртвые разбирают, живым продают запчасти. С тебя возьмут хоть лом, хоть М, красивые глаза оставь себе. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_kiln} [А рейдеры?]
  ~ asked_kiln = true
  На юге они, в <term=kiln>лагере Обжиг</term>: заплатишь им, дадут возить груз. Не хочешь ни платить, ни драться — домой поедешь на ободах. # speaker: Хэтти
  -> questions
+ {asked_region and not asked_flats} [А на востоке?]
  ~ asked_flats = true
  На востоке <term=glass_flats>Стеклянная равнина</term>, за ней <term=sunward>Обращенные к Солнцу</term>, только грузы туда никто не возит. За линзами ходят, приносят хорошее стекло, а слов из них потом не вытянешь. # speaker: Хэтти
  -> questions
+ {not asked_tips} [Что посоветуешь?]
  ~ asked_tips = true
  Бери воду и топливо с запасом: дорога длиннее, чем тебе кажется, а бак на уговоры не поддаётся. # speaker: Хэтти
  Пока осваиваешься, держись ближе к городам: у ворот ездят законники, при них мало кто лезет в драку. В чистом поле никто не смотрит, а ствол есть у каждого водителя. # speaker: Хэтти
  Застрянешь — за плату дотащат до мастерской, там подлатают машину за лом, если М уже нет. Всё дешевле, чем пешком идти, особенно если посчитать воду. # speaker: Хэтти
  -> questions
+ [Я пойду.]
  {towed_to_bowl:Помни про свой счет: миску зерна я не забываю.|Будут М на ведро — подкатывай обратно: лавка за посиделки платы не берет, а на сухих колесах ты далеко от Чаши не уедешь.} # speaker: Хэтти
  -> END

=== meet ===
# checkpoint: meet
You leave the truck on the pad and walk in for water, because the tank is not the only thing in you that's dry. A bucket is coming up a well on a creaking rope. # place: Bowl # img: bowl_yard
Past the well house run canals full of slow brown water. Past them, fields climb the slope in steps, green with crops. Green. You'd forgotten the color.
A broad woman with flour on her forearms sits on a bench under a roof of woven reeds, and watches you come the whole way. # page
Я Хэтти, вон колодец, вон скамья. Вода за деньги, так что не смотри на ведро, будто оно тебе задолжало. # speaker: Хэтти
She wipes her hands on her apron. Her eyes go over your dust, your boots, the pickup out on the pad.
Продаю воду, зерно, могу и про дороги пару слов сказать. Слова дешевле зерна, а слышу я вдвое больше, чем рассказываю. # speaker: Хэтти
-> start.ask

=== again ===
# checkpoint: again
Somewhere close, a bucket is coming up a well on a creaking rope. You know that sound now. # place: Bowl # img: bowl_yard
You're lying on the bench under the reed roof. Past the shade run the canals, and the green steps of the fields. Your pickup stands crooked at the edge of the yard with its hood propped open. A tow chain that isn't yours hangs coiled off the bumper, with a brass tag on it. # page
The bed is empty. Somebody went through the engine and left the bolts where they fell.
Hattie sets a cup of water on the bench beside you and sits down at the other end of it. # page
Опять ты на моей лавке, опять на буксире, а поездить всё же успеваешь. # speaker: Хэтти
She nods at the chain on your bumper.
Как в прошлый раз, буксировщик принёс тебя сюда на рассвете и спросил только про Рут Варгу с третьей террасы, которая каждое утро покупает у меня воду. Та ли это Варга, что ему нужна, выяснять не остался. # speaker: Хэтти
Во дворе у ворот продают новые детали взамен тех, что вытащили из твоего двигателя, а зерно я тебе запишу в долг. # speaker: Хэтти
The water is cold and tastes of stone. A bowl of hot grain comes after it. # page
-> start.ask
