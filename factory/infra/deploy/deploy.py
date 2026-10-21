"""Set up the game factory: clone main once, push the server-only env file, build the agent and proxy images, install the tick, update and planned reboot timers, the boot check and the login slice cap, start Hermes and Caddy.

Run after provision.py. Re-run for a new secret or an infra change. It never sends code: factory-update deploys each new main from GitHub.
"""

# pyright: reportMissingImports=false
import shlex
from pathlib import Path
from io import StringIO

from pyinfra.operations import files, server, systemd

from factory_infra import CODE_DIR, FACTORY_ENV, FACTORY_ROOT, FACTORY_UID, FACTORY_USER, HERMES_DIR, HOME_DIR, INFRA_DIR, REPO_DIR, read_factory_env, settings

FILES = INFRA_DIR / "files"
factory_env = read_factory_env(settings.factory_env_file)
image = factory_env["FACTORY_IMAGE"]
tick_minutes = factory_env["FACTORY_TICK_MINUTES"]
# ITCH_TARGET is "user/game", and its page is https://user.itch.io/game. The bare domain redirects there.
itch_user, itch_game = factory_env["ITCH_TARGET"].split("/")
itch_url = f"https://{itch_user}.itch.io/{itch_game}"
settings_path = f"{CODE_DIR}/factory/settings.env"
as_factory = {"_sudo": True, "_sudo_user": FACTORY_USER}
UPDATE_SCRIPT = f"{FACTORY_ROOT}/factory-update.sh"
LAYOUT_SCRIPT = f"{FACTORY_ROOT}/factory-layout.sh"
# The caddy stack's compose file names this path for the tunnel's env.
TUNNEL_ENV = f"{FACTORY_ROOT}/tunnel.env"
UPDATE_MINUTES = 2
GITHUB_APP_KEY = f"{FACTORY_ROOT}/github-app.pem"
# The factory home, so Hermes reads the token through its mount of the home.
GITHUB_TOKEN_FILE = f"{HOME_DIR}/github-token"
TOKEN_RENEW_MINUTES = 30

# The repo dir is the git clone of GitHub's main. A server that still has a real code folder keeps it, and factory-layout.sh moves it to the repo dir.
repo_url = f"https://github.com/{factory_env['FACTORY_REPO']}.git"
server.shell(
    name="Clone main into the repo dir once",
    commands=[
        f"test -d {REPO_DIR}/.git || test -d {CODE_DIR}/.git || {{ mkdir -p {REPO_DIR} && git clone -q {repo_url} {REPO_DIR}; }}",
    ],
    **as_factory,
)

files.put(
    name="Push the layout script",
    src=str(FILES / "factory-layout.sh"),
    dest=LAYOUT_SCRIPT,
    mode="755",
    _sudo=True,
)
# It makes the first release, the links and the migration of an older server. It runs before the env push, so a migration finds the old .env in the code folder.
server.shell(
    name="Code folders: repo, releases and the code link",
    commands=[f"timeout 1800 {LAYOUT_SCRIPT} {FACTORY_ROOT} {FACTORY_USER}"],
    _sudo=True,
)

# The factory acts on GitHub as the GitHub App. The App key and the token file join the server-only env.
factory_env_text = Path(settings.factory_env_file).read_text().rstrip("\n") + f"\nFACTORY_GITHUB_APP_KEY={GITHUB_APP_KEY}\nFACTORY_GITHUB_TOKEN_FILE={GITHUB_TOKEN_FILE}\n"
files.put(
    name="Push the server-only factory env with the GitHub App paths",
    src=StringIO(factory_env_text),
    dest=FACTORY_ENV,
    user=FACTORY_USER,
    group=FACTORY_USER,
    mode="600",
    add_deploy_dir=False,
    _sudo=True,
)
files.put(
    name="Push the GitHub App private key",
    src=str(INFRA_DIR / settings.factory_gh_app_key_file),
    dest=GITHUB_APP_KEY,
    user=FACTORY_USER,
    group=FACTORY_USER,
    mode="600",
    _sudo=True,
)

# App tokens last an hour, so a timer renews the token file, and the gh wrapper reads it on every call of the factory user.
files.template(
    name="gh wrapper that reads the App token",
    src=str(FILES / "gh.j2"),
    dest="/usr/local/bin/gh",
    mode="755",
    factory_uid=FACTORY_UID,
    token_file=GITHUB_TOKEN_FILE,
    _sudo=True,
)
files.template(
    name="token renewal service unit",
    src=str(FILES / "roam-factory-github-token.service.j2"),
    dest="/etc/systemd/system/roam-factory-github-token.service",
    mode="644",
    service_user=FACTORY_USER,
    code_dir=CODE_DIR,
    home_dir=HOME_DIR,
    _sudo=True,
)
files.template(
    name="token renewal timer unit",
    src=str(FILES / "roam-factory-github-token.timer.j2"),
    dest="/etc/systemd/system/roam-factory-github-token.timer",
    mode="644",
    renew_minutes=TOKEN_RENEW_MINUTES,
    _sudo=True,
)
systemd.service(
    name="token renewal timer enabled",
    service="roam-factory-github-token.timer",
    running=True,
    enabled=True,
    daemon_reload=True,
    _sudo=True,
)
server.shell(
    name="Make the first App token now",
    commands=["timeout 120 systemctl start roam-factory-github-token.service"],
    _sudo=True,
)

