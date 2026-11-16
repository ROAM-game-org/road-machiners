import importlib.util
import json
import subprocess
from pathlib import Path

import pytest


def load_tools():
    path = Path(__file__).with_name("public_tools.py")
    spec = importlib.util.spec_from_file_location("factory_public_tools_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tools = load_tools()


def git(cwd, *args):
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def clone(tmp_path):
    repo = tmp_path / "repo"
    (repo / "game" / "docs").mkdir(parents=True)
    (repo / "game" / "docs" / "DESIGN.md").write_text("# Design\nBarrels rust in the Bowl.\nThe winch costs 40 scrap.\n")
    (repo / "CLAUDE.md").write_text("# ROAM\n")
    git(repo, "init", "-q", "-b", "main")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "main")
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    (repo / "game" / "docs" / "DESIGN.md").write_text("# Design\nBarrels rust in the Bowl.\nThe winch costs 35 scrap.\n")
    git(repo, "commit", "-q", "-am", "dev")
    git(repo, "update-ref", "refs/remotes/origin/dev", "HEAD")
    git(repo, "checkout", "-q", "--detach")
    return repo


def test_game_search_finds_text_on_main_or_dev(clone):
    found = tools.game_tools(clone)
    assert found["game_search"]({"pattern": "WINCH costs"}) == "game/docs/DESIGN.md:3:The winch costs 40 scrap.\n"
    assert found["game_search"]({"pattern": "winch", "branch": "dev", "path": "game/docs"}) == "game/docs/DESIGN.md:3:The winch costs 35 scrap.\n"
    assert found["game_search"]({"pattern": "minimap"}) == "No match."


def test_game_read_numbers_lines_lists_folders_and_pages(clone):
    read = tools.game_tools(clone)["game_read"]
    assert read({"path": "game/docs/DESIGN.md"}) == "1: # Design\n2: Barrels rust in the Bowl.\n3: The winch costs 40 scrap."
    assert read({"path": "game/docs/DESIGN.md", "start_line": 3, "branch": "dev"}) == "3: The winch costs 35 scrap."
    assert read({}) == "CLAUDE.md\ngame\n"
    assert read({"path": "/game/"}) == "docs\n"
    assert read({"path": "game/missing.md"}) == "No such path on main."


@pytest.mark.parametrize("args", [
    {"path": "../.env"}, {"path": "game/../../x"}, {"path": "-p"}, {"path": "./x"},
    {"path": "x", "branch": "factory/secret"}, {"path": "x", "branch": "HEAD"}, {"path": "x", "start_line": 0},
])
def test_game_read_refuses_paths_and_refs_outside_main_and_dev(clone, args):
    with pytest.raises(ValueError):
        tools.game_tools(clone)["game_read"](args)


def test_game_search_runs_only_git_reads(clone):
    calls = []
    found = tools.game_tools(clone, lambda args: calls.append(args) or subprocess.CompletedProcess(args, 1, "", ""))
    found["game_search"]({"pattern": "--output=/tmp/x"})
    found["game_read"]({"path": "CLAUDE.md"})
    assert [call[2:3] for call in calls] == [["grep"], ["cat-file"]]
    assert calls[0][-4:] == ["-e", "--output=/tmp/x", "origin/main", "--"]


