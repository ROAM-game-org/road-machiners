
import { TIME } from '../../data/time';
import type { Archetype } from './bot';
import type { TurnLine } from './turn-log';

type Tally = { saleTurns: number; contractMoney: number };

type Job = { what: string; floor: number; grace: number; read: (t: Tally) => number };

const JOBS: Partial<Record<Archetype, Job>> = {
  trader: { what: 'turns with a sale', floor: 0.5, grace: 3, read: (t) => t.saleTurns },
  fastTrader: { what: 'turns with a sale', floor: 0.5, grace: 3, read: (t) => t.saleTurns },
  scavenger: { what: 'turns with a sale', floor: 2, grace: 3, read: (t) => t.saleTurns },
  hauler: { what: 'money from contracts', floor: 75, grace: 5, read: (t) => t.contractMoney },
  surveyor: { what: 'money from contracts', floor: 75, grace: 5, read: (t) => t.contractMoney },
};

export class JobTally {
  private readonly tally: Tally = { saleTurns: 0, contractMoney: 0 };
  private turns = 0;

  note(line: TurnLine): void {
    this.turns++;
    if ((line.ledger.goodsSold ?? 0) + (line.ledger.lootSales ?? 0) > 0) this.tally.saleTurns++;
    this.tally.contractMoney += line.ledger.contracts ?? 0;
  }

  failure(archetype: Archetype): string | null {
    const job = JOBS[archetype];
    const days = this.turns / TIME.workDayTurns;
    if (!job || days < job.grace || this.turns % TIME.workDayTurns !== 0) return null;
    const rate = job.read(this.tally) / days;
    if (rate >= job.floor) return null;
    return `${archetype} does not play its job: ${rate.toFixed(1)} ${job.what} per day over ${days} days, floor ${job.floor}`;
  }
}
