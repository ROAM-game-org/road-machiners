The factory replayed the same seed on your fixes, at commit {{sha}}. This is play {{play}} of at most {{runs}} in this job. The last play of this job can only pass or block.

`.factory/playtest/log.jsonl` and `.factory/playtest-facts.json` now hold the new run. The baseline log is the same as before.

Do not hunt the whole log again. The findings of the first play stay the scope of this job. Check two things:
- Each fix holds: the failure you fixed no longer shows in the new log.
- The fixes broke nothing: compare the new log with the run of commit {{start}} around what your fixes touch. Check the facts for an error ending, a stall, a death or a quiet part that is new.
A new finding counts only when one of your fixes caused it. Anything else you notice goes into `suspected`.
The factory opened a bug issue for each important old finding and each balance finding of the earlier rounds and added it to `.factory/open-bugs.md`. A finding of those kinds that you list again names that issue in `known`.

Fix what still fails, with the smallest change, and commit it. Then read `.factory/playtest-review.md` again and write `.factory/playtest.json` in its shape exactly. List the findings this log still shows. A finding of an earlier round may stay in the list with `fixed` true only when a commit of an earlier round fixed it and this log shows it no longer happens. Every finding this log still shows, also one you fixed in this round, has `fixed` false.
Update `.factory/playtest.md`, so it covers the whole job.

The rules of the review, the same text as `.factory/playtest-review.md`:
{{review}}
