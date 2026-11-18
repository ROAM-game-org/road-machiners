import logging
from datetime import datetime, timedelta

logger = logging.getLogger("factory.idle_reset")


def idle_limit(raw: str) -> timedelta:
    minutes = float(raw)
    if not minutes > 0:
        raise ValueError("Hermes idle reset minutes must be positive")
    return timedelta(minutes=minutes)


def is_idle(entry, limit: timedelta, now: datetime) -> bool:
    if getattr(entry, "active_turn_token", None):
        return False
    return now - entry.updated_at >= limit


def make_idle_reset(limit: timedelta, clock=datetime.now):
    def reset_if_idle(event, gateway, session_store) -> None:
        try:
            key = gateway._session_key_for_source(event.source)
            entry = session_store.lookup_by_session_key(key)
            if entry is not None and is_idle(entry, limit, clock()):
                session_store.reset_session(key)
                logger.info("idle reset of %s after %s", key, limit)
        except Exception:
            logger.warning("idle reset check failed; the chat continues its session", exc_info=True)

    return reset_if_idle
