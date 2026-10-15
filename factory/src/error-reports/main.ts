import { loadConfig, readEnvFiles } from '../config';
import { realRun } from '../exec';
import { ghClient } from '../github';
import { filterWith } from '../public/filter';
import { openStore } from '../public/store';
import { Feedback } from './feedback';
import { ErrorReports, ErrorServer, raiseAlert } from './service';

async function startErrorService(): Promise<void> {
  const socket = process.env.ERROR_SOCKET;
  if (!socket) throw new Error('ERROR_SOCKET is not set. The systemd unit sets it.');
  const cfg = loadConfig({ ...readEnvFiles('settings.env', '.env'), ...process.env });
  const now = () => new Date();
  const github = ghClient(realRun, cfg);
  const log = (line: string) => console.error(line);
  const reports = new ErrorReports({ cfg, github, now });
  const feedback = new Feedback({ cfg, store: openStore(cfg.home), classify: filterWith(cfg, fetch), github, now, log, alert: (line) => raiseAlert(cfg.home, line) });
  const server = new ErrorServer(reports, feedback, cfg, now, log);
  await server.listen(socket);
  console.log(`Error service listening on ${socket}`);
  const stop = () => { void server.close().then(() => process.exit(0)); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

await startErrorService();
