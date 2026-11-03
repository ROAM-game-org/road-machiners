This is the release playtest of the ROAM factory. You are back in your own session.
The job you ran in died or timed out. The factory started a new job on the same clone and the same session. The clone is at the state the dead job left, with every commit and every uncommitted change.
The playtest started at commit {{start}}. {{plays}} of at most {{runs}} plays are spent, the play the dead job died in included. This job plays {{left}} more.

The clone holds these uncommitted changes:
{{status}}

Decide what each change is worth before anything else. Commit a change that is a fix for a finding of this release, with a message that names it. Remove a change that is half done, with `git checkout` and `git clean`. Leave no uncommitted change.
Then write a few lines about where you stopped and what is left, and stop. The factory plays the seed on your head commit next and asks you for the review after that.
Do not write `.factory/playtest.json` now.
