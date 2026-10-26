"""What a patch or a redesign needs before it queues, and the member's Telegram images that come with a reply. No Hermes imports.

A patch or a redesign needs only text that names what to change. Images never gate it.
The plugin's own Telegram handler sees each committee message before Hermes does, busy or not. For a member's image on a reply
to an open approval or questions post it writes a `.telegram` note with the Telegram file id into the inbox's media folder under that post.
The tick downloads the bytes from Telegram when it hands the post's images to the agent, and checks each one itself.
An image the plugin cannot keep leaves a `.skipped` note with the reason, which the agent sees as not available.
Only the member's own image counts. The image of the message they reply to, like the approval post's screenshot, never does.
"""

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# The same limits as factory/src/media.ts. test_readiness.py compares them with that file.
MAX_FILES = 12
MAX_BYTES = 10 * 1024 * 1024
# The note of an image the tick downloads from Telegram. factory/src/reply-media.ts reads the same suffix.
TELEGRAM_SUFFIX = ".telegram"
log = logging.getLogger(__name__)


def post_media_dir(inbox: str, post: int) -> Path:
    """Where the images of the replies to one approval or questions post wait. factory/src/reply-media.ts reads the same path."""
    return Path(inbox) / "media" / f"post-{post}"


@dataclass(frozen=True)
class Readiness:
    min_words: int
    inbox: str

    def problems(self, text: str) -> list:
        """What a patch or a redesign still lacks. Empty means it queues."""
        if len(text.split()) < self.min_words:
            return [f"The text is too short to name what to change. Write at least {self.min_words} words and quote the member."]
        return []

    def keep_image(self, post: int, message: dict) -> Optional[str]:
        """Notes the member's own image on a reply to `post` for the tick. Never raises, since a lost image must not stop the reply.
        Returns the reason when the image was not kept, else None. A message with no image of its own keeps nothing."""
        found = own_image(message)
        if found is None:
            return None
        name = f"{message['message_id']}-1"
        try:
            folder = post_media_dir(self.inbox, post)
            folder.mkdir(parents=True, exist_ok=True)
            taken = len([p for p in folder.iterdir() if p.suffix not in (".tmp", ".skipped") and not p.name.startswith(name + ".")])
            reason = _refusal(found, taken)
            if reason is None:
                record = {**found, "by": str(message["from"]["id"]), "byName": _name_of(message["from"]), "text": message.get("caption")}
                _write(folder / f"{name}{TELEGRAM_SUFFIX}", json.dumps(record).encode())
                return None
            _write(folder / f"{name}.skipped", reason.encode())
        except (OSError, KeyError, TypeError, ValueError) as error:
            reason = str(error)
        log.warning("Factory skipped the image of message %s, a reply to post %s: %s", message.get("message_id"), post, reason)
        return reason


def own_image(message: dict) -> Optional[dict]:
    """The file id and size of the image the message itself carries: the largest photo size, or a file Telegram marks as an image."""
    photos = message.get("photo") or []
    if photos:
        best = max(photos, key=lambda size: size.get("width", 0) * size.get("height", 0))
        return {"fileId": best["file_id"], "bytes": best.get("file_size")}
    document = message.get("document") or {}
    if str(document.get("mime_type", "")).startswith("image/"):
        return {"fileId": document["file_id"], "bytes": document.get("file_size")}
    return None


def _refusal(found: dict, taken: int) -> Optional[str]:
    if taken >= MAX_FILES:
        return f"the post already holds {MAX_FILES} files"
    if isinstance(found["bytes"], int) and found["bytes"] > MAX_BYTES:
        return f"it is over the {MAX_BYTES} byte limit"
    return None


def _name_of(user: dict) -> Optional[str]:
    full = " ".join(part for part in (user.get("first_name"), user.get("last_name")) if part)
    return full or user.get("username") or None


def _write(path: Path, data: bytes) -> None:
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(data)
    os.chmod(temp, 0o640)
    os.replace(temp, path)


def refusal(problems: list) -> str:
    """The text Hermes or the member reads when a patch or a redesign is refused. Nothing was queued."""
    return "Nothing was queued:\n" + "\n".join(f"- {p}" for p in problems) + "\nFix the text, then route again."
