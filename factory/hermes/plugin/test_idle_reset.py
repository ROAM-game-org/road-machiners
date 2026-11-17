import importlib.util
import sys
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location("factory_idle_reset", Path(__file__).parent / "idle_reset.py")
idle_reset = importlib.util.module_from_spec(spec)
sys.modules["factory_idle_reset"] = idle_reset
spec.loader.exec_module(idle_reset)

NOW = datetime(2026, 11, 16, 23, 10)
HOUR = timedelta(minutes=60)


class Store:
    def __init__(self, entry):
        self.entry = entry
        self.resets = []

    def lookup_by_session_key(self, key):
        return self.entry

    def reset_session(self, key):
        self.resets.append(key)


class Gateway:
    def _session_key_for_source(self, source):
        return f"telegram:{source.chat_id}"


def entry(minutes_ago, turn=None):
    return SimpleNamespace(updated_at=NOW - timedelta(minutes=minutes_ago), active_turn_token=turn)


def dispatch(store, limit=HOUR):
    event = SimpleNamespace(source=SimpleNamespace(chat_id="-100"))
    assert idle_reset.make_idle_reset(limit, clock=lambda: NOW)(event, Gateway(), store) is None
    return store.resets


def test_resets_a_chat_idle_past_the_limit():
    assert dispatch(Store(entry(61))) == ["telegram:-100"]


def test_keeps_a_chat_active_within_the_limit():
    assert dispatch(Store(entry(59))) == []


def test_a_long_turn_restarts_the_clock_when_it_ends():
    member_wrote_at = NOW - timedelta(minutes=150)
    turn_ended = SimpleNamespace(updated_at=member_wrote_at + timedelta(minutes=110), active_turn_token=None)
    assert dispatch(Store(turn_ended)) == []


def test_never_resets_a_chat_with_a_turn_in_flight():
    assert dispatch(Store(entry(600, turn="turn-1"))) == []


def test_a_new_chat_has_nothing_to_reset():
    assert dispatch(Store(None)) == []


def test_a_failed_check_lets_the_message_through(caplog):
    class Broken(Store):
        def reset_session(self, key):
            raise RuntimeError("db locked")

    assert dispatch(Broken(entry(61))) == []
    assert "idle reset check failed" in caplog.text


@pytest.mark.parametrize("raw", ["0", "-5", "nan"])
def test_limit_must_be_positive(raw):
    with pytest.raises(ValueError):
        idle_reset.idle_limit(raw)


def test_limit_reads_minutes():
    assert idle_reset.idle_limit("60") == HOUR
