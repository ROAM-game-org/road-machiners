import asyncio
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

plugin_dir = Path(__file__).parent
spec = importlib.util.spec_from_file_location("factory_plugin_public", plugin_dir / "__init__.py", submodule_search_locations=[str(plugin_dir)])
plugin = importlib.util.module_from_spec(spec)
sys.modules["factory_plugin_public"] = plugin
spec.loader.exec_module(plugin)
public = sys.modules["factory_plugin_public.public"]

COMMITTEE_CHAT = "-100"
DISCUSSION = "-200"
PROPOSAL_CHAT = "-300"
CHANNEL = -1009


def cfg_for(tmp_path, proposal_chat=PROPOSAL_CHAT):
    return plugin.Config(str(tmp_path / "inbox"), str(tmp_path / "state"), COMMITTEE_CHAT, None, DISCUSSION, proposal_chat, str(tmp_path / "public-inbox"))


def chat(chat_id, kind="supergroup"):
    return {"id": int(chat_id), "type": kind}


def count_update(chat_id=PROPOSAL_CHAT):
    return {
        "update_id": 501,
        "message_reaction_count": {
            "chat": chat(chat_id, "channel"), "message_id": 17, "date": 1700000000,
            "reactions": [
                {"type": {"type": "emoji", "emoji": "\U0001F44D"}, "total_count": 12},
                {"type": {"type": "custom_emoji", "custom_emoji_id": "5"}, "total_count": 3},
                {"type": {"type": "paid"}, "total_count": 1},
                {"type": {"type": "emoji", "emoji": "\U0001F525"}, "total_count": 2},
            ],
        },
    }


def reaction_update(chat_id=DISCUSSION, user=True):
    body = {
        "chat": chat(chat_id), "message_id": 17, "date": 1700000001,
        "old_reaction": [],
        "new_reaction": [{"type": "emoji", "emoji": "\U0001F44D"}, {"type": "custom_emoji", "custom_emoji_id": "5"}],
    }
    body["user" if user else "actor_chat"] = {"id": 42, "first_name": "Ann", "is_bot": False} if user else chat(CHANNEL, "channel")
    return {"update_id": 502, "message_reaction": body}


def forward_update():
    return {
        "update_id": 503,
        "message": {
            "message_id": 90, "date": 1700000002, "chat": chat(DISCUSSION),
            "from": {"id": 777000, "is_bot": False, "first_name": "Telegram"},
            "sender_chat": chat(CHANNEL, "channel"),
            "is_automatic_forward": True,
            "forward_origin": {"type": "channel", "chat": chat(CHANNEL, "channel"), "message_id": 17, "date": 1700000000},
            "text": "The pitch",
        },
    }


def comment_update(chat_id=DISCUSSION, **overrides):
    message = {
        "message_id": 91, "date": 1700000003, "chat": chat(chat_id),
        "from": {"id": 42, "is_bot": False, "first_name": "Ann", "last_name": "Lee", "username": "ann"},
        "message_thread_id": 90, "reply_to_message": {"message_id": 90, "date": 1700000002, "chat": chat(chat_id)},
        "text": "Add a trailer please",
    }
    message.update(overrides)
    return {"update_id": 504, "message": message}


def written(tmp_path):
    return {path.name: json.loads(path.read_text()) for path in (tmp_path / "public-inbox").iterdir()} if (tmp_path / "public-inbox").exists() else {}


def test_reaction_count_event(tmp_path):
    stop = public.handle_public_update(count_update(), cfg_for(tmp_path))
    assert stop is True
    assert written(tmp_path) == {"501.json": {
        "updateId": 501, "kind": "reaction-count", "chat": PROPOSAL_CHAT, "messageId": 17,
        "counts": {"\U0001F44D": 12, "\U0001F525": 2},
    }}


def test_user_reaction_event(tmp_path):
    stop = public.handle_public_update(reaction_update(), cfg_for(tmp_path))
    assert stop is True
    assert written(tmp_path) == {"502.json": {
        "updateId": 502, "kind": "reaction", "chat": DISCUSSION, "messageId": 17, "user": "42", "emoji": ["\U0001F44D"],
    }}


