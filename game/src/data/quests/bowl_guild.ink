INCLUDE world.ink

VAR renata_sheets = false
VAR renata_price = false
VAR renata_drawn = false
VAR renata_pair = false
VAR renata_news = false
VAR renata_jill = false

=== start ===
# checkpoint: start
A woman behind the counter holds a sheet flat with two lead weights. Between you lies a map of the basin, cut into squares. You've paid for worse directions than this.
Good day, driver. I'm Renata Sayle of the <term=guild>Guild</term>, and any square on this map is for sale.
-> hub

= hub
# checkpoint: start.hub
+ {not renata_sheets} [What does a square show?]
  Each sheet shows the roads and places in one grid square.
  ~ renata_sheets = true
  -> hub
+ {not renata_price} [How much is a square?]
  Your road log, please. I charge only for the ground in that square your log does not show.
  You hand over the log you keep in the cab. She runs a finger down it, and learns more about your week than you'd like.
  Point to a square, please. I'll give you the price.
  ~ renata_price = true
  -> hub
+ {not renata_drawn} [Who drew them?]
  I draw the sheets from our couriers' latest logs.
  Tamsin Roe and Vesna Hale drive the south road, and their logs go into those sheets.
  ~ renata_drawn = true
  -> hub
+ {renata_drawn and not renata_pair} [Who are Tamsin and Vesna?]
  Tamsin Roe is our fastest courier, though she carries no gun. Vesna Hale rides with her and handles that part.
  ~ renata_pair = true
  -> hub
+ {not renata_news} [What else does the Guild sell?]
  We carry messages for a fee, and we sell news to <term=bowl>Bowl</term> and <term=nose>Nose</term>.
  ~ renata_news = true
  -> hub
+ {renata_news and not renata_jill} [Is there no news for me?]
  Jill Jane gives the news away on the radio. Very generous of her, though our couriers still expect to be paid.
  She squares the sheet against the counter's edge, harder than it needs.
  ~ renata_jill = true
  -> hub
+ [Goodbye.]
  Safe roads. The map stays on the counter.
  -> END
