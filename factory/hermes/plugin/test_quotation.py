import sys

import pytest

from test_route import plugin

quotation = sys.modules[f"{plugin.__name__}.quotation"]

RUSSIAN = "Пусть Hermes цитирует нас дословно, а не пересказывает."


def quoted(*blocks, context=None):
    parts = [f"{quotation.OPEN}\n{block}\n{quotation.CLOSE}" for block in blocks]
    if context is not None:
        parts.append(f"{quotation.CONTEXT}\n{context}")
    return "\n\n".join(parts)


def test_one_quotation_passes():
    assert quotation.problems(quoted("Set FACTORY_TEST_WORKERS to 2, the box swaps.")) == []


def test_several_quotations_and_a_context_pass():
    text = quoted(
        "The tow fee is too high.", RUSSIAN,
        context="- Evidence: #212 sets the fee in game/src/tow.ts.\n- Reading: the member means the base fee.",
    )
    assert quotation.problems(text) == []


def test_a_request_without_a_quotation_is_refused():
    found = quotation.problems("Lower the tow fee to 40 and add a test.")
    assert f"The request holds no {quotation.OPEN} block with the member's words." in found


def test_an_empty_quotation_is_refused():
    assert any("empty" in p for p in quotation.problems(f"{quotation.OPEN}\n  \n{quotation.CLOSE}"))


@pytest.mark.parametrize("text", [
    f"{quotation.OPEN}\nwords",
    f"words\n{quotation.CLOSE}",
    f"{quotation.OPEN}\n{quotation.OPEN}\nwords\n{quotation.CLOSE}",
])
def test_unbalanced_markers_are_refused(text):
    assert quotation.problems(text)


def test_hermes_text_outside_the_context_is_refused():
    text = "The member wants a cheaper tow.\n\n" + quoted("The tow fee is too high.")
    [problem] = quotation.problems(text)
    assert quotation.CONTEXT in problem


def test_a_quotation_after_the_context_is_refused():
    text = quoted("The tow fee is too high.", context="Reading: base fee.") + f"\n{quotation.OPEN}\nmore\n{quotation.CLOSE}"
    assert any("before" in p for p in quotation.problems(text))


def test_markers_must_stand_on_their_own_line():
    text = f"{quotation.OPEN} The tow fee is too high. {quotation.CLOSE}"
    assert quotation.problems(text)


def test_quoted_words_comes_back_unchanged():
    words = "  Keep   the spacing,\n\n\tthe tabs, «quotes» and\n" + RUSSIAN + "  "
    assert quotation.quoted_words(quoted(words, context="Reading: none.")) == [words]