def test_removed_reaction_has_empty_list(tmp_path):
    raw = reaction_update()
    raw["message_reaction"]["new_reaction"] = []
    public.handle_public_update(raw, cfg_for(tmp_path))
    assert written(tmp_path)["502.json"]["emoji"] == []


def test_anonymous_reaction_writes_nothing_and_stops(tmp_path):
    assert public.handle_public_update(reaction_update(user=False), cfg_for(tmp_path)) is True
    assert written(tmp_path) == {}


def test_reaction_in_other_chat_is_ignored(tmp_path):
    assert public.handle_public_update(reaction_update(chat_id=COMMITTEE_CHAT), cfg_for(tmp_path)) is False
    assert public.handle_public_update(count_update(chat_id="-999"), cfg_for(tmp_path)) is False
    assert written(tmp_path) == {}


def test_automatic_forward_event(tmp_path):
    stop = public.handle_public_update(forward_update(), cfg_for(tmp_path))
    assert stop is True
    assert written(tmp_path) == {"503.json": {
        "updateId": 503, "kind": "forward", "chat": DISCUSSION, "messageId": 90,
        "channelChat": str(CHANNEL), "channelMessageId": 17,
    }}


def test_discussion_comment_event(tmp_path):
    stop = public.handle_public_update(comment_update(), cfg_for(tmp_path))
    assert stop is True
    assert written(tmp_path) == {"504.json": {
        "updateId": 504, "kind": "comment", "chat": DISCUSSION, "messageId": 91, "threadId": 90,
        "author": "Ann Lee", "text": "Add a trailer please", "at": "2023-11-14T22:13:23Z",
    }}


def test_comment_uses_reply_when_no_thread_and_caption_and_username(tmp_path):
    raw = comment_update(message_thread_id=None, text=None, caption="A photo", reply_to_message={"message_id": 77})
    raw["message"].pop("text")
    raw["message"]["from"] = {"id": 5, "is_bot": False, "username": "bob"}
    public.handle_public_update(raw, cfg_for(tmp_path))
    event = written(tmp_path)["504.json"]
    assert (event["threadId"], event["text"], event["author"]) == (77, "A photo", "bob")


def test_discussion_message_without_thread_or_text_writes_nothing_but_stops(tmp_path):
    no_thread = comment_update(message_thread_id=None, reply_to_message=None)
    no_text = comment_update(text=None)
    no_text["message"].pop("text")
    for raw in (no_thread, no_text):
        assert public.handle_public_update(raw, cfg_for(tmp_path)) is True
    assert written(tmp_path) == {}


def test_discussion_member_message_stops_hermes(tmp_path):
    raw = comment_update()
    raw["message"]["from"]["id"] = 1
    assert public.handle_public_update(raw, cfg_for(tmp_path)) is True


def test_committee_chat_reply_writes_comment_and_goes_on(tmp_path):
    cfg = cfg_for(tmp_path, proposal_chat=COMMITTEE_CHAT)
    stop = public.handle_public_update(comment_update(chat_id=COMMITTEE_CHAT), cfg)
    assert stop is False
    event = written(tmp_path)["504.json"]
    assert (event["kind"], event["chat"], event["threadId"]) == ("comment", COMMITTEE_CHAT, 90)


def test_committee_chat_plain_message_writes_nothing_and_goes_on(tmp_path):
    cfg = cfg_for(tmp_path, proposal_chat=COMMITTEE_CHAT)
    raw = comment_update(chat_id=COMMITTEE_CHAT, message_thread_id=None, reply_to_message=None)
    assert public.handle_public_update(raw, cfg) is False
    assert written(tmp_path) == {}


def test_unrelated_chat_is_untouched(tmp_path):
    raw = comment_update(chat_id="-777")
    assert public.handle_public_update(raw, cfg_for(tmp_path)) is False
    assert written(tmp_path) == {}


def test_update_without_known_kind_is_untouched(tmp_path):
    assert public.handle_public_update({"update_id": 9, "callback_query": {}}, cfg_for(tmp_path)) is False


