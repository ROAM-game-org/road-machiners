import asyncio
import json
import re
import sys
import types
from pathlib import Path

import pytest

from test_route import SESSION, Adapter, make_readiness, plugin, readiness

MEDIA_TS = (Path(__file__).parents[2] / "src" / "media.ts").read_text()
REPLY_MEDIA_TS = (Path(__file__).parents[2] / "src" / "reply-media.ts").read_text()
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + (64).to_bytes(4, "big") + (48).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00"
TEXT = "Delete the middle dot from the inventory header."


def test_limits_and_folder_match_the_factory():
    assert int(re.search(r"MAX_FILES = (\d+)", MEDIA_TS).group(1)) == readiness.MAX_FILES
    assert re.search(r"MAX_BYTES = 10 \* 1024 \* 1024", MEDIA_TS) and readiness.MAX_BYTES == 10 * 1024 * 1024
    assert "join(home, 'inbox', 'media', `post-${post}`)" in REPLY_MEDIA_TS
    assert readiness.post_media_dir("/home/inbox", 55) == Path("/home/inbox/media/post-55")


def refusal_of(result):
    answer = json.loads(result)
    assert "error" in answer, answer
    assert "Nothing was queued" in answer["error"]
    return answer["error"]


def commands(inbox):
    return [json.loads(p.read_text()) for p in sorted(inbox.glob("*.json"))]


def hook_setup(tmp_path):
    (tmp_path / "state").mkdir()
    (tmp_path / "state" / "state.json").write_text('{"approvalPosts": {"55": 12}}')
    (tmp_path / "inbox").mkdir()
    committee = plugin.Committee(str(tmp_path / "committee"), "1", "boss")
    committee.seed()
    cfg = plugin.Config(str(tmp_path / "inbox"), str(tmp_path / "state"), "-100", committee, "-200", "-300", "/pub")
    adapter = Adapter()
    gateway = types.SimpleNamespace(adapters={"telegram": adapter})
    source = types.SimpleNamespace(user_id="1", user_name="Ann", chat_id="-100", platform="telegram")
    ready = make_readiness(tmp_path)
    hook = plugin.make_hook(cfg, ready)

    def send(text, media=(), message_id="5"):
        event = types.SimpleNamespace(text=text, reply_to_message_id="55", source=source, message_id=message_id, media_urls=list(media))
        return asyncio.run(hook(event, gateway, None))

    route = plugin.make_route_handler(cfg, ready, session_env=lambda key: SESSION[key])
    return send, route, adapter, tmp_path / "inbox"


def cached_image(tmp_path, name="img_1.png", data=PNG):
    path = tmp_path / "cache" / name
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(data)
    return str(path)


COMMITTEE_CHAT = -100
APPROVAL_POST = 55
QUESTIONS_POST = 77


def photo_reply(message_id=3527, post=APPROVAL_POST, caption=None, sender=1, chat=COMMITTEE_CHAT, photo=True, document=None):
    """A Telegram message as the Bot API gives it: a member's own photo in several sizes, replying to a post that carries its own screenshot."""
    message = {
        "message_id": message_id, "chat": {"id": chat}, "from": {"id": sender, "first_name": "Dr.", "last_name": "Boris", "is_bot": False},
        "reply_to_message": {"message_id": post, "photo": [{"file_id": "AgACapprovalscreenshot", "width": 1280, "height": 720}]},
    }
    if photo:
        message["photo"] = [
            {"file_id": "AgACsmall", "width": 90, "height": 60, "file_size": 1200},
            {"file_id": "AgACbig", "width": 1280, "height": 853, "file_size": 131746},
        ]
    if document is not None:
        message["document"] = document
    if caption is not None:
        message["caption"] = caption
    return message


def intake_setup(tmp_path):
    send, route, adapter, inbox = hook_setup(tmp_path)
    (tmp_path / "state" / "state.json").write_text(json.dumps({"approvalPosts": {str(APPROVAL_POST): 12}, "questionPosts": {str(QUESTIONS_POST): 30}}))
    committee = plugin.Committee(str(tmp_path / "committee"), "1", "boss")
    cfg = plugin.Config(str(inbox), str(tmp_path / "state"), str(COMMITTEE_CHAT), committee, "-200", "-300", "/pub")
    ready = make_readiness(tmp_path)
    return (lambda message: plugin.keep_committee_image(message, cfg, ready)), send, route, inbox, cfg, ready


