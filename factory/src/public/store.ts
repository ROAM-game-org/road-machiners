import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ReactionCountEvent = { updateId: number; kind: 'reaction-count'; chat: string; messageId: number; counts: Record<string, number> };
export type ReactionEvent = { updateId: number; kind: 'reaction'; chat: string; messageId: number; user: string; emoji: string[] };
export type ForwardEvent = { updateId: number; kind: 'forward'; chat: string; messageId: number; channelChat: string; channelMessageId: number };
export type CommentEvent = { updateId: number; kind: 'comment'; chat: string; messageId: number; threadId: number; author: string; text: string; at: string };
export type PublicEvent = ReactionCountEvent | ReactionEvent | ForwardEvent | CommentEvent;

export type CommentKind = 'bug' | 'feature' | 'feedback' | 'rejected';
export type PublicRoute = 'none' | 'patch' | 'redesign';
export type Proposal = { issue: number; pitch: string; chat: string | null; messageId: number | null; postedAt: string | null; closedAt: string | null };
export type BuildPost = { issue: number; build: string; chat: string; messageId: number; postedAt: string };
export type StoredComment = { id: number; issue: number; source: 'telegram' | 'game'; author: string; text: string; at: string; kind: CommentKind | null; route: PublicRoute | null };
export type NewComment = { issue: number; source: 'telegram' | 'game'; sourceId: string; postChat: string | null; postMessageId: number | null; author: string; text: string; at: string };
export type ReportRow = { address: string; build: string; version: string; kind: string; text: string; verdict: 'accept' | 'reject'; reason: string; issue: number | null; createdIssue: number | null; at: string };

const SCHEMA = `
create table if not exists updates (update_id integer primary key);
create table if not exists proposals (issue integer primary key, pitch text not null, created_at text not null, chat text, message_id integer, discussion_chat text, discussion_id integer, posted_at text, channel_counts text, closed_at text);
create table if not exists reactions (chat text not null, message_id integer not null, user_id text not null, emoji text not null, primary key (chat, message_id, user_id));
create table if not exists build_posts (chat text not null, message_id integer not null, issue integer not null, build text not null, discussion_chat text, discussion_id integer, posted_at text not null, open integer not null, primary key (chat, message_id));
create table if not exists comments (id integer primary key autoincrement, issue integer not null, source text not null, source_id text not null unique, post_chat text, post_message_id integer, author text not null, text text not null, at text not null, kind text, route text, classified_at text, sent_at text, routed_at text);
create table if not exists reports (id integer primary key autoincrement, address text not null, build text not null, version text not null, kind text not null, text text not null, verdict text not null, reason text not null, issue integer, created_issue integer, at text not null);
create table if not exists hits (address text not null, hour text not null, count integer not null, primary key (address, hour));
create table if not exists digests (issue integer primary key, last_at text not null);
`;

export const storePath = (home: string): string => join(home, 'public', 'public.db');

export function openStore(home: string): PublicStore {
  mkdirSync(join(home, 'public'), { recursive: true });
  return new PublicStore(new DatabaseSync(storePath(home)));
}

