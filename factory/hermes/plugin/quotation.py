OPEN = "<member-words>"
CLOSE = "</member-words>"
CONTEXT = "Context from Hermes:"
FORMAT = (
    f"Put the member's exact words between a line {OPEN} and a line {CLOSE}, one block per message, copied and never translated or reworded. "
    f"Put any facts or reading of yours after every block, under a line {CONTEXT}"
)


def problems(text: str) -> list:
    found, blocks, inside, in_context = [], [], None, False
    for line in text.split("\n"):
        marker = line.strip()
        if inside is not None:
            if marker == CLOSE:
                blocks.append(inside)
                inside = None
            elif marker == OPEN:
                found.append(f"A {OPEN} block opens inside another one.")
            else:
                inside.append(line)
        elif marker == OPEN:
            if in_context:
                found.append(f"Every {OPEN} block must come before the line {CONTEXT}")
            inside = []
        elif marker == CLOSE:
            found.append(f"A {CLOSE} line has no {OPEN} line before it.")
        elif marker == CONTEXT:
            in_context = True
        elif marker and not in_context:
            found.append(f"Your own text must go under the line {CONTEXT} after the quotation, not beside the member's words.")
    if inside is not None:
        found.append(f"A {OPEN} block has no {CLOSE} line.")
    if not blocks and inside is None:
        found.append(f"The request holds no {OPEN} block with the member's words.")
    if any(not "".join(block).strip() for block in blocks):
        found.append(f"A {OPEN} block is empty.")
    return list(dict.fromkeys(found))


def quoted_words(text: str) -> list:
    words, inside = [], None
    for line in text.split("\n"):
        marker = line.strip()
        if inside is not None and marker == CLOSE:
            words.append("\n".join(inside))
            inside = None
        elif inside is not None:
            inside.append(line)
        elif marker == OPEN:
            inside = []
    return words


def refusal(found: list) -> str:
    return "Nothing was queued:\n" + "\n".join(f"- {p}" for p in found) + f"\n{FORMAT}\nFix the request, then queue it again."