def notes(inbox, post):
    folder = inbox / "media" / f"post-{post}"
    return {p.name: p.read_text() for p in sorted(folder.iterdir())} if folder.exists() else {}


def test_a_text_and_image_reply_routed_while_hermes_is_busy_keeps_the_members_own_image(tmp_path):
    """The live #958 path: Hermes queued the reply as a follow-up, so the hook never ran, and Hermes routed it with its tool."""
    keep, _, route, inbox, _, _ = intake_setup(tmp_path)
    caption = "Nice! Make pictures 25% smaller and apply some postprocessing so they look like photos"
    assert keep(photo_reply(caption=caption)) is None
    assert json.loads(route({"post": APPROVAL_POST, "route": "patch", "text": caption}))["success"] is True
    assert [c["kind"] for c in commands(inbox)] == ["route"]
    saved = inbox / "media" / f"post-{APPROVAL_POST}" / "3527-1.telegram"
    assert json.loads(saved.read_text()) == {"fileId": "AgACbig", "bytes": 131746, "by": "1", "byName": "Dr. Boris", "text": caption}
    assert saved.stat().st_mode & 0o777 == 0o640


def test_a_reply_to_a_questions_post_keeps_its_image_for_the_answer(tmp_path):
    keep, _, _, inbox, _, _ = intake_setup(tmp_path)
    assert keep(photo_reply(message_id=3600, post=QUESTIONS_POST, caption="This but with closed cabin")) is None
    assert json.loads(notes(inbox, QUESTIONS_POST)["3600-1.telegram"])["text"] == "This but with closed cabin"


def test_the_replied_to_screenshot_is_never_kept_as_the_members_image(tmp_path):
    keep, send, _, inbox, _, _ = intake_setup(tmp_path)
    assert keep(photo_reply(photo=False, caption=None)) is None
    assert send("make the pictures smaller please", [cached_image(tmp_path)])["action"] == "rewrite"
    assert not (inbox / "media").exists()


def test_an_image_file_counts_and_a_pdf_does_not(tmp_path):
    keep, _, _, inbox, _, _ = intake_setup(tmp_path)
    keep(photo_reply(message_id=1, photo=False, document={"file_id": "BQAdoc", "mime_type": "image/png", "file_size": 900}))
    keep(photo_reply(message_id=2, photo=False, document={"file_id": "BQApdf", "mime_type": "application/pdf", "file_size": 900}))
    assert list(notes(inbox, APPROVAL_POST)) == ["1-1.telegram"]
    assert json.loads(notes(inbox, APPROVAL_POST)["1-1.telegram"])["fileId"] == "BQAdoc"


@pytest.mark.parametrize("message", [
    photo_reply(sender=99),
    photo_reply(chat=-200),
    photo_reply(post=4444),
    {**photo_reply(), "reply_to_message": None},
])
def test_only_a_members_reply_to_an_open_post_in_the_committee_chat_is_kept(tmp_path, message):
    keep, _, _, inbox, _, _ = intake_setup(tmp_path)
    assert keep(message) is None
    assert not (inbox / "media").exists()


def test_an_image_that_cannot_be_kept_is_noted_with_the_reason_and_never_stops_the_reply(tmp_path):
    keep, send, _, inbox, _, _ = intake_setup(tmp_path)
    huge = photo_reply(message_id=8)
    huge["photo"][-1]["file_size"] = readiness.MAX_BYTES + 1
    assert "byte limit" in keep(huge)
    assert notes(inbox, APPROVAL_POST) == {"8-1.skipped": f"it is over the {readiness.MAX_BYTES} byte limit"}
    assert send(f"redesign: {TEXT}") == {"action": "skip", "reason": "factory-redesign"}