export class PublicStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000; pragma synchronous = normal;');
    db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  applyEvent(event: PublicEvent): boolean {
    return this.transaction(() => {
      const fresh = this.db.prepare('insert or ignore into updates (update_id) values (?)').run(event.updateId).changes === 1;
      if (fresh) this.apply(event);
      return fresh;
    });
  }

  addProposal(issue: number, pitch: string, now: Date): void {
    this.db.prepare('insert into proposals (issue, pitch, created_at) values (?, ?, ?) on conflict (issue) do update set pitch = excluded.pitch where posted_at is null').run(issue, pitch, now.toISOString());
  }

  proposal(issue: number): Proposal | null {
    const row = this.db.prepare('select * from proposals where issue = ?').get(issue);
    return row === undefined ? null : toProposal(row);
  }

  unpostedProposals(): Proposal[] {
    return this.db.prepare('select * from proposals where posted_at is null and closed_at is null order by created_at, issue').all().map(toProposal);
  }

  proposalsPostedSince(since: Date): number {
    return Number(this.db.prepare('select count(*) as n from proposals where posted_at >= ?').get(since.toISOString())?.n);
  }

  markProposalPosted(issue: number, chat: string, messageId: number, now: Date): void {
    this.db.prepare('update proposals set chat = ?, message_id = ?, posted_at = ? where issue = ?').run(chat, messageId, now.toISOString(), issue);
  }

  openProposals(): Proposal[] {
    return this.db.prepare('select * from proposals where posted_at is not null and closed_at is null order by posted_at').all().map(toProposal);
  }

  votes(issue: number, positive: string[]): number {
    const row = this.db.prepare('select chat, message_id, channel_counts from proposals where issue = ?').get(issue);
    if (row === undefined || row.message_id === null) return 0;
    if (row.channel_counts !== null) return countPositive(JSON.parse(String(row.channel_counts)) as Record<string, number>, positive);
    const users = this.db.prepare('select emoji from reactions where chat = ? and message_id = ?').all(String(row.chat), Number(row.message_id));
    return users.filter((user) => (JSON.parse(String(user.emoji)) as string[]).some((emoji) => positive.includes(emoji))).length;
  }

  closeProposal(issue: number, now: Date): void {
    this.db.prepare('update proposals set closed_at = ? where issue = ?').run(now.toISOString(), issue);
  }

  addBuildPost(issue: number, build: string, chat: string, messageId: number, now: Date): void {
    this.transaction(() => {
      this.closeBuildPosts(issue);
      this.db.prepare('insert into build_posts (chat, message_id, issue, build, posted_at, open) values (?, ?, ?, ?, ?, 1)').run(chat, messageId, issue, build, now.toISOString());
    });
  }

  openBuildPost(issue: number): BuildPost | null {
    const row = this.db.prepare('select * from build_posts where issue = ? and open = 1').get(issue);
    return row === undefined ? null : toBuildPost(row);
  }

  closeBuildPosts(issue: number): void {
    this.db.prepare('update build_posts set open = 0 where issue = ?').run(issue);
  }

  addComment(comment: NewComment): number | null {
    const { issue, source, sourceId, postChat, postMessageId, author, text, at } = comment;
    const result = this.db.prepare('insert or ignore into comments (issue, source, source_id, post_chat, post_message_id, author, text, at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(issue, source, sourceId, postChat, postMessageId, author, text, at);
    return result.changes === 1 ? Number(result.lastInsertRowid) : null;
  }

  unclassifiedComments(): StoredComment[] {
    return this.db.prepare('select * from comments where classified_at is null order by id').all().map(toComment);
  }

  classify(id: number, kind: CommentKind, route: PublicRoute, now: Date): void {
    this.db.prepare('update comments set kind = ?, route = ?, classified_at = ? where id = ?').run(kind, route, now.toISOString(), id);
  }

  unsentComments(): StoredComment[] {
    return this.db.prepare("select * from comments where classified_at is not null and sent_at is null and kind != 'rejected' order by issue, id").all().map(toComment);
  }

  markSent(ids: number[], now: Date): void {
    this.transaction(() => {
      for (const id of ids) this.db.prepare('update comments set sent_at = ? where id = ?').run(now.toISOString(), id);
    });
  }

  lastDigest(issue: number): Date | null {
    const row = this.db.prepare('select last_at from digests where issue = ?').get(issue);
    return row === undefined ? null : new Date(String(row.last_at));
  }

  recordDigest(issue: number, now: Date): void {
    this.db.prepare('insert into digests (issue, last_at) values (?, ?) on conflict (issue) do update set last_at = excluded.last_at').run(issue, now.toISOString());
  }

  pendingRoutes(): StoredComment[] {
    const sql = "select c.* from comments c join build_posts b on b.issue = c.issue and b.open = 1 and ((c.post_chat = b.chat and c.post_message_id = b.message_id) or (c.post_chat = b.discussion_chat and c.post_message_id = b.discussion_id) or c.source = 'game') where c.route in ('patch', 'redesign') and c.routed_at is null and c.kind != 'rejected' order by c.id";
    return this.db.prepare(sql).all().map(toComment);
  }

  markRouted(id: number, now: Date): void {
    this.db.prepare('update comments set routed_at = ? where id = ?').run(now.toISOString(), id);
  }

  countHit(address: string, now: Date): number {
    const hour = now.toISOString().slice(0, 13);
    this.db.prepare('insert into hits (address, hour, count) values (?, ?, 1) on conflict (address, hour) do update set count = count + 1').run(address, hour);
    this.db.prepare('delete from hits where hour < ?').run(new Date(now.getTime() - 3_600_000).toISOString().slice(0, 13));
    return Number(this.db.prepare('select count from hits where address = ? and hour = ?').get(address, hour)?.count);
  }

  addReport(report: ReportRow): number {
    const { address, build, version, kind, text, verdict, reason, issue, createdIssue, at } = report;
    return Number(this.db.prepare('insert into reports (address, build, version, kind, text, verdict, reason, issue, created_issue, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(address, build, version, kind, text, verdict, reason, issue, createdIssue, at).lastInsertRowid);
  }

  issuesCreatedSince(since: Date): number {
    return Number(this.db.prepare('select count(*) as n from reports where created_issue is not null and at >= ?').get(since.toISOString())?.n);
  }

  private apply(event: PublicEvent): void {
    if (event.kind === 'reaction-count') return void this.db.prepare('update proposals set channel_counts = ? where chat = ? and message_id = ?').run(JSON.stringify(event.counts), event.chat, event.messageId);
    if (event.kind === 'reaction') return this.applyReaction(event);
    if (event.kind === 'forward') return this.applyForward(event);
    this.applyComment(event);
  }

  private applyReaction(event: ReactionEvent): void {
    if (event.emoji.length === 0) return void this.db.prepare('delete from reactions where chat = ? and message_id = ? and user_id = ?').run(event.chat, event.messageId, event.user);
    this.db.prepare('insert into reactions (chat, message_id, user_id, emoji) values (?, ?, ?, ?) on conflict (chat, message_id, user_id) do update set emoji = excluded.emoji').run(event.chat, event.messageId, event.user, JSON.stringify(event.emoji));
  }

  private applyForward(event: ForwardEvent): void {
    const args = [event.chat, event.messageId, event.channelChat, event.channelMessageId] as const;
    this.db.prepare('update proposals set discussion_chat = ?, discussion_id = ? where chat = ? and message_id = ?').run(...args);
    this.db.prepare('update build_posts set discussion_chat = ?, discussion_id = ? where chat = ? and message_id = ?').run(...args);
  }

  private applyComment(event: CommentEvent): void {
    const issue = this.threadIssue(event.chat, event.threadId);
    if (issue === null) return;
    this.addComment({ issue, source: 'telegram', sourceId: `${event.chat}:${event.messageId}`, postChat: event.chat, postMessageId: event.threadId, author: event.author, text: event.text, at: event.at });
  }

  private threadIssue(chat: string, threadId: number): number | null {
    const match = 'where (chat = ? and message_id = ?) or (discussion_chat = ? and discussion_id = ?)';
    const row = this.db.prepare(`select issue from proposals ${match} union select issue from build_posts ${match}`).get(chat, threadId, chat, threadId, chat, threadId, chat, threadId);
    return row === undefined ? null : Number(row.issue);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('begin immediate');
    try {
      const result = work();
      this.db.exec('commit');
      return result;
    } catch (error) {
      this.db.exec('rollback');
      throw error;
    }
  }
}

type Row = Record<string, unknown>;

function countPositive(counts: Record<string, number>, positive: string[]): number {
  return positive.reduce((sum, emoji) => sum + (counts[emoji] ?? 0), 0);
}

function toProposal(row: Row): Proposal {
  return { issue: Number(row.issue), pitch: String(row.pitch), chat: row.chat === null ? null : String(row.chat), messageId: row.message_id === null ? null : Number(row.message_id), postedAt: row.posted_at === null ? null : String(row.posted_at), closedAt: row.closed_at === null ? null : String(row.closed_at) };
}

function toBuildPost(row: Row): BuildPost {
  return { issue: Number(row.issue), build: String(row.build), chat: String(row.chat), messageId: Number(row.message_id), postedAt: String(row.posted_at) };
}

function toComment(row: Row): StoredComment {
  return { id: Number(row.id), issue: Number(row.issue), source: row.source as StoredComment['source'], author: String(row.author), text: String(row.text), at: String(row.at), kind: row.kind as CommentKind | null, route: row.route as PublicRoute | null };
}
