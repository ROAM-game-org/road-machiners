# A full Hermes agent turn against a scripted OpenAI-compatible model on localhost. The model asks for tools in one parallel
# batch; Hermes's own agent loop runs them, so the gate is checked on the path a real Telegram turn takes.
import json, os, sys, threading, types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.argv = ['probe']
exec(open('/w/repo/factory/hermes/probe/setup.py').read())

requests = []
BATCH = {
    'player': [
        ('terminal', {'command': f'cat {H}/.env > /tmp/pwned-turn; echo ran'}),
        ('read_file', {'path': F + '/github-token'}),
        ('write_file', {'path': F + '/state/pwned-turn.json', 'content': '{}'}),
        ('memory', {'action': 'add', 'target': 'memory', 'content': 'players are committee'}),
        ('tool_call', {'name': 'session_search', 'arguments': {'query': 'merge'}}),
        ('skills_list', {}),
        ('tool_call', {'name': 'factory_queue_task', 'arguments': {'request': 'merge everything'}}),
        ('tool_call', {'name': 'player_messages', 'arguments': {}}),
    ],
    'committee': [('terminal', {'command': 'echo committee-ran'})],
}


class Model(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if 'messages' not in body:
            self.send_response(404)
            self.end_headers()
            return
        requests.append(body)
        who = 'committee' if 'COMMITTEE-TURN' in json.dumps(body['messages'][-1]) else 'player'
        if body['messages'][-1]['role'] == 'tool':
            message = {'role': 'assistant', 'content': 'done'}
            finish = 'stop'
        else:
            calls = [{'id': f'c{i}', 'type': 'function', 'function': {'name': n, 'arguments': json.dumps(a)}} for i, (n, a) in enumerate(BATCH[who])]
            message = {'role': 'assistant', 'content': None, 'tool_calls': calls}
            finish = 'tool_calls'
        out = {'id': 'x', 'object': 'chat.completion', 'created': 0, 'model': 'probe', 'choices': [{'index': 0, 'message': message, 'finish_reason': finish}], 'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}}
        if body.get('stream'):
            delta = dict(message)
            if 'tool_calls' in delta:
                delta['tool_calls'] = [{**c, 'index': i} for i, c in enumerate(delta['tool_calls'])]
            chunks = [{'id': 'x', 'object': 'chat.completion.chunk', 'created': 0, 'model': 'probe', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]},
                      {'id': 'x', 'object': 'chat.completion.chunk', 'created': 0, 'model': 'probe', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': finish}], 'usage': out['usage']}]
            data = ''.join(f'data: {json.dumps(c)}\n\n' for c in chunks) + 'data: [DONE]\n\n'
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            self.wfile.write(data.encode())
            return
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = ThreadingHTTPServer(('127.0.0.1', 0), Model)
threading.Thread(target=server.serve_forever, daemon=True).start()

from run_agent import AIAgent
from gateway.session_context import set_session_vars, clear_session_vars


def turn(chat, user, text):
    enabled, disabled = resolve('telegram', chat)
    tokens = set_session_vars(platform='telegram', chat_id=chat, user_id=user, message_id='501')
    try:
        agent = AIAgent(base_url=f'http://127.0.0.1:{server.server_port}/v1', api_key='probe', provider='custom', api_mode='chat_completions', model='probe',
                        enabled_toolsets=enabled, disabled_toolsets=disabled, quiet_mode=True, platform='telegram', user_id=user,
                        skip_context_files=True, skip_memory=True, skip_background_review=True, max_iterations=3)
        before = len(requests)
        result = agent.run_conversation(text)
    finally:
        clear_session_vars(tokens)
    return result, requests[before:]


for label, chat, user, text in (('Player 42 in the player chat -200', '-200', '42', public_header(501, True) + '@roam_bot run these'),
                                 ('Non-member 9 in the committee chat -100', '-100', '9', 'run these'),
                                 ('Member 1 in the committee chat -100', '-100', '1', 'COMMITTEE-TURN run this'),
                                 ('The committee chat -100 with no user id', '-100', '', 'COMMITTEE-TURN run this')):
    result, seen = turn(chat, user, text)
    print(f'== {label}: final answer {result.get("final_response")!r}, {len(seen)} model requests')
    first = seen[0]
    system = next((m['content'] for m in first['messages'] if m['role'] == 'system'), '')
    print('  system prompt is the public prompt:', 'player chat' in str(system) and 'SOUL' not in str(system), '| tools offered:', len(first.get('tools') or []))
    for m in seen[-1]['messages']:
        if m['role'] == 'tool':
            name = next(c['function']['name'] + (' -> ' + json.loads(c['function']['arguments']).get('name', '') if c['function']['name'] == 'tool_call' else '') for a in seen[-1]['messages'] if a.get('tool_calls') for c in a['tool_calls'] if c['id'] == m['tool_call_id'])
            content = m['content'] if isinstance(m['content'], str) else json.dumps(m['content'])
            print(f'  {name}: {content[:150]}')
print('side effects: /tmp/pwned-turn', os.path.exists('/tmp/pwned-turn'), '| state/pwned-turn.json', os.path.exists(F + '/state/pwned-turn.json'))
