A failing, slow or hung game test is fixed by the rules of `docs/testing.md`: find the rule the test guards, keep every case, seed, turn and roll, and never add a time limit or re-pin a value to what the new code produced.
When a fix changes behavior that a game doc describes, update that doc in the same commit. Update only the docs that fix makes stale, with no broad docs pass.
