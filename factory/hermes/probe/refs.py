# Hermes reads @file, @folder, @git and @diff references in any chat message before a tool or hook runs. This sends player messages through
# the gateway's own expansion with the repo config, which sets the terminal cwd, and prints whether Hermes's home reached the turn.
import asyncio, os, sys, types
sys.argv = ['probe']
exec(open('/w/repo/factory/hermes/probe/setup.py').read())
PRIVATE = {'memories/MEMORY.md': 'PRIVATE-MEMORY', 'sessions/s.json': 'PRIVATE-SESSION', 'logs/agent.log': 'PRIVATE-LOG', 'cron/jobs.json': 'PRIVATE-CRON'}
for rel, text in PRIVATE.items():
    os.makedirs(os.path.dirname(f'{H}/{rel}'), exist_ok=True)
    open(f'{H}/{rel}', 'w').write(text)
import gateway.run as gateway_run
from gateway.run import GatewayRunner
print('terminal cwd from config.yaml:', os.environ.get('TERMINAL_CWD'), '| writable by Hermes:', os.access(os.environ.get('TERMINAL_CWD', '/'), os.W_OK))
runner = types.SimpleNamespace(_delivery_adapter_for=lambda source: None)
async def context_length(source, session_key):
    return 100000
runner._inbound_model_context_length = context_length
source = SessionSource(platform=Platform.TELEGRAM, chat_id='-200', chat_type='group', user_id='42')
for text in ('@file:memories/MEMORY.md', '@file:sessions/s.json', '@file:logs/agent.log', '@file:config.yaml', '@folder:.', f'@file:{H}/memories/MEMORY.md',
             '@file:../../tmp/hh/cron/jobs.json', '@git:3', '@diff', '@file:.env'):
    out = asyncio.run(GatewayRunner._expand_inbound_context_references(runner, source, 'probe', public_header(501, True) + 'look ' + text))
    leaked = [v for v in [*PRIVATE.values(), 'platform_toolsets', 'FAKE-PROBE-BOT'] if out and v in out]
    print(f'  {text:34} leaked={leaked}')
tokens = set_session_vars(platform='telegram', chat_id='-100', user_id='1', message_id='1')
try:
    print('committee terminal in that cwd:', handle_function_call('terminal', {'command': 'pwd; touch x 2>&1 | tail -c 60; echo ran'}, task_id='probe-cwd')[:200])
finally:
    clear_session_vars(tokens)
