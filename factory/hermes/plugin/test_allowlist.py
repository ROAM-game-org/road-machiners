import pytest

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from allowlist import with_allowlist, with_values, write_allowlist, write_group_chat, write_passed  # noqa: E402


def test_replaces_the_line_and_keeps_others():
    text = "OPENAI_X=1\nTELEGRAM_ALLOWED_USERS=5\n"
    assert with_allowlist(text, {"2", "1"}) == "OPENAI_X=1\nTELEGRAM_ALLOWED_USERS=1,2\n"


def test_adds_the_line_to_an_empty_file():
    assert with_allowlist("", {"7"}) == "TELEGRAM_ALLOWED_USERS=7\n"


def test_refuses_an_empty_or_bad_committee():
    with pytest.raises(ValueError):
        with_allowlist("", set())
    with pytest.raises(ValueError):
        with_allowlist("", {"abc"})


def test_write_is_private(tmp_path):
    env = tmp_path / ".env"
    write_allowlist(env, {"3"})
    assert env.read_text() == "TELEGRAM_ALLOWED_USERS=3\n"
    assert oct(env.stat().st_mode & 0o777) == "0o600"


def test_with_values_replaces_old_lines_and_keeps_others():
    text = "A=1\nGH_TOKEN=old\n# note\n"
    assert with_values(text, {"GH_TOKEN": "new", "FACTORY_REPO": "o/r"}) == "A=1\n# note\nGH_TOKEN=new\nFACTORY_REPO=o/r\n"


def test_write_passed_needs_every_key(tmp_path):
    with pytest.raises(KeyError, match="FACTORY_REPO"):
        write_passed(tmp_path / ".env", {"OTHER": "x"})


CHATS = {"FACTORY_COMMITTEE_CHAT": "-100", "FACTORY_PUBLIC_DISCUSSION": "-200", "FACTORY_PROPOSAL_CHAT": "-300"}


def test_write_group_chat_admits_the_committee_and_player_chats_and_frees_only_the_player_chats(tmp_path):
    env = tmp_path / ".env"
    env.write_text("TELEGRAM_ALLOWED_USERS=3\n")
    write_group_chat(env, CHATS)
    assert env.read_text() == "TELEGRAM_ALLOWED_USERS=3\nTELEGRAM_GROUP_ALLOWED_CHATS=-100,-200,-300\nTELEGRAM_FREE_RESPONSE_CHATS=-200,-300\n"


def test_write_group_chat_names_a_shared_chat_once_and_keeps_a_shared_committee_chat_mention_only(tmp_path):
    env = tmp_path / ".env"
    write_group_chat(env, {**CHATS, "FACTORY_PROPOSAL_CHAT": "-100"})
    assert env.read_text() == "TELEGRAM_GROUP_ALLOWED_CHATS=-100,-200\nTELEGRAM_FREE_RESPONSE_CHATS=-200\n"


@pytest.mark.parametrize("key", list(CHATS))
@pytest.mark.parametrize("value", [None, "", "chat"])
def test_write_group_chat_needs_numeric_chats(tmp_path, key, value):
    environ = {k: v for k, v in CHATS.items() if k != key}
    if value is not None:
        environ[key] = value
    with pytest.raises(KeyError, match=key):
        write_group_chat(tmp_path / ".env", environ)
