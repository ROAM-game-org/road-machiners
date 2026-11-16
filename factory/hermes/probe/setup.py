# Loads the factory plugin and config.yaml into the Hermes image, with fake secrets and a factory stub on PATH. From the repo root:
#   docker run --rm -v "$PWD":/w/repo --entrypoint /opt/hermes/.venv/bin/python3 factory-hermes:local /w/repo/factory/hermes/probe/gate.py
# and the same with turn.py and refs.py. Each prints what a player, a non-member, a member and cron get from each tool, or from a chat reference.
import json, os, shutil, sys, types
H = '/tmp/hh'; F = '/tmp/fh'
for d in (H + '/plugins', F + '/inbox', F + '/state', H + '/cache/images'):
    os.makedirs(d, exist_ok=True)
os.environ.update(HERMES_HOME=H, FACTORY_INBOX=F + '/inbox', FACTORY_STATE_DIR=F + '/state', FACTORY_COMMITTEE_CHAT='-100', FACTORY_COMMITTEE_DIR=F + '/committee', FACTORY_COMMITTEE_BOOTSTRAP='1', FACTORY_COMMITTEE_BOOTSTRAP_GITHUB='boss', FACTORY_PUBLIC_DISCUSSION='-200', FACTORY_PROPOSAL_CHAT='-300', FACTORY_PUBLIC_INBOX=F + '/public-inbox', FACTORY_REPO='o/r', FACTORY_PUBLIC_URL='https://example.org', FACTORY_STATUS_TIMEOUT_MS='1000', FACTORY_ROUTE_MIN_WORDS='4', FACTORY_OBSERVATION_HEARTBEAT_MS='10000', PATH='/w/repo/factory/hermes/probe:' + os.environ['PATH'])
shutil.copytree('/w/repo/factory/hermes/plugin', H + '/plugins/factory', dirs_exist_ok=True)
shutil.copy('/w/repo/factory/hermes/config.yaml', H + '/config.yaml')
open(F + '/github-token', 'w').write('FAKE-PROBE-TOKEN\n')
open(H + '/.env', 'w').write('TELEGRAM_BOT_TOKEN=FAKE-PROBE-BOT\n')
open(H + '/cache/images/photo.jpg', 'wb').write(b'\xff\xd8\xff')

import yaml
from hermes_cli.plugins import discover_plugins, get_plugin_manager
discover_plugins(force=True)
assert get_plugin_manager()._plugins['factory'].enabled
from gateway.run_turn import GatewayTurnMixin
from gateway.session import SessionSource
from gateway.config import Platform
from gateway.session_context import set_session_vars, clear_session_vars
from model_tools import get_tool_definitions, handle_function_call

config = yaml.safe_load(open(H + '/config.yaml'))
runner = types.SimpleNamespace(_delivery_adapter_for=lambda source: types.SimpleNamespace(toolsets_for_source=lambda s: None))
runner._resolve_enabled_toolsets_for_source = types.MethodType(GatewayTurnMixin._resolve_enabled_toolsets_for_source, runner)

def resolve(platform_key, chat):
    source = SessionSource(platform=Platform.TELEGRAM, chat_id=chat, chat_type='group', user_id='42')
    return GatewayTurnMixin._resolve_turn_toolsets(runner, config, source, platform_key)


public_header = sys.modules['hermes_plugins.factory'].public_header