# git asks the wrapper for credentials, so pushes use the current App token too.
server.shell(
    name="git credential helper through the gh wrapper",
    commands=[
        "git config --global --replace-all credential.https://github.com.helper ''",
        "git config --global --add credential.https://github.com.helper '!/usr/local/bin/gh auth git-credential'",
    ],
    **as_factory,
)

server.shell(
    name="Build the agent image",
    commands=[f"cd {CODE_DIR} && timeout 1800 docker build -t {image} factory/docker"],
    **as_factory,
)

# The running proxy stays, so a running agent keeps its way out. The next agent run replaces a proxy from an older image.
server.shell(
    name="Build the egress proxy image",
    commands=[f"cd {CODE_DIR} && timeout 600 docker build -t {image}-proxy factory/docker/proxy"],
    **as_factory,
)

files.template(
    name="tick service unit",
    src=str(FILES / "roam-factory-tick.service.j2"),
    dest="/etc/systemd/system/roam-factory-tick.service",
    mode="644",
    service_user=FACTORY_USER,
    code_dir=CODE_DIR,
    home_dir=HOME_DIR,
    _sudo=True,
)
files.template(
    name="tick timer unit",
    src=str(FILES / "roam-factory-tick.timer.j2"),
    dest="/etc/systemd/system/roam-factory-tick.timer",
    mode="644",
    tick_minutes=tick_minutes,
    _sudo=True,
)
systemd.service(
    name="tick timer enabled",
    service="roam-factory-tick.timer",
    running=True,
    enabled=True,
    daemon_reload=True,
    _sudo=True,
)

# Hermes runs factory steps on the server through ssh as the factory user, with the same rights as the tick.
# Its key lives in the Hermes home, which only the factory user reads.
hermes_key = f"{HERMES_DIR}/.ssh/id_ed25519"
authorized = f"/home/{FACTORY_USER}/.ssh/authorized_keys"
server.shell(
    name="Hermes ssh key, authorized for the factory user",
    commands=[
        f"mkdir -p -m 700 {HERMES_DIR}/.ssh /home/{FACTORY_USER}/.ssh",
        f"test -f {hermes_key} || ssh-keygen -q -t ed25519 -N '' -C factory-hermes -f {hermes_key}",
        f"grep -qxF \"$(cat {hermes_key}.pub)\" {authorized} 2>/dev/null || cat {hermes_key}.pub >> {authorized}",
        f"chmod 600 {authorized}",
    ],
    **as_factory,
)

# Hermes runs one-off Claude Code jobs on the server with factory/hermes/claude-run, for work no factory step covers.
server.shell(
    name="Claude Code for the factory user",
    commands=[f"test -x /home/{FACTORY_USER}/.local/bin/claude || (curl -fsSL https://claude.ai/install.sh | timeout 300 bash)"],
    **as_factory,
)

# Hermes takes its paths from env. The server layout differs from the Mac default.
# It mounts the factory root at the same path, so the code link resolves inside its container.
hermes_env = f"FACTORY_HERMES_DIR={HERMES_DIR} FACTORY_UID={FACTORY_UID} FACTORY_CODE_SOURCE={FACTORY_ROOT} FACTORY_CODE_TARGET={FACTORY_ROOT}"
server.shell(
    name="compose up: hermes",
    commands=[
        f"cd -P {CODE_DIR} && {hermes_env} timeout 900 docker compose -f factory/hermes/compose.yaml --env-file {settings_path} --env-file {FACTORY_ENV} "
        "up -d --build --remove-orphans --wait --wait-timeout 180",
    ],
    _sudo=True,
)

# The script lives outside the releases, so a deploy never rewrites it while it runs.
files.put(
    name="Push the update script",
    src=str(FILES / "factory-update.sh"),
    dest=UPDATE_SCRIPT,
    mode="755",
    _sudo=True,
)
# The update unit runs this hook after every deploy. It exits at once on a host with no dashboard.
files.put(
    name="Push the dashboard restart hook",
    src=str(FILES / "factory-dashboard-restart.sh"),
    dest=f"{FACTORY_ROOT}/factory-dashboard-restart.sh",
    mode="755",
    _sudo=True,
)
files.template(
    name="update service unit",
    src=str(FILES / "roam-factory-update.service.j2"),
    dest="/etc/systemd/system/roam-factory-update.service",
    mode="644",
    service_user=FACTORY_USER,
    script=UPDATE_SCRIPT,
    factory_root=FACTORY_ROOT,
    home_dir=HOME_DIR,
    _sudo=True,
)
files.template(
    name="update timer unit",
    src=str(FILES / "roam-factory-update.timer.j2"),
    dest="/etc/systemd/system/roam-factory-update.timer",
    mode="644",
    update_minutes=UPDATE_MINUTES,
    _sudo=True,
)
systemd.service(
    name="update timer enabled",
    service="roam-factory-update.timer",
    running=True,
    enabled=True,
    daemon_reload=True,
    _sudo=True,
)