def test_write_failure_is_logged_and_discussion_still_stops(tmp_path, caplog):
    blocked = tmp_path / "public-inbox"
    blocked.write_text("a file, not a folder")
    assert public.handle_public_update(comment_update(), cfg_for(tmp_path)) is True
    assert "could not hand public update 504" in caplog.text


def test_write_failure_in_committee_chat_still_goes_on(tmp_path, caplog):
    (tmp_path / "public-inbox").write_text("x")
    cfg = cfg_for(tmp_path, proposal_chat=COMMITTEE_CHAT)
    assert public.handle_public_update(comment_update(chat_id=COMMITTEE_CHAT), cfg) is False
    assert "could not hand public update 504" in caplog.text


def test_write_is_atomic_and_group_readable(tmp_path, monkeypatch):
    seen = []
    real = public.os.replace
    monkeypatch.setattr(public.os, "replace", lambda a, b: (seen.append((Path(a).name, Path(b).name, Path(a).exists())), real(a, b)))
    public.handle_public_update(count_update(), cfg_for(tmp_path))
    assert seen == [("501.json.tmp", "501.json", True)]
    assert [p.name for p in (tmp_path / "public-inbox").iterdir()] == ["501.json"]
    assert (tmp_path / "public-inbox" / "501.json").stat().st_mode & 0o777 == 0o640


def test_handler_raises_stop_only_when_needed(tmp_path, monkeypatch):
    class Stop(Exception):
        pass

    telegram_ext = SimpleNamespace(ApplicationHandlerStop=Stop)
    monkeypatch.setitem(sys.modules, "telegram", SimpleNamespace(ext=telegram_ext))
    monkeypatch.setitem(sys.modules, "telegram.ext", telegram_ext)
    on_update = public.make_public_handler(cfg_for(tmp_path))
    with pytest.raises(Stop):
        asyncio.run(on_update(SimpleNamespace(to_dict=lambda: comment_update()), None))
    asyncio.run(on_update(SimpleNamespace(to_dict=lambda: comment_update(chat_id="-777")), None))


def test_hook_skips_discussion_group_even_for_a_member(tmp_path):
    cfg = cfg_for(tmp_path)
    source = SimpleNamespace(user_id="1", user_name="Ann", chat_id=int(DISCUSSION), platform="telegram")
    event = SimpleNamespace(text="hello", reply_to_message_id=None, source=source, message_id="5")
    result = asyncio.run(plugin.make_hook(cfg, None)(event, None, None))
    assert result == {"action": "skip", "reason": "factory-public-discussion"}


def test_register_adds_public_factory_before_buttons(tmp_path, monkeypatch):
    values = {
        "FACTORY_INBOX": "/in", "FACTORY_STATE_DIR": str(tmp_path / "state"), "FACTORY_COMMITTEE_CHAT": COMMITTEE_CHAT,
        "FACTORY_OBSERVATION_HEARTBEAT_MS": "10000", "FACTORY_PUBLIC_URL": "https://example.org",
        "FACTORY_STATUS_TIMEOUT_MS": "10000", "FACTORY_ROUTE_MIN_WORDS": "4", "FACTORY_REPO": "owner/repo",
        "FACTORY_COMMITTEE_DIR": str(tmp_path / "committee"), "FACTORY_COMMITTEE_BOOTSTRAP": "1",
        "FACTORY_COMMITTEE_BOOTSTRAP_GITHUB": "boss", "FACTORY_PUBLIC_DISCUSSION": DISCUSSION,
        "FACTORY_PROPOSAL_CHAT": PROPOSAL_CHAT, "FACTORY_PUBLIC_INBOX": str(tmp_path / "public-inbox"),
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    factories = []
    ctx = SimpleNamespace(register_hook=lambda *a: None, register_tool=lambda **kw: None, register_telegram_handler=factories.append)
    plugin.register(ctx)
    assert [factory.__qualname__.split(".")[0] for factory in factories] == ["make_public_factory", "make_button_factory"]
