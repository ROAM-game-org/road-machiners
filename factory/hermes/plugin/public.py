import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple, Optional

log = logging.getLogger(__name__)

PUBLIC_GROUP = -1
PUBLIC_ALERT = "public-alert"
UPDATE_KINDS = ("message", "message_reaction", "message_reaction_count")


class Bot(NamedTuple):
    id: int
    username: str


def update_kind(raw: dict) -> Optional[str]:
    for kind in UPDATE_KINDS:
        if kind in raw:
            return kind
    return None


def update_chat(raw: dict) -> Optional[str]:
    kind = update_kind(raw)
    return None if kind is None else str(raw[kind]["chat"]["id"])


def public_chats(cfg) -> tuple:
    return (cfg.discussion,) if cfg.proposal_chat == cfg.chat else (cfg.discussion, cfg.proposal_chat)


def stops_hermes(raw: dict, cfg) -> bool:
    chat = update_chat(raw)
    if update_kind(raw) == "message":
        return chat in public_chats(cfg)
    return chat in (cfg.discussion, cfg.proposal_chat)


def iso_date(seconds: int) -> str:
    return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def emoji_of(reaction: dict) -> Optional[str]:
    return reaction["emoji"] if reaction.get("type") == "emoji" else None


def count_event(raw: dict) -> dict:
    body = raw["message_reaction_count"]
    counts = {}
    for entry in body.get("reactions", []):
        emoji = emoji_of(entry["type"])
        if emoji is not None:
            counts[emoji] = entry["total_count"]
    return {
        "updateId": raw["update_id"], "kind": "reaction-count", "chat": str(body["chat"]["id"]),
        "messageId": body["message_id"], "counts": counts,
    }


def reaction_event(raw: dict) -> Optional[dict]:
    body = raw["message_reaction"]
    if "user" not in body:
        return None
    emoji = [found for found in map(emoji_of, body.get("new_reaction", [])) if found is not None]
    return {
        "updateId": raw["update_id"], "kind": "reaction", "chat": str(body["chat"]["id"]),
        "messageId": body["message_id"], "user": str(body["user"]["id"]), "emoji": emoji,
    }


def forward_event(raw: dict, message: dict) -> dict:
    origin = message["forward_origin"]
    return {
        "updateId": raw["update_id"], "kind": "forward", "chat": str(message["chat"]["id"]),
        "messageId": message["message_id"], "channelChat": str(origin["chat"]["id"]),
        "channelMessageId": origin["message_id"],
    }


def author_of(message: dict) -> str:
    sender = message["from"]
    if sender.get("first_name"):
        return " ".join(part for part in (sender["first_name"], sender.get("last_name")) if part)
    return sender["username"]


def sender_of(message: dict) -> str:
    return str(message.get("sender_chat", message["from"])["id"])


def is_skipped(message: dict, text: Optional[str]) -> bool:
    sender = message.get("from") or {}
    if not text or not sender or sender.get("is_bot"):
        return True
    return "forward_origin" in message or "via_bot" in message or text.lstrip().startswith("/")


def mentions(message: dict, bot: Bot) -> bool:
    text = message.get("text") or message.get("caption") or ""
    if bot.username and f"@{bot.username}".lower() in text.lower():
        return True
    entities = (message.get("entities") or []) + (message.get("caption_entities") or [])
    return any(entity.get("type") == "text_mention" and entity.get("user", {}).get("id") == bot.id for entity in entities)


def is_addressed(message: dict, bot: Optional[Bot]) -> bool:
    if bot is None:
        return False
    replied = (message.get("reply_to_message") or {}).get("from") or {}
    return replied.get("id") == bot.id or mentions(message, bot)


CONTEXT_CHARS = 500


def reply_context(message: dict) -> Optional[str]:
    quoted = (message.get("quote") or {}).get("text")
    replied = message.get("reply_to_message") or {}
    context = quoted or replied.get("text") or replied.get("caption")
    return context[:CONTEXT_CHARS] if context else None


def comment_event(raw: dict, message: dict, standalone: bool, bot: Optional[Bot]) -> Optional[dict]:
    text = message.get("text") or message.get("caption")
    if is_skipped(message, text):
        return None
    reply = message.get("reply_to_message")
    thread = reply["message_id"] if reply else message.get("message_thread_id")
    if thread is None and not standalone:
        return None
    return {
        "updateId": raw["update_id"], "kind": "comment", "chat": str(message["chat"]["id"]),
        "messageId": message["message_id"], "threadId": thread, "author": author_of(message),
        "sender": sender_of(message), "text": text, "at": iso_date(message["date"]),
        "addressed": is_addressed(message, bot), "standalone": standalone, "context": reply_context(message),
    }


