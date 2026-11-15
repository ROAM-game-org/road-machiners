"""Keeps TELEGRAM_ALLOWED_USERS in the Hermes .env equal to the committee, admits every sender in the committee and player chats, and copies the factory values Hermes's shell needs.

Every person's message in a player chat reaches Hermes, tagged or not, so the player chats are free-response chats.
The committee chat still needs a tag or a reply, as require_mention in config.yaml says.

The supervised gateway reads its env from $HERMES_HOME/.env, not from the start script.
So the start script runs this file before the gateway starts, and the plugin calls
write_allowlist() before it restarts the gateway after a committee change.
Hermes passes the PASSED keys on to its shell and scripts, as terminal.env_passthrough in config.yaml names them.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

KEY = "TELEGRAM_ALLOWED_USERS"
PASSED = ("FACTORY_REPO", "GH_CONFIG_DIR")
GROUP_CHAT_KEY = "TELEGRAM_GROUP_ALLOWED_CHATS"
FREE_RESPONSE_KEY = "TELEGRAM_FREE_RESPONSE_CHATS"
COMMITTEE_CHAT_KEY = "FACTORY_COMMITTEE_CHAT"
PUBLIC_CHAT_KEYS = ("FACTORY_PUBLIC_DISCUSSION", "FACTORY_PROPOSAL_CHAT")


def with_allowlist(text: str, ids) -> str:
    """Returns the .env text with the allow list line replaced, keeping every other line."""
    if not ids or not all(str(i).isdigit() for i in ids):
        raise ValueError("The committee has no valid Telegram ids.")
    kept = [line for line in text.splitlines() if not line.startswith(f"{KEY}=")]
    return "\n".join([*kept, f"{KEY}={','.join(sorted(str(i) for i in ids))}"]) + "\n"


def with_values(text: str, values: dict) -> str:
    """Returns the .env text with a line per value, replacing old lines of those keys."""
    kept = [line for line in text.splitlines() if line.split("=", 1)[0] not in values]
    return "\n".join([*kept, *(f"{key}={value}" for key, value in values.items())]) + "\n"


def _replace(env_path: Path, text: str) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=env_path.parent, prefix=".env.")
    with os.fdopen(descriptor, "w") as stream:
        stream.write(text)
    os.chmod(temporary, 0o600)
    os.replace(temporary, env_path)


def write_allowlist(env_path: Path, ids) -> None:
    current = env_path.read_text() if env_path.exists() else ""
    _replace(env_path, with_allowlist(current, ids))


def write_passed(env_path: Path, environ) -> None:
    """Copies the PASSED keys from the container env. A missing key stops the start."""
    missing = [key for key in PASSED if not environ.get(key)]
    if missing:
        raise KeyError(f"The Hermes container env lacks {', '.join(missing)}.")
    current = env_path.read_text() if env_path.exists() else ""
    _replace(env_path, with_values(current, {key: environ[key] for key in PASSED}))


def chat_id(environ, key: str) -> str:
    chat = environ.get(key, "")
    if not chat.lstrip("-").isdigit():
        raise KeyError(f"The Hermes container env lacks a numeric {key}.")
    return chat


def write_group_chat(env_path: Path, environ) -> None:
    """Admits every sender in the committee chat and the player chats, and lets every player chat message through without a tag.
    A missing or non-numeric chat id stops the start."""
    committee = chat_id(environ, COMMITTEE_CHAT_KEY)
    players = list(dict.fromkeys(chat_id(environ, key) for key in PUBLIC_CHAT_KEYS))
    admitted = list(dict.fromkeys([committee, *players]))
    free = [chat for chat in players if chat != committee]
    current = env_path.read_text() if env_path.exists() else ""
    _replace(env_path, with_values(current, {GROUP_CHAT_KEY: ",".join(admitted), FREE_RESPONSE_KEY: ",".join(free)}))


def main() -> None:
    sys.path.insert(0, str(Path(__file__).parent))
    from committee import Committee

    committee = Committee(
        os.environ["FACTORY_COMMITTEE_DIR"],
        os.environ["FACTORY_COMMITTEE_BOOTSTRAP"],
        os.environ["FACTORY_COMMITTEE_BOOTSTRAP_GITHUB"],
    )
    committee.seed()
    env_path = Path(os.environ["HERMES_HOME"]) / ".env"
    write_allowlist(env_path, committee.ids())
    write_passed(env_path, os.environ)
    write_group_chat(env_path, os.environ)


if __name__ == "__main__":
    main()
