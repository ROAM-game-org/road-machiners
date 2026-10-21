"""Runs factory-reboot.sh and factory-boot-check.sh against a temp factory root.

Shims on PATH stand in for sudo, npm, systemctl, docker, curl, grub-editenv, id, ps and sleep, and log each call to shim.log.
The npm shim plays the factory CLI: `pause` writes the pause file the way the CLI does, and `resume` removes it.
Each shim reads its answers from files in the shim folder, so a test changes one answer by writing one file.
"""

import json
import os
import subprocess
import time
from pathlib import Path

FILES = Path(__file__).parent.parent / "files"
REBOOT = FILES / "factory-reboot.sh"
BOOT_CHECK = FILES / "factory-boot-check.sh"

SHIMS = {
    "sudo": '''#!/bin/bash
while [ "${1:-}" = -u ] || [ "${1:-}" = -H ]; do
  if [ "$1" = -u ]; then shift 2; else shift; fi
done
exec "$@"
''',
    "npm": '''#!/bin/bash
echo "factory ${*:5}" >> "$SHIM_LOG"
home="$PWD/../../home"
case "$5" in
  pause) printf '{"kind":"factory","note":"%s","by":"factory","at":"2026-10-21T04:00:00.000Z"}\\n' "$6" > "$home/paused" ;;
  resume) rm "$home/paused" ;;
esac
''',
    "systemctl": '''#!/bin/bash
echo "systemctl $*" >> "$SHIM_LOG"
case "$1" in
  is-active) [ -f "$SHIM_DIR/active-$3" ] ;;
  is-enabled) [ -f "$SHIM_DIR/enabled-$3" ] ;;
  show) cat "$SHIM_DIR/show-$4" ;;
  reboot) exit 0 ;;
esac
''',
    "docker": '''#!/bin/bash
[ -f "$SHIM_DIR/running-$4" ] && echo true || exit 1
''',
    "curl": '''#!/bin/bash
[ ! -f "$SHIM_DIR/curl-hangs" ] || /bin/sleep 2
cat "$SHIM_DIR/http-code"
''',
    "grub-editenv": '''#!/bin/bash
cat "$SHIM_DIR/grubenv"
''',
    "id": "#!/bin/bash\necho 1001\n",
    "ps": "#!/bin/bash\necho '  42 bash -c npm test'\n",
    "sleep": '#!/bin/bash\necho "sleep $*" >> "$SHIM_LOG"\n[ ! -f "$SHIM_DIR/drain-ends" ] || echo \'{"jobs": []}\' > "$SHIM_DIR/../root/home/state/state.json"\n',
    "chown": "#!/bin/bash\nexit 0\n",
}

UNITS = ["roam-factory-dashboard.service", "roam-factory-errors.service", "roam-factory-tick.timer", "roam-factory-update.timer"]
CONTAINERS = ["factory-hermes", "factory-caddy", "factory-tunnel"]


class Host:
    def __init__(self, tmp_path: Path):
        self.root = tmp_path / "root"
        self.home = self.root / "home"
        (self.home / "state").mkdir(parents=True)
        (self.root / "code" / "factory").mkdir(parents=True)
        self.shims = tmp_path / "shims"
        self.shims.mkdir()
        for name, text in SHIMS.items():
            (self.shims / name).write_text(text)
            (self.shims / name).chmod(0o755)
        self.log = tmp_path / "shim.log"
        self.log.write_text("")
        self.jobs([])
        self.answer("grubenv", "# GRUB Environment Block\n")
        self.env = {**os.environ, "PATH": f"{self.shims}:{os.environ['PATH']}", "SHIM_LOG": str(self.log), "SHIM_DIR": str(self.shims)}

    def answer(self, name: str, text: str = "") -> None:
        (self.shims / name).write_text(text)

    def jobs(self, jobs: list[dict]) -> None:
        (self.home / "state" / "state.json").write_text(json.dumps({"jobs": jobs}))

    def healthy(self) -> None:
        for unit in UNITS:
            self.answer(f"enabled-{unit}")
            self.answer(f"active-{unit}")
        for name in CONTAINERS:
            self.answer(f"running-{name}")
        self.answer("http-code", "200")
        self.answer("show-Result", "success\n")
        self.answer("show-ExecMainExitTimestampMonotonic", "123456\n")

    def run(self, script: Path, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["bash", str(script), str(self.root), "factory", *args], env=self.env, capture_output=True, text=True)

    def calls(self) -> list[str]:
        return self.log.read_text().splitlines()


def test_reboot_pauses_and_reboots_at_once_when_the_factory_is_idle(tmp_path):
    host = Host(tmp_path)
    result = host.run(REBOOT, "50")
    assert result.returncode == 0, result.stderr
    assert host.calls() == ["factory pause planned reboot", "systemctl is-active --quiet user-1001.slice", "systemctl is-active --quiet user-1001.slice", "systemctl reboot"]
    assert json.loads((host.home / "paused").read_text())["note"] == "planned reboot"


def test_reboot_waits_for_running_jobs_and_reboots_once_they_end(tmp_path):
    host = Host(tmp_path)
    host.jobs([{"stage": "merge", "issue": None}])
    host.answer("drain-ends")
    result = host.run(REBOOT, "50")
    assert result.returncode == 0, result.stderr
    assert host.calls().count("sleep 60") == 1
    assert host.calls()[-1] == "systemctl reboot"
    assert "cutting" not in result.stdout