def is_channel_forward(message: dict) -> bool:
    return bool(message.get("is_automatic_forward")) and message.get("forward_origin", {}).get("type") == "channel"


def message_event(raw: dict, cfg, bot: Optional[Bot]) -> Optional[dict]:
    message = raw["message"]
    chat = str(message["chat"]["id"])
    if chat == cfg.discussion and is_channel_forward(message):
        return forward_event(raw, message)
    if chat in (cfg.discussion, cfg.proposal_chat):
        return comment_event(raw, message, chat in public_chats(cfg), bot)
    return None


def public_event(raw: dict, cfg, bot: Optional[Bot] = None) -> Optional[dict]:
    kind = update_kind(raw)
    if kind is None or update_chat(raw) not in (cfg.discussion, cfg.proposal_chat):
        return None
    if kind == "message":
        return message_event(raw, cfg, bot)
    if kind == "message_reaction_count":
        return count_event(raw)
    return reaction_event(raw)


def write_public_event(public_inbox: str, event: dict) -> Path:
    directory = Path(public_inbox)
    directory.mkdir(parents=True, exist_ok=True)
    final = directory / f"{event['updateId']}.json"
    temp = final.with_suffix(".json.tmp")
    temp.write_text(json.dumps(event))
    os.chmod(temp, 0o640)
    os.replace(temp, final)
    return final


def alert_path(cfg) -> Path:
    return Path(cfg.public_inbox).parent / PUBLIC_ALERT


INBOX_WRITE_REASON = "the plugin could not write a player vote or comment to the inbox"
CONFLICT_REASON = "Telegram updates queued during a polling restart were dropped, so votes or comments may be missing"
CONFLICT_MARKER = "Telegram polling restarted after conflict retry"


def raise_public_alert(cfg, now: datetime, reason: str = INBOX_WRITE_REASON) -> None:
    line = f"public updates: {reason} on {now.date().isoformat()}"
    path = alert_path(cfg)
    if path.is_file() and line in path.read_text().split("\n"):
        return
    with path.open("a") as alerts:
        alerts.write(f"{line}\n")


class ConflictRestartAlert(logging.Handler):
    def __init__(self, cfg) -> None:
        super().__init__(level=logging.INFO)
        self.cfg = cfg

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if CONFLICT_MARKER in record.getMessage():
                raise_public_alert(self.cfg, datetime.now(timezone.utc), CONFLICT_REASON)
        except Exception:
            self.handleError(record)


def watch_polling_conflicts(cfg) -> None:
    root = logging.getLogger()
    if not any(isinstance(handler, ConflictRestartAlert) for handler in root.handlers):
        root.addHandler(ConflictRestartAlert(cfg))


def handle_public_update(raw: dict, cfg, bot: Optional[Bot] = None) -> bool:
    stop = stops_hermes(raw, cfg)
    try:
        event = public_event(raw, cfg, bot)
        if event is not None:
            write_public_event(cfg.public_inbox, event)
    except Exception:
        log.exception("Factory could not hand public update %s to the inbox.", raw.get("update_id"))
        try:
            raise_public_alert(cfg, datetime.now(timezone.utc))
        except Exception:
            log.exception("Factory could not record the public inbox failure for the incident watch.")
    return stop


def make_public_handler(cfg):
    from telegram.ext import ApplicationHandlerStop

    async def on_update(update, context) -> None:
        bot = Bot(context.bot.id, context.bot.username or "")
        if handle_public_update(update.to_dict(), cfg, bot):
            raise ApplicationHandlerStop

    return on_update


def make_public_factory(cfg):
    def factory(native, adapter) -> None:
        from telegram.ext import MessageHandler, MessageReactionHandler, filters

        chats = [int(cfg.discussion), int(cfg.proposal_chat)]
        callback = make_public_handler(cfg)
        native.add_handler(MessageReactionHandler(callback, chat_id=chats), group=PUBLIC_GROUP)
        native.add_handler(MessageHandler(filters.UpdateType.MESSAGE & filters.Chat(chat_id=chats), callback), group=PUBLIC_GROUP)

    return factory
