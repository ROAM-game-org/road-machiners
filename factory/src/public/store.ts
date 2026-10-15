import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DecisionKind, Relevance, ReplyLanguage } from './decision';

export type ReactionCountEvent = { updateId: number; kind: 'reaction-count'; chat: string; messageId: number; counts: Record<string, number> };
export type ReactionEvent = { updateId: number; kind: 'reaction'; chat: string; messageId: number; user: string; emoji: string[] };
export type ForwardEvent = { updateId: number; kind: 'forward'; chat: string; messageId: number; channelChat: string; channelMessageId: number };
export type CommentEvent = { updateId: number; kind: 'comment'; chat: string; messageId: number; threadId: number | null; author: string; sender: string; text: string; at: string; addressed?: boolean; standalone?: boolean; context?: string | null };
export type PublicEvent = ReactionCountEvent | ReactionEvent | ForwardEvent | CommentEvent;

export type CommentKind = DecisionKind | 'rejected';
export type PublicRoute = 'none' | 'patch' | 'redesign';
export type Proposal = { issue: number; pitch: string; chat: string | null; messageId: number | null; postedAt: string | null; closedAt: string | null };
export type Tally = { up: number; down: number };
export type BuildPost = { issue: number; build: string; chat: string; messageId: number; postedAt: string };
export type StoredComment = { id: number; issue: number | null; source: 'telegram' | 'game'; author: string; text: string; at: string; kind: CommentKind | null; route: PublicRoute | null; chat: string | null; messageId: number | null; sender: string | null; addressed: boolean; relevance: Relevance | null; filedIssue: number | null; filedAt: string | null; replyId: number | null; context: string | null; workIssue: number | null; language: ReplyLanguage | null; linked: boolean };
export type IssueComment = StoredComment & { issue: number };
export type NewComment = { issue: number | null; source: 'telegram' | 'game'; sourceId: string; postChat: string | null; postMessageId: number | null; author: string; sender?: string; text: string; at: string; messageId?: number; addressed?: boolean; context?: string | null };
export type KnownWork = { issue: number; text: string };
export type Judged = { workIssue?: number | null; language?: ReplyLanguage | null };
export type HitAnswer = { taken: true } | { taken: false; resetAt: Date };
export type ReportRow = { address: string; build: string; version: string; kind: string; text: string; verdict: 'accept' | 'reject'; intent: string; sincere: number; issue: number | null; createdIssue: number | null; at: string };

const OLD_COMMENT_COLUMNS = 'id, issue, source, source_id, post_chat, post_message_id, author, text, at, kind, route, classified_at, sent_at, routed_at, sender, dropped_at';
const COMMENT_COLUMNS = 'id integer primary key autoincrement, issue integer, source text not null, source_id text not null unique, post_chat text, post_message_id integer, author text not null, text text not null, at text not null, kind text, route text, classified_at text, sent_at text, routed_at text, sender text, dropped_at text, message_id integer, addressed integer not null default 0, relevance text, text_key text, filed_at text, filed_issue integer, replied_at text, reply_id integer, context text, work_issue integer, language text, linked integer not null default 0';
const HOUR_MS = 3_600_000;
const FAILED_HIT = 'failed:';
const ON_TOPIC = "(relevance is null or relevance = 'parent')";

