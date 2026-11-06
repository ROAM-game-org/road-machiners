INCLUDE world.ink

VAR renata_sheets = false
VAR renata_drawn = false
VAR renata_news = false

=== start ===
# checkpoint: start
Good day, driver. I'm Renata Sayle, and we sell map sheets of the basin.
-> hub

= hub
# checkpoint: start.hub
+ {not renata_sheets} [What do the sheets show?]
  Each sheet shows one square of the basin, drawn from couriers' logs.
  The more of it you've driven, the less I charge you to fill the gaps.
  ~ renata_sheets = true
  -> hub
+ {not renata_drawn} [Who drew them?]
  I draw them from the latest courier logs, one road at a time.
  Tamsin Roe and Vesna Hale cover the south loop.
  ~ renata_drawn = true
  -> hub
+ {not renata_news} [What else does the Guild sell?]
  We carry messages by courier and radio relay, for a fee.
  We also sell news to every side, with each report dated so you know its age.
  ~ renata_news = true
  -> hub
+ [Goodbye.]
  Same sheet, same price, whoever you are.
  -> END