def test_reboot_after_the_drain_limit_cuts_the_running_jobs_and_logs_them(tmp_path):
    host = Host(tmp_path)
    host.jobs([{"stage": "verify", "issue": 873}])
    host.answer("active-user-1001.slice")
    result = host.run(REBOOT, "3")
    assert result.returncode == 0, result.stderr
    assert host.calls().count("sleep 60") == 3
    assert host.calls()[-1] == "systemctl reboot"
    assert "cutting running jobs: verify #873" in result.stdout
    assert "cutting a factory user session:   42 bash -c npm test" in result.stdout


def test_reboot_skips_and_keeps_a_pause_it_did_not_write(tmp_path):
    host = Host(tmp_path)
    (host.home / "paused").write_text('{"kind":"member","note":"Hermes fixing #5"}\n')
    result = host.run(REBOOT, "50")
    assert result.returncode == 0, result.stderr
    assert host.calls() == []
    assert "skipped: the factory is already paused" in result.stdout
    assert "Hermes fixing #5" in (host.home / "paused").read_text()


def test_reboot_skips_when_grub_would_boot_another_system_once(tmp_path):
    host = Host(tmp_path)
    host.answer("grubenv", "next_entry=Windows Boot Manager\n")
    result = host.run(REBOOT, "50")
    assert result.returncode == 0, result.stderr
    assert host.calls() == []
    assert not (host.home / "paused").exists()


def test_boot_check_lifts_the_planned_reboot_pause_and_clears_an_old_failure(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    (host.home / "paused").write_text('{"kind":"factory","note":"planned reboot","by":"factory","at":"x"}\n')
    (host.home / "boot-failed").write_text("old\n")
    result = host.run(BOOT_CHECK, "15", "https://example.org")
    assert result.returncode == 0, result.stderr
    assert not (host.home / "paused").exists()
    assert not (host.home / "boot-failed").exists()
    assert "factory resume" in host.calls()
    assert "every service works" in result.stdout


def test_boot_check_keeps_any_other_pause(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    (host.home / "paused").write_text('{"kind":"factory","note":"disk full","by":"hermes","at":"x"}\n')
    result = host.run(BOOT_CHECK, "15", "https://example.org")
    assert result.returncode == 0, result.stderr
    assert (host.home / "paused").exists()
    assert "factory resume" not in host.calls()


def test_boot_check_writes_every_failed_check_when_the_dashboard_stays_down(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    (host.shims / "active-roam-factory-dashboard.service").unlink()
    host.answer("http-code", "502")
    host.answer("show-ExecMainExitTimestampMonotonic", "0\n")
    result = host.run(BOOT_CHECK, "0", "https://example.org")
    assert result.returncode == 1
    assert (host.home / "boot-failed").read_text().splitlines()[1:] == [
        "roam-factory-dashboard.service is not active",
        "https://example.org/factory/ answers 502, not 200",
        "no tick has finished with success since boot, last result success",
    ]


def test_boot_check_ends_on_clock_time_when_each_round_is_slow(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    host.answer("curl-hangs")
    host.answer("http-code", "000")
    started = time.monotonic()
    result = host.run(BOOT_CHECK, "3", "https://example.org")
    assert result.returncode == 1
    assert time.monotonic() - started < 10
    assert "answers 000, not 200" in (host.home / "boot-failed").read_text()


def test_boot_check_reports_a_pause_it_could_not_lift(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    (host.home / "paused").write_text('{"kind":"factory","note":"planned reboot","by":"factory","at":"x"}\n')
    host.answer("npm", "#!/bin/bash\necho 'state file is broken' >&2\nexit 1\n")
    (host.shims / "npm").chmod(0o755)
    result = host.run(BOOT_CHECK, "0", "https://example.org")
    assert result.returncode == 1
    assert "could not lift the planned reboot pause: state file is broken" in (host.home / "boot-failed").read_text()


def test_reboot_does_not_reboot_when_it_cannot_read_the_jobs_and_lifts_its_pause(tmp_path):
    host = Host(tmp_path)
    (host.home / "state" / "state.json").write_text("{broken")
    result = host.run(REBOOT, "50")
    assert result.returncode != 0
    assert "systemctl reboot" not in host.calls()
    assert "failed at line" in result.stdout
    assert "factory resume" in host.calls()
    assert not (host.home / "paused").exists()


def test_reboot_lifts_its_pause_when_the_reboot_call_fails(tmp_path):
    host = Host(tmp_path)
    host.answer("systemctl", '#!/bin/bash\necho "systemctl $*" >> "$SHIM_LOG"\n[ "$1" != reboot ] || exit 1\n[ "$1" != is-active ]\n')
    (host.shims / "systemctl").chmod(0o755)
    result = host.run(REBOOT, "50")
    assert result.returncode != 0
    assert not (host.home / "paused").exists()


def test_boot_check_skips_a_unit_that_is_not_installed(tmp_path):
    host = Host(tmp_path)
    host.healthy()
    (host.shims / "enabled-roam-factory-errors.service").unlink()
    (host.shims / "active-roam-factory-errors.service").unlink()
    result = host.run(BOOT_CHECK, "15", "https://example.org")
    assert result.returncode == 0, result.stderr
