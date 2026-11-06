INCLUDE world.ink

VAR emil_sheets = false
VAR emil_here = false
VAR emil_news = false

=== start ===
# checkpoint: start
Добрый день. Я Эмиль Тарн, и этот пост продает листы карт котловины.
-> hub

= hub
# checkpoint: start.hub
+ {not emil_sheets} [Что на этих листах?]
  Один квадрат котловины, по записям курьеров.
  Чем больше дорог пройдено, тем меньше остается продать.
  ~ emil_sheets = true
  -> hub
+ {not emil_here} [Почему Гильдия здесь?]
  У Носа и Чаши свои доли в трасте Гильдии.
  Этот пост стоит здесь по праву.
  ~ emil_here = true
  -> hub
+ {not emil_news} [Что ещё продает Гильдия?]
  Сообщения курьером или по радиореле, за плату.
  Новости, любой стороне, которая платит.
  ~ emil_news = true
  -> hub
+ [До свидания.]
  -> END