def commit_id(repo, ref):
    return subprocess.run(["git", "rev-parse", ref], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def test_game_history_lists_commits_on_main_or_dev_by_path_and_message(clone):
    history = tools.game_tools(clone)["game_history"]
    assert [line.split(" ", 2)[2] for line in history({}).splitlines()] == ["main"]
    assert [line.split(" ", 2)[2] for line in history({"branch": "dev"}).splitlines()] == ["dev", "main"]
    assert [line.split(" ", 2)[2] for line in history({"branch": "dev", "path": "CLAUDE.md"}).splitlines()] == ["main"]
    assert [line.split(" ", 2)[2] for line in history({"branch": "dev", "query": "DEV"}).splitlines()] == ["dev"]
    assert history({"query": "dev"}) == "No commit."


def test_game_history_shows_a_commit_only_from_its_branch(clone):
    history = tools.game_tools(clone)["game_history"]
    dev = commit_id(clone, "origin/dev")
    shown = history({"branch": "dev", "commit": dev[:10]})
    assert shown.startswith(f"{dev} ") and "-The winch costs 40 scrap.\n+The winch costs 35 scrap." in shown
    assert history({"commit": dev}) == "No such commit on main."
    git(clone, "commit", "-q", "--allow-empty", "-m", "unpublished")
    assert history({"branch": "dev", "commit": commit_id(clone, "HEAD")}) == "No such commit on dev."


@pytest.mark.parametrize("args", [
    {"commit": "HEAD"}, {"commit": "--output=/tmp/x"}, {"commit": "abc"}, {"commit": "origin/main"}, {"commit": "a" * 41},
    {"path": "../x"}, {"path": "-p"}, {"branch": "factory/secret"},
])
def test_game_history_refuses_refs_options_and_paths(clone, args):
    with pytest.raises(ValueError):
        tools.game_tools(clone)["game_history"](args)


def test_game_history_passes_the_query_as_one_fixed_string(clone):
    calls = []
    history = tools.game_tools(clone, lambda args: calls.append(args) or subprocess.CompletedProcess(args, 0, "", ""))["game_history"]
    assert history({"query": "--output=/tmp/x"}) == "No commit."
    assert calls[0][2:3] == ["log"] and "--grep=--output=/tmp/x" in calls[0] and calls[0][-2:] == ["origin/main", "--"]


class FakeGh:
    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    def __call__(self, args):
        self.calls.append(args)
        answer = self.answers.get(args[4])
        return subprocess.CompletedProcess(args, 1 if answer is None else 0, json.dumps(answer), "")


ISSUE = {"number": 848, "title": "Barrels look flat", "state": "open", "labels": [{"name": "bug"}, {"name": "player-report"}], "created_at": "2026-11-14T18:02:00Z", "body": "> barrels look flat", "repository_url": "https://api.github.com/repos/o/r"}
ADHOC = {**ISSUE, "number": 900, "title": "Private member ask", "labels": [{"name": "adhoc"}]}


def test_issue_search_lists_public_issues_of_the_repo_only():
    gh = FakeGh({"search/issues": {"items": [ISSUE, ADHOC, {**ISSUE, "number": 5, "repository_url": "https://api.github.com/repos/x/y"}, {**ISSUE, "number": 849, "title": "Fix barrels", "pull_request": {}}]}})
    text = tools.issue_tools("o/r", gh)["issue_search"]({"query": "barrels repo:x/y"})
    assert text.startswith(tools.NOTE)
    assert text.endswith("#848 | issue | open | bug, player-report | Barrels look flat\n#849 | pull request | open | bug, player-report | Fix barrels")
    assert gh.calls == [["gh", "api", "--method", "GET", "search/issues", "-f", "q=barrels repo:x/y repo:o/r -label:adhoc", "-f", "per_page=20"]]


def test_issue_read_shows_an_issue_with_comments_and_hides_ad_hoc_work():
    gh = FakeGh({"repos/o/r/issues/848": ISSUE, "repos/o/r/issues/848/comments": [{"user": {"login": "roam-factory"}, "body": "Filed from the player chat."}], "repos/o/r/issues/900": ADHOC})
    read = tools.issue_tools("o/r", gh)["issue_read"]
    text = read({"number": 848})
    assert "# Barrels look flat\nstate: open\nlabels: bug, player-report" in text
    assert text.endswith("## Comment by roam-factory\n\nFiled from the player chat.")
    assert read({"number": 900}) == "No such issue or pull request."
    assert read({"number": 1}) == tools.UNAVAILABLE
    assert all(call[:4] == ["gh", "api", "--method", "GET"] for call in gh.calls)
    with pytest.raises(ValueError):
        read({"number": "848; gh issue close 848"})


def test_register_puts_every_tool_in_the_public_toolset(tmp_path):
    registered = []
    ctx = type("Ctx", (), {"register_tool": lambda self, **kw: registered.append(kw)})()
    tools.register_public_tools(ctx, clone=tmp_path, repo="o/r", chats=("-200",), session_env=lambda name: "")
    names = ["game_search", "game_read", "game_history", "issue_search", "issue_read", "player_messages", "issue_status", "file_issue", "add_to_issue", "route_build", "queue_answer_job"]
    assert {tool["name"]: tool["toolset"] for tool in registered} == dict.fromkeys(names, "factory_public")
    assert all(tool["schema"]["name"] == tool["name"] for tool in registered)
    assert all("chat" not in json.dumps(tool["schema"]["parameters"]) and "by" not in tool["schema"]["parameters"]["properties"] for tool in registered)


class FakeFactory:
    def __init__(self, stdout='{"ok": true}', code=0, timeout=False):
        self.calls, self.stdout, self.code, self.timeout = [], stdout, code, timeout

    def __call__(self, args, timeout=None):
        self.calls.append((args, timeout))
        if self.timeout:
            raise subprocess.TimeoutExpired(args, timeout)
        return subprocess.CompletedProcess(args, self.code, self.stdout, "")


def session(chat="-200", user="42"):
    return {"HERMES_SESSION_CHAT_ID": chat, "HERMES_SESSION_USER_ID": user}.get


def test_player_tools_act_for_the_session_chat_and_user_never_for_the_model():
    factory = FakeFactory('{"filed": "now", "issue": 601}')
    handlers = tools.player_tools(("-200", "-300"), session(), factory)
    assert handlers["file_issue"]({"message": 30, "kind": "bug", "chat": "-100", "by": "1"}) == '{"filed": "now", "issue": 601}'
    handlers["add_to_issue"]({"message": 31, "issue": 568, "kind": "feedback"})
    handlers["route_build"]({"message": 32, "route": "patch"})
    handlers["queue_answer_job"]({"message": 33, "language": "ru"})
    handlers["issue_status"]({"issue": 568})
    handlers["player_messages"]({})
    base = ["factory", "player"]
    assert [call for call, _ in factory.calls] == [
        [*base, "file", "--chat", "-200", "--by", "42", "--message", "30", "--kind", "bug"],
        [*base, "add", "--chat", "-200", "--by", "42", "--message", "31", "--kind", "feedback", "--issue", "568"],
        [*base, "route", "--chat", "-200", "--by", "42", "--message", "32", "--route", "patch"],
        [*base, "investigate", "--chat", "-200", "--by", "42", "--message", "33", "--language", "ru"],
        [*base, "status", "--chat", "-200", "--by", "42", "--issue", "568"],
        [*base, "messages", "--chat", "-200", "--by", "42"],
    ]
    assert {timeout for _, timeout in factory.calls} == {tools.PLAYER_TIMEOUT_SECONDS}


@pytest.mark.parametrize("chat,user", [("-100", "42"), ("", "42"), ("-200", ""), ("-200", "hermes")])
def test_player_tools_refuse_outside_a_players_message_in_the_player_chat(chat, user):
    factory = FakeFactory()
    handlers = tools.player_tools(("-200",), session(chat, user), factory)
    for name, args in (("file_issue", {"message": 1, "kind": "bug"}), ("player_messages", {}), ("issue_status", {"issue": 1})):
        assert json.loads(handlers[name](args)) == {"error": tools.NOT_PUBLIC}
    assert factory.calls == []


@pytest.mark.parametrize("name,args", [
    ("file_issue", {"message": 1, "kind": "approve"}), ("file_issue", {"message": "1; rm -rf /", "kind": "bug"}),
    ("file_issue", {"message": True, "kind": "bug"}), ("add_to_issue", {"message": 1, "issue": -4, "kind": "bug"}),
    ("route_build", {"message": 1, "route": "merge"}), ("queue_answer_job", {"message": 1, "language": "de"}),
    ("issue_status", {"issue": "568"}),
])
def test_player_tools_refuse_bad_arguments_before_the_factory_runs(name, args):
    factory = FakeFactory()
    with pytest.raises(ValueError):
        tools.player_tools(("-200",), session(), factory)[name](args)
    assert factory.calls == []


def test_player_tools_say_the_outcome_is_unknown_when_the_factory_fails_or_times_out():
    for factory in (FakeFactory(code=1), FakeFactory(timeout=True)):
        answer = json.loads(tools.player_tools(("-200",), session(), factory)["file_issue"]({"message": 1, "kind": "bug"}))
        assert answer == {"error": tools.NO_ANSWER}
        assert "player_messages" in answer["error"]
