INCLUDE world.ink

VAR emil_sheets = false
VAR emil_price = false
VAR emil_here = false
VAR emil_watch = false
VAR emil_news = false

=== start ===
# checkpoint: start
Somewhere in the hull a press thumps. The man at the counter stamps a sheet, stamps a ledger, and waits for the thump to pass before he speaks. You catch yourself lowering your voice too. Between you lies a map of the basin, cut into squares.
Good day, driver. I am Emil Tarn, of the <term=guild>Guild</term>. The squares on this map are for sale.
-> hub

= hub
# checkpoint: start.hub
+ {not emil_sheets} [What does a square show?]
  One sheet shows the roads and places in one grid square.
  ~ emil_sheets = true
  -> hub
+ {not emil_price} [How much is a square?]
  Show me your road log. I charge only for the ground in that square your log does not show.
  You hand over the log you keep in the cab. He reads it without moving his face, and hands it back.
  Point to a square. I will tell you the price.
  ~ emil_price = true
  -> hub
+ {not emil_here} [Why is the Guild here?]
  Nose holds a share in the Guild, as <term=bowl>Bowl</term> does, so we may stand here.
  The <term=committee>Committee</term> watches what passes through.
  ~ emil_here = true
  -> hub
+ {emil_here and not emil_watch} [What does the Committee watch?]
  The Order Bureau reads the messages we send. The rest is not mine to say.
  The press thumps. He waits for it, and for you to stop asking.
  ~ emil_watch = true
  -> hub
+ {not emil_news} [What else does the Guild sell?]
  Messages, by courier or radio, for a fee.
  News, to Nose and Bowl. Not over this counter.
  ~ emil_news = true
  -> hub
+ [Goodbye.]
  Safe road. The map stays on the counter.
  -> END