def test_a_post_keeps_at_most_the_files_the_factory_reads(tmp_path):
    keep, _, _, inbox, _, _ = intake_setup(tmp_path)
    for message_id in range(1, readiness.MAX_FILES + 2):
        keep(photo_reply(message_id=message_id))
    kept = notes(inbox, APPROVAL_POST)
    assert len([name for name in kept if name.endswith(".telegram")]) == readiness.MAX_FILES
    assert kept[f"{readiness.MAX_FILES + 1}-1.skipped"] == f"the post already holds {readiness.MAX_FILES} files"
    keep(photo_reply(message_id=1))
    assert len(notes(inbox, APPROVAL_POST)) == readiness.MAX_FILES + 1


def test_a_folder_that_cannot_be_made_never_stops_the_reply(tmp_path):
    keep, _, _, inbox, _, _ = intake_setup(tmp_path)
    (inbox / "media").write_text("not a folder")
    assert keep(photo_reply()) is not None


def test_the_handler_logs_and_swallows_any_error(tmp_path, caplog):
    _, _, _, _, cfg, ready = intake_setup(tmp_path)
    broken = types.SimpleNamespace(message=types.SimpleNamespace(to_dict=lambda: (_ for _ in ()).throw(ValueError("bad update"))))
    asyncio.run(plugin.make_media_handler(cfg, ready)(broken, None))
    assert "could not keep the image" in caplog.text


def test_the_handler_keeps_the_image_of_a_live_update(tmp_path):
    _, _, _, inbox, cfg, ready = intake_setup(tmp_path)
    update = types.SimpleNamespace(message=types.SimpleNamespace(to_dict=lambda: photo_reply(caption="patch: flatter roof")))
    asyncio.run(plugin.make_media_handler(cfg, ready)(update, None))
    assert list(notes(inbox, APPROVAL_POST)) == ["3527-1.telegram"]


def test_factory_registers_the_image_handler_before_hermes_and_the_public_handlers(monkeypatch, tmp_path):
    added = []

    class Filter:
        def __init__(self, name):
            self.name = name

        def __and__(self, other):
            return Filter(f"({self.name} & {other.name})")

        def __or__(self, other):
            return Filter(f"({self.name} | {other.name})")

    filters = types.SimpleNamespace(
        UpdateType=types.SimpleNamespace(MESSAGE=Filter("message")), REPLY=Filter("reply"), PHOTO=Filter("photo"),
        Document=types.SimpleNamespace(IMAGE=Filter("image file")),
    )
    ext = types.SimpleNamespace(MessageHandler=lambda flt, callback: ("mh", flt.name, callback), filters=filters)
    monkeypatch.setitem(sys.modules, "telegram", types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "telegram.ext", ext)
    _, _, _, _, cfg, ready = intake_setup(tmp_path)
    plugin.make_media_factory(cfg, ready)(types.SimpleNamespace(add_handler=lambda handler, group: added.append((handler, group))), None)
    [((kind, flt, _), group)] = added
    assert (kind, flt, group) == ("mh", "((message & reply) & (photo | image file))", plugin.COMMITTEE_MEDIA_GROUP)
    assert plugin.COMMITTEE_MEDIA_GROUP < sys.modules["factory_plugin.public"].PUBLIC_GROUP < 0


def test_a_text_only_patch_queues(tmp_path):
    send, route, _, inbox = hook_setup(tmp_path)
    assert json.loads(route({"post": 55, "route": "redesign", "text": TEXT}))["success"] is True
    assert send(f"patch: {TEXT}") == {"action": "skip", "reason": "factory-patch"}
    assert sorted(c["kind"] for c in commands(inbox)) == ["patch", "route"]
    assert not (inbox / "media").exists()


def test_a_short_text_is_still_refused(tmp_path):
    send, route, adapter, inbox = hook_setup(tmp_path)
    assert "at least 3 words" in refusal_of(route({"post": 55, "route": "patch", "text": "nicer"}))
    assert send("redesign: nicer")["reason"] == "factory-not-ready"
    assert "at least 3 words" in adapter.sent[0]
    assert commands(inbox) == []


def test_an_answer_needs_no_word_count(tmp_path):
    _, route, _, inbox = hook_setup(tmp_path)
    assert json.loads(route({"post": 55, "route": "answer", "text": "Why?"}))["success"] is True
    assert len(commands(inbox)) == 1
