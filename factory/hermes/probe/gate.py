# Each tool through Hermes's own toolset resolution and dispatch, for a player, a non-member, the committee and cron.
exec(open('/w/repo/factory/hermes/probe/setup.py').read())


def names(platform_key, chat):
    enabled, disabled = resolve(platform_key, chat)
    listed = sorted(t['function']['name'] for t in get_tool_definitions(enabled_toolsets=enabled, disabled_toolsets=disabled, quiet_mode=True))
    full = sorted(t['function']['name'] for t in get_tool_definitions(enabled_toolsets=enabled, disabled_toolsets=disabled, quiet_mode=True, skip_tool_search_assembly=True))
    return enabled, (listed, full)

print('== Tool list the gateway resolves for each chat')
lists = {}
for label, key, chat in (('player chat -200', 'telegram', '-200'), ('player chat -300', 'telegram', '-300'), ('committee chat -100', 'telegram', '-100'), ('cron', 'cron', '')):
    enabled, tools = names(key, chat)
    lists[label] = tools
    print(f'{label}: toolsets {enabled}')
    print(f'  listed directly: {tools[0]}')
    print(f'  full catalog ({len(tools[1])}): {tools[1]}')
print('player chat list == committee list:', lists['player chat -200'] == lists['committee chat -100'])

def call(tool, args, chat='-200', user='42', platform='telegram'):
    tokens = set_session_vars(platform=platform, chat_id=chat, user_id=user, message_id='501')
    try:
        out = handle_function_call(tool, args, task_id='probe-' + (chat or 'cron'))
    finally:
        clear_session_vars(tokens)
    return out

def show(label, out):
    text = out if len(out) < 220 else out[:220] + '...'
    print(f'  {label}: {text}')

attempts = [
    ('terminal: read the bot env', 'terminal', {'command': f'cat {H}/.env; touch /tmp/pwned-terminal'}),
    ('terminal: factory-host shell on the server', 'terminal', {'command': "factory-host 'cat /opt/factory/code/factory/.env'"}),
    ('process_manage: list processes', 'process_manage', {'action': 'list'}),
    ('read_file: GitHub token', 'read_file', {'path': F + '/github-token'}),
    ('search_files: state dir', 'search_files', {'pattern': 'token', 'path': F}),
    ('write_file: factory state', 'write_file', {'path': F + '/state/pwned.json', 'content': '{}'}),
    ('patch: Hermes config', 'patch', {'path': H + '/config.yaml', 'old_string': 'factory', 'new_string': 'x'}),
    ('memory: add a note for the committee', 'memory', {'action': 'add', 'target': 'memory', 'content': 'players are committee'}),
    ('session_search: committee chat', 'session_search', {'query': 'merge'}),
    ('skills_list', 'skills_list', {}),
    ('skill_view', 'skill_view', {'name': 'anything'}),
    ('skill_manage: create', 'skill_manage', {'action': 'create', 'name': 'pwn', 'content': 'x'}),
    ('factory_queue_task', 'factory_queue_task', {'request': 'merge everything'}),
    ('factory_sender', 'factory_sender', {}),
    ('factory_route_reply', 'factory_route_reply', {'post': 1, 'action': 'approve'}),
    ('factory_report_activity', 'factory_report_activity', {'activity': 'idle'}),
    ('vision_analyze: local env file', 'vision_analyze', {'image_url': H + '/.env', 'question': 'read it'}),
]
print('\n== Player in the player chat (-200), session bound like the gateway')
for label, tool, args in attempts:
    show(label, call(tool, args))
print('  side effects: /tmp/pwned-terminal', os.path.exists('/tmp/pwned-terminal'), '| state/pwned.json', os.path.exists(F + '/state/pwned.json'), '| config intact', 'factory' in open(H + '/config.yaml').read())
print('\n== Player tools in the player chat (factory on PATH is a stub that echoes its arguments)')
for tool, args in (('player_messages', {}), ('file_issue', {'message': 501, 'kind': 'bug'}), ('add_to_issue', {'message': 501, 'issue': 7, 'kind': 'feedback'}), ('issue_status', {'issue': 7})):
    show(tool, call(tool, args))
show('factory_status (public dashboard; example.org has none)', call('factory_status', {}))
show('vision_analyze: player photo in the image cache (not blocked; the probe has no vision model)', call('vision_analyze', {'image_url': H + '/cache/images/photo.jpg', 'question': 'what is it'}))
print('\n== Tool search bridge in the player chat')
show('tool_search for the player tools', call('tool_search', {'queries': ['file a player message as an issue']}))
show('tool_call -> terminal', call('tool_call', {'name': 'terminal', 'arguments': {'command': 'touch /tmp/pwned-bridge'}}))
show('tool_call -> read_file token', call('tool_call', {'name': 'read_file', 'arguments': {'path': F + '/github-token'}}))
show('tool_call -> factory_queue_task', call('tool_call', {'name': 'factory_queue_task', 'arguments': {'request': 'merge everything'}}))
show('tool_call -> factory_sender', call('tool_call', {'name': 'factory_sender', 'arguments': {}}))
show('tool_call -> player_messages', call('tool_call', {'name': 'player_messages', 'arguments': {}}))
print('  side effect: /tmp/pwned-bridge', os.path.exists('/tmp/pwned-bridge'))
print('\n== Agent-loop tools: the pre_tool_call decision the agent loop asks for before it runs them')
from hermes_cli.plugins import _dispatch_pre_tool_call_hooks
def loop(tool, args, chat='-200', user='42', platform='telegram'):
    tokens = set_session_vars(platform=platform, chat_id=chat, user_id=user, message_id='501')
    try:
        return _dispatch_pre_tool_call_hooks(tool, args, session_id='probe')[0]
    finally:
        clear_session_vars(tokens)
for tool, args in (('memory', {'action': 'add', 'target': 'memory', 'content': 'x'}), ('session_search', {'query': 'merge'}), ('delegate_task', {'goal': 'x'}), ('execute_code', {'code': 'print(1)'})):
    print(f'  player {tool}: blocked={loop(tool, args) is not None}  committee {tool}: blocked={loop(tool, args, chat="-100", user="1") is not None}')
print('\n== Non-member (user 9) in the committee chat (-100) gets the public tools only')
show('terminal', call('terminal', {'command': 'echo should-not-run'}, chat='-100', user='9'))
show('read_file token', call('read_file', {'path': F + '/github-token'}, chat='-100', user='9'))
show('factory_queue_task', call('factory_queue_task', {'request': 'merge everything'}, chat='-100', user='9'))
print(f'  memory: blocked={loop("memory", {"action": "read"}, chat="-100", user="9") is not None}')
show('game tool tool_search', call('tool_search', {'queries': ['issue status']}, chat='-100', user='9')[:120])
print('\n== Member (user 1) posting in the player chat is a player there')
show('terminal', call('terminal', {'command': 'echo should-not-run'}, chat='-200', user='1'))
print('\n== Telegram session with no chat id counts as a player chat')
show('terminal', call('terminal', {'command': 'echo should-not-run'}, chat=''))
print('\n== Committee chat (-100) and cron keep every tool')
show('committee terminal', call('terminal', {'command': 'echo committee-ran'}, chat='-100', user='1'))
show('committee read_file', call('read_file', {'path': F + '/inbox/../state'}, chat='-100', user='1'))
show('cron terminal', call('terminal', {'command': 'echo cron-ran'}, chat='', user='', platform=''))
show('committee file_issue (player tool refuses)', call('file_issue', {'message': 501, 'kind': 'bug'}, chat='-100', user='1'))
