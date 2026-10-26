INCLUDE world.ink

VAR hattie_rumor = false
VAR hattie_flats = false
VAR hattie_glass = false
VAR hattie_sunward = false
VAR hattie_strangers = false
VAR hattie_granary = false
VAR hattie_soldiers = false
VAR hattie_roads = false
VAR hattie_came_out = false
VAR hattie_tow = false
VAR hattie_strip = false
VAR hattie_unarmed = false

=== start ===
# checkpoint: start
Отгони свое корыто от колодца, водила, и скажи, сколько воды надо. Я Хэтти. Деньги беру за воду, а советы бесплатно, ты их все равно мимо ушей пропустишь.
В <term=bowl>Чаше</term> за теми воротами еду растят. А водилы здесь, у меня, пока баки не наполнят.
-> hub

= hub
# checkpoint: start.hub
+ {towed_to_bowl and (not hattie_tow or (engine_missing() and not hattie_strip))} [О моем грузовике…]
  -> about_tow
+ {not hattie_rumor} [Слухи есть?]
  На днях тут один мусорщик рацию армии <term=nose>Носа</term> продавал, говорил, снял с подбитой машины в холмах к северо-востоку от Чаши.
  А как патруль спросил, где именно, он залил бак и до темноты укатил по северной дороге.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats or not hattie_glass or not hattie_sunward or cult_broken() or not hattie_came_out} [Об Обращенных к Солнцу…]
  -> about_sunward
+ {not (hattie_strangers and hattie_granary and hattie_soldiers and hattie_roads and hattie_unarmed)} [О чужаках и солдатах…]
  -> about_strangers
+ [Пока.]
  { towed_to_bowl: Бывай, долг с доски сам не сотрется. | Бывай, заходи за водой, когда будут М. И колеса по дороге не растеряй. }
  -> END

= about_tow
+ {towed_to_bowl and not hattie_tow} [Расскажи про буксировщика.]
  На его цепи старая бирка со двора «<term=pierce>Пирса</term>». До того как бригады заняли двор, «Пирс» вешал такие бирки на каждый свой ключ и каждую цепь.
  Бирка на твоем ключе тоже с того двора.
  Он нашел твой грузовик в пустошах. Стоит, не едет, а в кресле ты. Решил, что грузовик бросили, зацепил и притащил сюда вместе с тобой.
  ~ hattie_tow = true
  -> about_tow
+ {towed_to_bowl and engine_missing() and not hattie_strip} [Кто ободрал мой грузовик?]
  Не буксировщик, если ты на него думаешь. Кто ободрал, тот не спешил, а тебя в живых оставил.
  ~ hattie_strip = true
  -> about_tow
+ [Назад.]
  -> hub

= about_strangers
+ {not hattie_strangers} [Кто тут проезжает?]
  Торговцы, курьеры, возчики топлива, солдаты из Носа за водой, а еще молчуны всякие: спрашивают про <term=granary>Элеватор</term>, воды не берут.
  Вот кто про Элеватор спрашивает, те меня и тревожат. Странно у колодца про воду забыть.
  ~ hattie_strangers = true
  -> about_strangers
+ {hattie_strangers and not hattie_granary} [Кто расспрашивает про Элеватор?]
  Водилы с пустыми кузовами расспрашивают, рейдеры им платят наше зерно считать.
  Одиль каждый вечер мелом на воротах Элеватора пишет, сколько там зерна. Так что платят они за умение читать.
  ~ hattie_granary = true
  -> about_strangers
+ {hattie_strangers and not hattie_soldiers} [Что скажешь про солдат с Носа?]
  За воду платят как гости, а командуют как хозяева.
  Просят вежливо. Потом стоят над душой, пока не сделаешь.
  ~ hattie_soldiers = true
  -> about_strangers
+ {hattie_soldiers and not hattie_roads} [Солдаты с Носа остановят меня на дороге?]
  Не остановят. И тех, кто придет твой грузовик отбирать, тоже не остановят.
  Между городами дорогу никто не охраняет, а рейдеры Обжига обдирают любой грузовик, который не может отбиться и не платит.
  ~ hattie_roads = true
  -> about_strangers
+ {hattie_roads and not hattie_unarmed} [А если приехать на Нос без пушки?]
  Впустить-то тебя впустят.
  И выпустят тоже, с пушкой или без. Только слыхала, что «Пирс» грузовик без пушки не страхует.
  ~ hattie_unarmed = true
  -> about_strangers
+ [Назад.]
  -> hub

= about_sunward
+ {not hattie_flats} [Местные легенды есть?]
  Один водила клянется, что по <term=glass_flats>Стеклянной равнине</term> до сих пор ездит танк старого мира. По ночам выезжает, без огней.
  А я только и видела, как он пьет.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> about_sunward
+ {hattie_flats and not hattie_glass} [Что со стеклом на Стеклянной равнине?]
  Пим Арслан говорит, все волны на стекле клонятся в одну сторону, к кратеру <term=fallen_sun>Павшего солнца</term>.
  А я в полдень на это стекло ни ногой. И проверять, опасно ли, не собираюсь. <term=sunward>Обращенные к Солнцу</term> говорят, стекло кланяется тому, что в кратере.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> about_sunward
+ {hattie_glass and not hattie_sunward} [Что Обращенные к Солнцу делают с чужаками?]
  Водят в кратер, выводят зеленых по краям и тихих.
  Я в тот кратер не ходила и не пойду.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> about_sunward
+ {hattie_sunward and cult_broken()} [Обращенные к Солнцу затихли?]
  Тихо, как в высохшем колодце. Двоюродный брат Бо говорит, в сумерках огни перестали ходить к кратеру. И к моему колодцу приходил человек с зеленым свечением на руках, спрашивал, где тут переночевать. Ну так двоюродный брат Бо много чего болтает. По тебе видно, что знаешь об этом побольше него.
  -> about_sunward
+ {hattie_sunward and not hattie_came_out} [А кто-нибудь выходил из кратера на твоих глазах?]
  Одну видела, в сумерках. Руки у нее в темноте зеленым светились, а воду пила молча, ведро за ведром.
  Не заплатила ни М и пошла обратно к кратеру.
  ~ hattie_came_out = true
  -> about_sunward
+ [Назад.]
  -> hub
