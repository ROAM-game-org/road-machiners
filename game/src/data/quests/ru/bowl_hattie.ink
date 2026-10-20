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
+ {towed_to_bowl and not hattie_tow} [Расскажи про буксировщика.]
  На его цепи старая бирка со двора «<term=pierce>Пирса</term>». До того как бригады заняли двор, «Пирс» вешал такие бирки на каждый свой ключ и каждую цепь.
  Бирка на твоем ключе тоже с того двора.
  Он нашел твой грузовик в пустошах. Стоит, не едет, а в кресле ты. Решил, что грузовик бросили, зацепил и притащил сюда вместе с тобой.
  ~ hattie_tow = true
  -> hub
+ {towed_to_bowl and engine_missing() and not hattie_strip} [Кто ободрал мой грузовик?]
  Не буксировщик, если ты на него думаешь. Кто ободрал, тот не спешил, а тебя в живых оставил.
  ~ hattie_strip = true
  -> hub
+ {not hattie_rumor} [Слухи есть?]
  На днях тут один мусорщик рацию армии <term=nose>Носа</term> продавал, говорил, снял с подбитой машины в холмах к северо-востоку от Чаши.
  А как патруль спросил, где именно, он залил бак и до темноты укатил по западной дороге.
  ~ note("wagonBowl")
  ~ hattie_rumor = true
  -> hub
+ {not hattie_flats} [Местные легенды есть?]
  Говорят, по <term=glass_flats>Стеклянной равнине</term> до сих пор ездит танк старого мира. По ночам выезжает, без огней.
  Один водила клялся, что видел его. Только я этого водилу видела всегда с выпивкой.
  ~ note("glassTank")
  ~ hattie_flats = true
  -> hub
+ {not hattie_strangers} [Кто тут проезжает?]
  Торговцы, курьеры, возчики топлива, солдаты из Носа за водой, а еще молчуны всякие: спрашивают про <term=granary>Элеватор</term>, воды не берут.
  Вот кто про Элеватор спрашивает, те меня и тревожат. Странно у колодца про воду забыть.
  ~ hattie_strangers = true
  -> hub
+ {hattie_strangers and not hattie_granary} [Кто расспрашивает про Элеватор?]
  Водилы с пустыми кузовами расспрашивают, рейдеры им платят наше зерно считать.
  Одиль каждый вечер мелом на воротах Элеватора пишет, сколько там зерна. Так что платят они за умение читать.
  ~ hattie_granary = true
  -> hub
+ {hattie_strangers and not hattie_soldiers} [Что скажешь про солдат с Носа?]
  За воду платят как гости, а командуют как хозяева.
  Просят вежливо. Потом стоят над душой, пока не сделаешь.
  ~ hattie_soldiers = true
  -> hub
+ {hattie_soldiers and not hattie_roads} [Солдаты с Носа остановят меня на дороге?]
  Не остановят. И тех, кто придет твой грузовик отбирать, тоже не остановят.
  ~ hattie_roads = true
  -> hub
+ {hattie_roads and not hattie_unarmed} [А если приехать на Нос без оружия?]
  Впустить-то тебя впустят.
  А на выезде заставят купить пушку, и цену назначат сами.
  ~ hattie_unarmed = true
  -> hub
+ {hattie_flats and not hattie_glass} [Что со стеклом на Стеклянной равнине?]
  Пим Арслан говорит, все волны на стекле клонятся в одну сторону, к кратеру <term=fallen_sun>Павшего солнца</term>.
  А я в полдень на это стекло ни ногой. И проверять, опасно ли, не собираюсь. <term=sunward>Обращенные к Солнцу</term> говорят, стекло кланяется тому, что в кратере.
  ~ note("talkGlassLean")
  ~ hattie_glass = true
  -> hub
+ {hattie_glass and not hattie_sunward} [Что Обращенные к Солнцу делают с чужаками?]
  Водят в кратер, выводят зеленых по краям и тихих. Говорят, чужаки оттуда не возвращаются, а я говорю: возвращаются, только уже не те.
  Я в тот кратер не ходила и не пойду. Водой торгую, а ум свой при себе держу.
  ~ note("talkSunwardTake")
  ~ hattie_sunward = true
  -> hub
+ {hattie_sunward and cult_broken()} [Have the Sunward gone quiet?]
  Quiet as a dry well. Bo's cousin says the lamps stopped crossing to the crater at dusk, and a man with a green shine on his hands came to my well asking where a body could sleep. Well, Bo's cousin says a lot of things. You look like you'd know more about it than he does.
  -> hub
+ {hattie_sunward and not hattie_came_out} [А кто-нибудь выходил на твоих глазах?]
  Одну видела, в сумерках. Руки у нее в темноте зеленым светились, а воду пила молча, ведро за ведром.
  Не заплатила ни М и пошла обратно к кратеру.
  ~ hattie_came_out = true
  -> hub
+ [Пока.]
  { towed_to_bowl: Бывай, долг с доски сам не сотрется. | Бывай, заходи за водой, когда будут М. И колеса по дороге не растеряй. }
  -> END
