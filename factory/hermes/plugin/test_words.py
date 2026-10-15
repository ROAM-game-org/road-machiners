import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path

plugin_dir = Path(__file__).parent
spec = importlib.util.spec_from_file_location("factory_plugin", plugin_dir / "__init__.py", submodule_search_locations=[str(plugin_dir)])
plugin = importlib.util.module_from_spec(spec)
sys.modules["factory_plugin"] = plugin
spec.loader.exec_module(plugin)
words_module = sys.modules["factory_plugin.words"]

SESSION = {
    "HERMES_SESSION_CHAT_ID": "-100", "HERMES_SESSION_USER_ID": "1",
    "HERMES_SESSION_USER_NAME": "Ann", "HERMES_SESSION_MESSAGE_ID": "77",
}


class Clock:
    def __init__(self):
        self.now = 1_700_000_000.0

    def __call__(self):
        return self.now


def committee_cfg(tmp_path):
    committee = plugin.Committee(str(tmp_path / "committee"), "1", "boss")
    committee.seed()
    (tmp_path / "state").mkdir()
    (tmp_path / "state" / "state.json").write_text('{"approvalPosts": {"55": 12}}')
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    return inbox, plugin.Config(str(inbox), str(tmp_path / "state"), "-100", committee, "-400", "-300", "/pub")


def send(hook, text, message_id, user="1", reply=None):
    source = types.SimpleNamespace(user_id=user, user_name="Ann", chat_id="-100", platform="telegram")
    event = types.SimpleNamespace(text=text, reply_to_message_id=reply, source=source, message_id=message_id)
    gateway = types.SimpleNamespace(adapters={})
    return asyncio.run(hook(event, gateway, None))


def test_recent_keeps_the_member_messages_of_the_window_ending_with_the_given_one():
    clock = Clock()
    words = words_module.MemberWords(clock)
    words.record("-100", "1", 10, "too old")
    clock.now += words_module.WINDOW_SECONDS + 1
    words.record("-100", "1", 20, "Queue opus to analyze the logs")
    words.record("-100", "2", 21, "another member")
    words.record("-200", "1", 22, "another chat")
    clock.now += 60
    words.record("-100", "1", 23, "yes, do it")
    words.record("-100", "1", 24, "later message")
    assert [item["text"] for item in words.recent("-100", "1", 23)] == ["Queue opus to analyze the logs", "yes, do it"]
    assert words.recent("-100", "1", 23)[0] == {"messageId": 20, "at": "2023-11-14T22:43:21Z", "text": "Queue opus to analyze the logs"}


def test_recent_is_empty_when_the_message_was_never_kept_and_keeps_at_most_the_limit():
    words = words_module.MemberWords(Clock())
    assert words.recent("-100", "1", 5) == []
    for message_id in range(1, 20):
        words.record("-100", "1", message_id, f"m{message_id}")
    words.record("-100", "1", 30, "   ")
    assert len(words.recent("-100", "1", 19)) == words_module.MAX_WORDS
    assert words.recent("-100", "1", 30) == []


def test_change_tool_puts_the_member_words_the_hook_kept_beside_hermes_text(tmp_path):
    inbox, cfg = committee_cfg(tmp_path)
    words = words_module.MemberWords()
    hook = plugin.make_hook(cfg, plugin.Readiness(min_words=3, inbox=str(inbox)), words)
    assert send(hook, "Queue opus to analyze all interaction logs of hermes", "76") is None
    assert send(hook, "yes", "77") is None
    handle = plugin.make_queue_handler(cfg, session_env=lambda key: SESSION.get(key, ""), kind="change", done=plugin.CHANGE_DONE, words=words)
    handle({"request": "Hermes's reading of the request."})
    [path] = list(inbox.iterdir())
    command = json.loads(path.read_text())
    assert command["text"] == "Hermes's reading of the request."
    assert [item["text"] for item in command["words"]] == ["Queue opus to analyze all interaction logs of hermes", "yes"]


def test_task_tool_queues_as_before_when_no_member_words_were_kept(tmp_path):
    inbox, cfg = committee_cfg(tmp_path)
    handle = plugin.make_queue_handler(cfg, session_env=lambda key: SESSION.get(key, ""), words=words_module.MemberWords())
    assert json.loads(handle({"request": "Run the combat sim."}))["success"] is True
    [path] = list(inbox.iterdir())
    assert "words" not in json.loads(path.read_text())


def test_hook_keeps_no_command_and_no_bare_thanks(tmp_path):
    inbox, cfg = committee_cfg(tmp_path)
    words = words_module.MemberWords()
    hook = plugin.make_hook(cfg, plugin.Readiness(min_words=3, inbox=str(inbox)), words)
    send(hook, "thanks", "5")
    send(hook, "approve", "6", reply="55")
    send(hook, "show us the atlas", "7", reply="55")
    assert words.recent("-100", "1", 5) == [] and words.recent("-100", "1", 6) == []
    assert [item["text"] for item in words.recent("-100", "1", 7)] == ["show us the atlas"]
