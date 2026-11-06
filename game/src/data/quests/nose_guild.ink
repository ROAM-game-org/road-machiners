INCLUDE world.ink

VAR emil_sheets = false
VAR emil_here = false
VAR emil_news = false

=== start ===
# checkpoint: start
Good day. I am Emil Tarn, and this post sells map sheets of the basin.
-> hub

= hub
# checkpoint: start.hub
+ {not emil_sheets} [What do the sheets show?]
  One square of the basin, drawn from courier logs.
  The more of it you have driven, the less there is to sell you.
  ~ emil_sheets = true
  -> hub
+ {not emil_here} [Why is the Guild here?]
  Nose and Bowl both hold shares in the Guild trust.
  This post stands here by right.
  ~ emil_here = true
  -> hub
+ {not emil_news} [What else does the Guild sell?]
  Messages by courier or radio relay, for a fee.
  News, to any side that pays.
  ~ emil_news = true
  -> hub
+ [Goodbye.]
  -> END