export const textKey = (text: string): string => text.toLowerCase().replace(/@\w+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const SCHEMA = `
create table if not exists updates (update_id integer primary key);
create table if not exists proposals (issue integer primary key, pitch text not null, created_at text not null, chat text, message_id integer, discussion_chat text, discussion_id integer, posted_at text, channel_counts text, closed_at text);
create table if not exists reactions (chat text not null, message_id integer not null, user_id text not null, emoji text not null, primary key (chat, message_id, user_id));
create table if not exists build_posts (chat text not null, message_id integer not null, issue integer not null, build text not null, discussion_chat text, discussion_id integer, posted_at text not null, open integer not null, primary key (chat, message_id));
create table if not exists comments (${COMMENT_COLUMNS});
create table if not exists reports (id integer primary key autoincrement, address text not null, build text not null, version text not null, kind text not null, text text not null, verdict text not null, intent text not null, sincere real not null, issue integer, created_issue integer, at text not null);
create table if not exists hits (address text not null, hour text not null, count integer not null, primary key (address, hour));
create table if not exists digests (issue integer primary key, last_at text not null);
create table if not exists post_attempts (id integer primary key autoincrement, issue integer not null, at text not null);
create table if not exists route_attempts (issue integer not null, committee_post integer not null, at text not null, primary key (issue, committee_post));
`;

export const storePath = (home: string): string => join(home, 'public', 'public.db');

export function openStore(home: string): PublicStore {
  mkdirSync(join(home, 'public'), { recursive: true });
  return new PublicStore(new DatabaseSync(storePath(home)));
}

const columnsOf = (db: DatabaseSync, table: string): string[] => db.prepare(`pragma table_info(${table})`).all().map((column) => String(column.name));

function migrateProposals(db: DatabaseSync): void {
  const columns = columnsOf(db, 'proposals');
  if (!columns.includes('shown_footer')) db.exec('alter table proposals add column shown_footer text');
  if (columns.includes('shown_votes')) db.exec('alter table proposals drop column shown_votes');
  if (!columns.includes('attempted_at')) db.exec('alter table proposals add column attempted_at text');
}

function migrateComments(db: DatabaseSync): void {
  const columns = columnsOf(db, 'comments');
  if (!columns.includes('dropped_at')) db.exec('alter table comments add column dropped_at text');
  if (!columns.includes('sender')) db.exec('alter table comments add column sender text');
  if (!columns.includes('message_id')) return;
  for (const column of ['context text', 'work_issue integer', 'language text', 'linked integer not null default 0']) {
    if (!columns.includes(column.split(' ')[0]!)) db.exec(`alter table comments add column ${column}`);
  }
}

export class PublicStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000; pragma synchronous = normal;');
    const hadAttempts = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'post_attempts'").get() !== undefined;
    db.exec(SCHEMA);
    migrateProposals(db);
    migrateComments(db);
    if (!hadAttempts) db.exec('insert into post_attempts (issue, at) select issue, coalesce(posted_at, attempted_at) from proposals where coalesce(posted_at, attempted_at) is not null');
    this.allowCommentsWithoutIssue();
  }

  private allowCommentsWithoutIssue(): void {
    const issueRequired = () => Number(this.db.prepare('pragma table_info(comments)').all().find((column) => column.name === 'issue')?.notnull) === 1;
    if (!issueRequired()) return;
    this.transaction(() => {
      if (!issueRequired()) return;
      this.db.exec('alter table comments rename to comments_old');
      this.db.exec(`create table comments (${COMMENT_COLUMNS})`);
      this.db.exec(`insert into comments (${OLD_COMMENT_COLUMNS}, filed_at, replied_at) select ${OLD_COMMENT_COLUMNS}, at, at from comments_old`);
      this.db.exec('drop table comments_old');
    });
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
    this.transaction(() => {
      this.db.prepare('delete from proposals where issue = ? and closed_at is not null').run(issue);
      this.db.prepare('insert into proposals (issue, pitch, created_at) values (?, ?, ?) on conflict (issue) do update set pitch = excluded.pitch where posted_at is null').run(issue, pitch, now.toISOString());
    });
  }

  proposal(issue: number): Proposal | null {
    const row = this.db.prepare('select * from proposals where issue = ?').get(issue);
    return row === undefined ? null : toProposal(row);
  }

  unpostedProposals(): Proposal[] {
    return this.db.prepare('select * from proposals where posted_at is null and closed_at is null order by created_at, issue').all().map(toProposal);
  }

  proposalPostAttemptsSince(since: Date): number {
    return Number(this.db.prepare('select count(*) as n from post_attempts where at >= ?').get(since.toISOString())?.n);
  }

  beginProposalPost(issue: number, now: Date): void {
    this.transaction(() => {
      this.db.prepare('update proposals set closed_at = ?, attempted_at = ? where issue = ?').run(now.toISOString(), now.toISOString(), issue);
      this.db.prepare('insert into post_attempts (issue, at) values (?, ?)').run(issue, now.toISOString());
    });
  }

  markProposalPosted(issue: number, chat: string, messageId: number, footer: string, now: Date): void {
    this.db.prepare('update proposals set chat = ?, message_id = ?, posted_at = ?, closed_at = null, shown_footer = ? where issue = ?').run(chat, messageId, now.toISOString(), footer, issue);
  }

  openProposals(): Proposal[] {
    return this.db.prepare('select * from proposals where posted_at is not null and closed_at is null order by posted_at').all().map(toProposal);
  }

  tally(issue: number, up: string[], down: string[]): Tally {
    const row = this.db.prepare('select channel_counts from proposals where issue = ?').get(issue);
    if (row !== undefined && row.channel_counts !== null) {
      const counts = JSON.parse(String(row.channel_counts)) as Record<string, number>;
      return { up: countOf(counts, up), down: countOf(counts, down) };
    }
    return { up: this.votersWith(issue, up).length, down: this.votersWith(issue, down).length };
  }

  votersWith(issue: number, wanted: string[]): string[] {
    const row = this.db.prepare('select chat, message_id from proposals where issue = ?').get(issue);
    if (row === undefined || row.message_id === null) return [];
    const users = this.db.prepare('select user_id, emoji from reactions where chat = ? and message_id = ?').all(String(row.chat), Number(row.message_id));
    return users.filter((user) => (JSON.parse(String(user.emoji)) as string[]).some((emoji) => wanted.includes(emoji))).map((user) => String(user.user_id));
  }

  shownFooter(issue: number): string | null {
    const row = this.db.prepare('select shown_footer from proposals where issue = ?').get(issue);
    return row === undefined || row.shown_footer === null ? null : String(row.shown_footer);
  }

  setShownFooter(issue: number, footer: string): void {
    this.db.prepare('update proposals set shown_footer = ? where issue = ?').run(footer, issue);
  }

  closeProposal(issue: number, now: Date): void {
    this.transaction(() => {
      this.db.prepare('delete from post_attempts where id = (select max(id) from post_attempts where issue = ? and at = (select attempted_at from proposals where issue = ? and posted_at is null))').run(issue, issue);
      this.db.prepare('update proposals set closed_at = ?, attempted_at = null where issue = ?').run(now.toISOString(), issue);
    });
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
    const extra = [comment.sender ?? null, comment.messageId ?? null, comment.addressed ? 1 : 0, comment.context ?? null] as const;
    const result = this.db.prepare('insert or ignore into comments (issue, source, source_id, post_chat, post_message_id, author, text, at, sender, message_id, addressed, context) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(issue, source, sourceId, postChat, postMessageId, author, text, at, ...extra);
    return result.changes === 1 ? Number(result.lastInsertRowid) : null;
  }

  parentPitch(issue: number): string | null {
    const row = this.db.prepare('select pitch from proposals where issue = ?').get(issue);
    return row === undefined ? null : String(row.pitch).split('\n')[0]!.trim();
  }

  unclassifiedComments(limit: number): StoredComment[] {
    const waiting = 'select *, row_number() over (partition by coalesce(sender, source_id) order by id) as turn from comments where classified_at is null and dropped_at is null';
    return this.db.prepare(`select * from (${waiting}) order by turn, id limit ?`).all(limit).map(toComment);
  }

  classify(id: number, kind: CommentKind, route: PublicRoute, now: Date, relevance: Relevance = 'parent', judged: Judged = {}): void {
    const sql = 'update comments set kind = ?, route = ?, relevance = ?, classified_at = ?, work_issue = ?, language = ? where id = ?';
    this.db.prepare(sql).run(kind, route, relevance, now.toISOString(), judged.workIssue ?? null, judged.language ?? null, id);
  }

  knownWork(): KnownWork[] {
    const proposals = this.db.prepare('select issue, pitch from proposals order by issue').all().map((row) => ({ issue: Number(row.issue), text: workText(String(row.pitch)) }));
    const firstFiled = 'select min(id) from comments where filed_issue is not null and linked = 0 group by filed_issue';
    const filed = this.db.prepare(`select filed_issue, text from comments where id in (${firstFiled}) order by filed_issue`).all().map((row) => ({ issue: Number(row.filed_issue), text: oneLineCut(String(row.text)) }));
    const proposed = new Set(proposals.map((work) => work.issue));
    return [...proposals, ...filed.filter((work) => !proposed.has(work.issue))];
  }

  unsentComments(): IssueComment[] {
    return this.db.prepare(`select * from comments where classified_at is not null and sent_at is null and dropped_at is null and kind not in ('rejected', 'chatter') and issue is not null and ${ON_TOPIC} order by issue, id`).all().map(toIssueComment);
  }

  dropCommentsOnClosedPosts(now: Date): number {
    const matches = (post: string): string => `(c.post_chat = ${post}.chat and c.post_message_id = ${post}.message_id) or (c.post_chat = ${post}.discussion_chat and c.post_message_id = ${post}.discussion_id)`;
    const onOpenProposal = `exists (select 1 from proposals p where p.issue = c.issue and p.posted_at is not null and p.closed_at is null and (${matches('p')}))`;
    const onOpenBuildPost = `exists (select 1 from build_posts b where b.issue = c.issue and b.open = 1 and (${matches('b')}))`;
    const aboutThread = "c.classified_at is not null and (c.relevance is null or c.relevance = 'parent')";
    const sql = `update comments as c set dropped_at = ? where c.sent_at is null and c.dropped_at is null and c.post_message_id is not null and ${aboutThread} and not ${onOpenProposal} and not ${onOpenBuildPost}`;
    return Number(this.db.prepare(sql).run(now.toISOString()).changes);
  }

  toFile(): StoredComment[] {
    const fileable = "(kind in ('bug', 'feature') or work_issue is not null)";
    return this.db.prepare(`select * from comments where source = 'telegram' and classified_at is not null and dropped_at is null and filed_at is null and ${fileable} and not (issue is not null and ${ON_TOPIC}) order by id`).all().map(toComment);
  }

  markFiling(id: number, now: Date): void {
    this.db.prepare('update comments set filed_at = ? where id = ?').run(now.toISOString(), id);
  }

  link(id: number, issue: number): void {
    this.db.prepare("update comments set issue = ?, relevance = 'parent', post_message_id = null, route = 'none', linked = 1 where id = ?").run(issue, id);
  }

  claimFiling(id: number, text: string, now: Date): number | null {
    const key = textKey(text);
    this.db.prepare('update comments set filed_at = ?, text_key = ? where id = ?').run(now.toISOString(), key, id);
    if (key === '') return null;
    const earlier = this.db.prepare('select filed_issue from comments where text_key = ? and filed_issue is not null and id != ? order by id limit 1').get(key, id);
    return earlier === undefined ? null : Number(earlier.filed_issue);
  }

  setFiled(id: number, issue: number): void {
    this.db.prepare('update comments set filed_issue = ? where id = ?').run(issue, id);
  }

  filedBefore(comment: StoredComment): boolean {
    if (comment.filedIssue === null) return false;
    return this.db.prepare('select 1 from comments where filed_issue = ? and id < ?').get(comment.filedIssue, comment.id) !== undefined;
  }

  toReply(): StoredComment[] {
    const filed = `(filed_at is not null or (kind not in ('bug', 'feature') and work_issue is null) or (issue is not null and ${ON_TOPIC}))`;
    return this.db.prepare(`select * from comments where source = 'telegram' and classified_at is not null and dropped_at is null and replied_at is null and message_id is not null and ${filed} order by id`).all().map(toComment);
  }

  markReplied(id: number, now: Date): void {
    this.db.prepare('update comments set replied_at = ? where id = ?').run(now.toISOString(), id);
  }

  setReplyId(id: number, replyId: number): void {
    this.db.prepare('update comments set reply_id = ? where id = ?').run(replyId, id);
  }

  recentChat(limit: number): StoredComment[] {
    return this.db.prepare("select * from comments where source = 'telegram' and classified_at is not null order by id desc limit ?").all(limit).map(toComment);
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

  pendingRoutes(): IssueComment[] {
    const onOpenPost = 'exists (select 1 from build_posts b where b.issue = c.issue and b.open = 1 and ((c.post_chat = b.chat and c.post_message_id = b.message_id) or (c.post_chat = b.discussion_chat and c.post_message_id = b.discussion_id)))';
    const sql = `select c.* from comments c where c.route in ('patch', 'redesign') and c.routed_at is null and c.kind != 'rejected' and c.issue is not null and (c.relevance is null or c.relevance = 'parent') and (c.source = 'game' or ${onOpenPost}) order by c.id`;
    return this.db.prepare(sql).all().map(toIssueComment);
  }

  beginRoute(issue: number, committeePost: number, now: Date): boolean {
    return this.db.prepare('insert or ignore into route_attempts (issue, committee_post, at) values (?, ?, ?)').run(issue, committeePost, now.toISOString()).changes === 1;
  }

  markRouted(id: number, now: Date): void {
    this.db.prepare('update comments set routed_at = ? where id = ?').run(now.toISOString(), id);
  }

  takeHit(address: string, now: Date, limit: number): HitAnswer {
    const hour = hourOf(now);
    this.db.prepare('delete from hits where hour < ?').run(hourOf(new Date(now.getTime() - HOUR_MS)));
    const count = Number(this.db.prepare('select count from hits where address = ? and hour = ?').get(address, hour)?.count ?? 0);
    if (count >= limit) return { taken: false, resetAt: nextHour(now) };
    this.db.prepare('insert into hits (address, hour, count) values (?, ?, 1) on conflict (address, hour) do update set count = count + 1').run(address, hour);
    return { taken: true };
  }

  returnHit(address: string, takenAt: Date, limit: number): void {
    if (!this.takeHit(`${FAILED_HIT}${address}`, takenAt, limit).taken) return;
    this.db.prepare('update hits set count = count - 1 where address = ? and hour = ? and count > 0').run(address, hourOf(takenAt));
  }

  addReport(report: ReportRow): number {
    const { address, build, version, kind, text, verdict, intent, sincere, issue, createdIssue, at } = report;
    return Number(this.db.prepare('insert into reports (address, build, version, kind, text, verdict, intent, sincere, issue, created_issue, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(address, build, version, kind, text, verdict, intent, sincere, issue, createdIssue, at).lastInsertRowid);
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
    const thread = event.threadId === null ? null : this.threadOf(event.chat, event.threadId);
    if (thread === null && !event.standalone) return;
    this.addComment({ issue: thread?.issue ?? null, source: 'telegram', sourceId: `${event.chat}:${event.messageId}`, postChat: event.chat, postMessageId: thread?.post ?? null, author: event.author, text: event.text, at: event.at, ...reachOf(event) });
  }

  private threadOf(chat: string, threadId: number): { issue: number; post: number | null } | null {
    const issue = this.threadIssue(chat, threadId);
    if (issue !== null) return { issue, post: threadId };
    const parent = this.db.prepare('select issue, post_message_id from comments where issue is not null and (source_id = ? or (post_chat = ? and reply_id = ?)) order by id limit 1').get(`${chat}:${threadId}`, chat, threadId);
    return parent === undefined ? null : { issue: Number(parent.issue), post: numberOrNull(parent.post_message_id) };
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

const WORK_CHARS = 200;
const oneLineCut = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, WORK_CHARS);

function workText(pitch: string): string {
  const [title, ...rest] = pitch.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return oneLineCut(rest.length === 0 ? title ?? '' : `${title}: ${rest[0]}`);
}

const reachOf = (event: CommentEvent) => ({ sender: event.sender, messageId: event.messageId, addressed: event.addressed, context: event.context ?? null });

const hourOf = (time: Date): string => time.toISOString().slice(0, 13);
const nextHour = (time: Date): Date => new Date(Math.floor(time.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS);

function countOf(counts: Record<string, number>, wanted: string[]): number {
  return wanted.reduce((sum, emoji) => sum + (counts[emoji] ?? 0), 0);
}

function toProposal(row: Row): Proposal {
  return { issue: Number(row.issue), pitch: String(row.pitch), chat: row.chat === null ? null : String(row.chat), messageId: row.message_id === null ? null : Number(row.message_id), postedAt: row.posted_at === null ? null : String(row.posted_at), closedAt: row.closed_at === null ? null : String(row.closed_at) };
}

function toBuildPost(row: Row): BuildPost {
  return { issue: Number(row.issue), build: String(row.build), chat: String(row.chat), messageId: Number(row.message_id), postedAt: String(row.posted_at) };
}

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function toIssueComment(row: Row): IssueComment {
  const comment = toComment(row);
  if (comment.issue === null) throw new Error(`Player comment ${comment.id} has no issue.`);
  return comment as IssueComment;
}

function toComment(row: Row): StoredComment {
  return {
    id: Number(row.id), issue: numberOrNull(row.issue), source: row.source as StoredComment['source'], author: String(row.author), text: String(row.text), at: String(row.at),
    kind: row.kind as CommentKind | null, route: row.route as PublicRoute | null, chat: textOrNull(row.post_chat), messageId: numberOrNull(row.message_id), sender: textOrNull(row.sender),
    addressed: Number(row.addressed) === 1, relevance: row.relevance as Relevance | null, filedIssue: numberOrNull(row.filed_issue), filedAt: textOrNull(row.filed_at), replyId: numberOrNull(row.reply_id),
    context: textOrNull(row.context), workIssue: numberOrNull(row.work_issue), language: row.language === 'ru' || row.language === 'en' ? row.language : null, linked: Number(row.linked) === 1,
  };
}
