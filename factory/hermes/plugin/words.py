import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional

WINDOW_SECONDS = 30 * 60
MAX_WORDS = 8
MAX_KEPT = 500


@dataclass(frozen=True)
class Message:
    chat: str
    user: str
    message_id: int
    at: float
    text: str


class MemberWords:
    def __init__(self, clock=time.time):
        self._clock = clock
        self._messages: deque = deque(maxlen=MAX_KEPT)
        self._lock = threading.Lock()

    def record(self, chat, user, message_id, text) -> None:
        text = (text or "").strip()
        if not text or not str(message_id).isdigit():
            return
        with self._lock:
            self._messages.append(Message(str(chat), str(user), int(message_id), self._clock(), text))

    def recent(self, chat, user, message_id: int) -> list:
        with self._lock:
            mine = [item for item in self._messages if item.chat == str(chat) and item.user == str(user)]
        last = next((item for item in reversed(mine) if item.message_id == message_id), None)
        if last is None:
            return []
        picked = [item for item in mine if item.message_id <= message_id and last.at - item.at <= WINDOW_SECONDS][-MAX_WORDS:]
        return [{"messageId": item.message_id, "at": _iso(item.at), "text": item.text} for item in picked]


def _iso(seconds: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


def words_field(words: Optional[list]) -> dict:
    return {"words": words} if words else {}
