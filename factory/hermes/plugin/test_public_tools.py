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


def test_register_puts_every_tool_in_the_public_toolset_and_no_write_tool(tmp_path):
    registered = []
    tools.register_public_tools(type("Ctx", (), {"register_tool": lambda self, **kw: registered.append(kw)})(), clone=tmp_path, repo="o/r")
    assert {tool["name"]: tool["toolset"] for tool in registered} == dict.fromkeys(["game_search", "game_read", "issue_search", "issue_read"], "factory_public")
    assert all(tool["schema"]["name"] == tool["name"] for tool in registered)