# Hermes's factory-host commands and claude-run jobs run in the factory user's login slice. With no swap, a runaway there is killed inside its slice instead of thrashing the host.
files.template(
    name="memory cap for the factory user's login sessions",
    src=str(FILES / "user-slice-memory.conf.j2"),
    dest=f"/etc/systemd/system/user-{FACTORY_UID}.slice.d/factory-memory.conf",
    mode="644",
    create_remote_dir=True,
    memory_gb=int(factory_env["FACTORY_HOST_SHELL_MEMORY_GB"]),
    _sudo=True,
)
server.shell(name="load the login slice cap", commands=["systemctl daemon-reload"], _sudo=True)

REBOOT_SCRIPT = f"{FACTORY_ROOT}/factory-reboot.sh"
BOOT_CHECK_SCRIPT = f"{FACTORY_ROOT}/factory-boot-check.sh"
files.put(name="Push the planned reboot script", src=str(FILES / "factory-reboot.sh"), dest=REBOOT_SCRIPT, mode="755", _sudo=True)
files.put(name="Push the boot check script", src=str(FILES / "factory-boot-check.sh"), dest=BOOT_CHECK_SCRIPT, mode="755", _sudo=True)
files.template(
    name="planned reboot service unit",
    src=str(FILES / "roam-factory-reboot.service.j2"),
    dest="/etc/systemd/system/roam-factory-reboot.service",
    mode="644",
    script=REBOOT_SCRIPT,
    factory_root=FACTORY_ROOT,
    service_user=FACTORY_USER,
    drain_minutes=int(factory_env["FACTORY_REBOOT_DRAIN_MINUTES"]),
    home_dir=HOME_DIR,
    _sudo=True,
)
files.template(
    name="planned reboot timer unit",
    src=str(FILES / "roam-factory-reboot.timer.j2"),
    dest="/etc/systemd/system/roam-factory-reboot.timer",
    mode="644",
    calendar=factory_env["FACTORY_REBOOT_CALENDAR"],
    _sudo=True,
)
server.shell(name="Check the reboot calendar", commands=[f"systemd-analyze calendar {shlex.quote(factory_env['FACTORY_REBOOT_CALENDAR'])}"], _sudo=True)
systemd.service(
    name="planned reboot timer enabled",
    service="roam-factory-reboot.timer",
    running=True,
    enabled=True,
    daemon_reload=True,
    _sudo=True,
)
files.template(
    name="boot check service unit",
    src=str(FILES / "roam-factory-boot-check.service.j2"),
    dest="/etc/systemd/system/roam-factory-boot-check.service",
    mode="644",
    script=BOOT_CHECK_SCRIPT,
    factory_root=FACTORY_ROOT,
    service_user=FACTORY_USER,
    check_minutes=int(factory_env["FACTORY_BOOT_CHECK_MINUTES"]),
    public_url=factory_env["FACTORY_PUBLIC_URL"],
    home_dir=HOME_DIR,
    _sudo=True,
)
# It runs at each boot. Deploy only enables it.
systemd.service(
    name="boot check enabled at boot",
    service="roam-factory-boot-check.service",
    running=False,
    enabled=True,
    daemon_reload=True,
    _sudo=True,
)

files.sync(
    name="Sync the caddy stack",
    src=str(INFRA_DIR / "stacks" / "caddy"),
    dest=f"{FACTORY_ROOT}/stacks/caddy",
    delete=True,
    _sudo=True,
)
files.put(
    name="Push the tunnel token",
    src=StringIO(f"TUNNEL_TOKEN={settings.factory_tunnel_token}\n"),
    dest=TUNNEL_ENV,
    mode="600",
    add_deploy_dir=False,
    _sudo=True,
)
server.shell(
    name="compose up: caddy and the tunnel",
    commands=[
        f"cd {FACTORY_ROOT}/stacks/caddy && FACTORY_DOMAIN={shlex.quote(settings.factory_domain)} "
        f"FACTORY_ITCH_URL={shlex.quote(itch_url)} "
        "timeout 300 docker compose up -d --remove-orphans --wait --wait-timeout 120"
    ],
    _sudo=True,
)
# `compose up -d` leaves a running container alone, so reload a changed Caddyfile.
server.shell(
    name="reload caddy config",
    commands=["timeout 30 docker exec factory-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile"],
    _sudo=True,
)

# Docker skips UFW for published ports. Fail the deploy on any published port.
files.put(
    name="Push the published port check",
    src=str(FILES / "check-ports.sh"),
    dest=f"{FACTORY_ROOT}/check-ports.sh",
    mode="755",
    _sudo=True,
)
server.shell(
    name="No published ports",
    commands=[f"timeout 30 {FACTORY_ROOT}/check-ports.sh"],
    _sudo=True,
)
