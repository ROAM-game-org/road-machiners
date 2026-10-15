
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Compiler, CompilerOptions, type Story } from 'inkjs/full';
import { ErrorType } from 'inkjs/compiler/Parser/ErrorType';
import { CHECKPOINT_TAG, MONEY_STAT, QUEST_LANGUAGES, QUEST_VIEWS, type CompiledQuest, type QuestLanguage, type QuestLinks, type QuestValue, type QuestText, type QuestBundle, type QuestFact, type QuestScene, type QuestStat, type QuestValueType, type QuestVarDecl, type QuestViewKind } from '../data/quests';

export type QuestSources = Record<string, string>;
export type QuestSections = Record<QuestLanguage, string[]>;
export type CompileResult = { quest: CompiledQuest | null; errors: string[]; warnings: string[]; sections: QuestSections };
export type SourcesResult = { bundle: QuestBundle; errors: string[]; warnings: string[]; sections: Record<string, QuestSections> };

type ParsedVar = { listDefinition: unknown };
type ParsedFlow = { isFunction: boolean; subFlowsByName: Map<string, ParsedFlow> };
type ParsedNode = {
  typeName: string;
  content: ParsedNode[];
  debugMetadata: { startLineNumber: number; fileName: string | null } | null;
  name?: string;
  variableName?: string;
  isNewTemporaryDeclaration?: boolean;
  expression?: ParsedNode | null;
  args?: ParsedNode[];
  value?: unknown;
  isSingleString?: boolean;
  onceOnly?: boolean;
  runtimeVarRef?: { pathForCount: unknown } | null;
  isReadCount?: boolean;
  isTurnsSince?: boolean;
};
type ParsedRoot = ParsedNode & { variableDeclarations: Map<string, ParsedVar>; externals: Map<string, unknown>; subFlowsByName: Map<string, ParsedFlow> };
type Parsed = { story: Story; vars: string[]; externals: string[]; flows: Map<string, ParsedFlow>; root: ParsedNode };

export const WORLD_FILE = 'world.ink';

export function readQuestSources(dir: string): QuestSources {
  const twinDirs = QUEST_LANGUAGES.filter((lang) => lang !== 'en');
  const files = [...inkFiles(dir, ''), ...twinDirs.flatMap((lang) => inkFiles(join(dir, lang), `${lang}/`))];
  return Object.fromEntries(files.map(([key, path]) => [key, readFileSync(path, 'utf8')]));
}

export function withEnglishTwins(sources: QuestSources): QuestSources {
  const twins = questIds(sources).flatMap((id) => QUEST_LANGUAGES.filter((lang) => lang !== 'en').map((lang) => [twinFile(id, lang), sources[`${id}.ink`]]));
  return { ...sources, ...Object.fromEntries(twins) };
}

function inkFiles(dir: string, prefix: string): [string, string][] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => file.endsWith('.ink')).sort().map((file) => [`${prefix}${file}`, join(dir, file)]);
}

export function questIds(sources: QuestSources): string[] {
  return Object.keys(sources).filter((file) => file !== WORLD_FILE && !file.includes('/')).map((file) => file.replace(/\.ink$/, ''));
}

export function compileBundle(sources: QuestSources): QuestBundle {
  const { bundle, errors } = compileSources(sources, false);
  if (errors.length > 0) throw new Error(`Quests do not compile:\n${errors.join('\n')}`);
  return bundle;
}

export function compileSources(sources: QuestSources, countAllVisits: boolean): SourcesResult {
  const world = parseInk(WORLD_FILE, sources, countAllVisits);
  if (!world.parsed) return { bundle: { world: {}, externals: [], quests: {} }, errors: world.errors.map((e) => `world: ${e}`), warnings: [], sections: {} };
  const ids = questIds(sources);
  const strays = Object.keys(sources).filter((file) => file.includes('/') && !ids.includes(file.replace(/^[a-z]+\/|\.ink$/g, ''))).map((file) => `${file}: no English quest of that name`);
  const results = ids.map((id) => [id, compileQuest(id, sources, countAllVisits)] as const);
  const compiled = results.flatMap(([id, r]) => (r.quest ? [[id, r.quest] as const] : []));
  return {
    bundle: { world: declarations(world.parsed.story, world.parsed.vars), externals: [...world.parsed.externals].sort(), quests: Object.fromEntries(compiled) },
    errors: [...strays, ...results.flatMap(([id, r]) => r.errors.map((e) => `${id}: ${e}`))],
    warnings: results.flatMap(([id, r]) => r.warnings.map((w) => `${id}: ${w}`)),
    sections: Object.fromEntries(results.map(([id, r]) => [id, r.sections])),
  };
}

export function twinFile(id: string, lang: QuestLanguage): string {
  return lang === 'en' ? `${id}.ink` : `${lang}/${id}.ink`;
}

type QuestShape = Omit<CompiledQuest, 'text'>;
type Twin = { lang: QuestLanguage; shape: QuestShape; text: QuestText } | { lang: QuestLanguage; shape: null; text: null };
type TwinResult = { twin: Twin; errors: string[]; warnings: string[]; sections: string[] };

export function compileQuest(id: string, sources: QuestSources, countAllVisits: boolean): CompileResult {
  const results = QUEST_LANGUAGES.map((lang) => compileTwin(id, lang, sources, countAllVisits));
  const named = (lang: QuestLanguage, message: string) => (lang === 'en' ? message : `${twinFile(id, lang)}: ${message}`);
  const errors = results.flatMap((r) => r.errors.map((e) => named(r.twin.lang, e)));
  const warnings = results.flatMap((r) => r.warnings.map((w) => named(r.twin.lang, w)));
  const sections = Object.fromEntries(results.map((r) => [r.twin.lang, r.sections])) as Record<QuestLanguage, string[]>;
  const twins = results.map((r) => r.twin);
  if (errors.length > 0 || !twins.every(hasShape)) return { quest: null, errors, warnings, sections };
  const [en, ...others] = twins;
  const mismatches = others.flatMap((t) => twinMismatches(en, t).map((m) => named(t.lang, m)));
  if (mismatches.length > 0) return { quest: null, errors: mismatches, warnings, sections };
  const text = Object.fromEntries(twins.map((t) => [t.lang, t.text])) as Record<QuestLanguage, QuestText>;
  return { quest: { ...en.shape, text }, errors: [], warnings, sections };
}

function hasShape(twin: Twin): twin is Extract<Twin, { shape: QuestShape }> {
  return twin.shape !== null;
}

function compileTwin(id: string, lang: QuestLanguage, sources: QuestSources, countAllVisits: boolean): TwinResult {
  const failed = (errors: string[], warnings: string[], sections: string[]): TwinResult => ({ twin: { lang, shape: null, text: null }, errors, warnings, sections });
  const file = twinFile(id, lang);
  const world = parseInk(WORLD_FILE, sources, countAllVisits);
  const own = parseInk(file, sources, countAllVisits);
  if (!own.parsed || !world.parsed) return failed([...world.errors, ...own.errors], own.warnings, []);
  const worldVars = new Set(world.parsed.vars);
  const local = own.parsed.vars.filter((name) => !worldVars.has(name));
  const sections = sectionsOf(own.parsed.flows);
  const header = headerOf(own.parsed.story);
  header.errors.push(...strayHeaderErrors(sources[file], own.parsed.story));
  const links = linksOf(own.parsed, worldVars, header);
  const ruleErrors = [...varErrors(own.parsed), ...checkpointErrors(own.parsed), ...countErrors(own.parsed), ...header.errors, ...links.errors];
  if (ruleErrors.length > 0) return failed(ruleErrors, own.warnings, sections);
  const story = own.parsed.story.ToJson();
  if (!story) throw new Error(`Quest ${file} compiled to no story`);
  const shape = { vars: declarations(own.parsed.story, local), checkpoints: checkpointsOf(own.parsed), view: header.view, art: artOf(sources[file]), revision: header.revision, links: links.links };
  return { twin: { lang, shape, text: { story, stats: header.stats, facts: header.facts, scenes: scenesOf(sources[file]) } }, errors: [], warnings: own.warnings, sections };
}

function twinMismatches(en: Extract<Twin, { shape: QuestShape }>, twin: Extract<Twin, { shape: QuestShape }>): string[] {
  const outline = (t: Extract<Twin, { shape: QuestShape }>): Record<string, string> => ({
    variables: JSON.stringify(t.shape.vars),
    checkpoints: JSON.stringify(t.shape.checkpoints),
    view: t.shape.view,
    art: JSON.stringify(t.shape.art),
    revision: String(t.shape.revision),
    links: JSON.stringify(t.shape.links),
    'checkpoint art': JSON.stringify(Object.entries(t.text.scenes).map(([checkpoint, scene]) => [checkpoint, scene.img])),
    stats: JSON.stringify(t.text.stats.map((s) => [s.name, s.words?.length ?? null])),
    facts: JSON.stringify(t.text.facts.map((f) => f.name)),
  });
  const a = outline(en);
  const b = outline(twin);
  return Object.keys(a).filter((key) => a[key] !== b[key]).map((key) => `its ${key} part does not match the English quest: ${b[key]} against ${a[key]}`);
}

type Header = { view: QuestViewKind; revision: number; stats: QuestStat[]; facts: QuestFact[]; errors: string[] };

function headerOf(story: Story): Header {
  const header: Header = { view: 'talk', revision: 1, stats: [], facts: [], errors: [] };
  for (const tag of story.globalTags ?? []) readHeaderTag(header, story, tag);
  return header;
}

const HEADER_LINE = /^\s*#\s*(view|revision|stat|fact)\s*:/;

function strayHeaderErrors(source: string, story: Story): string[] {
  const written = source.split('\n').filter((line) => HEADER_LINE.test(line)).length;
  const read = (story.globalTags ?? []).length;
  return written > read ? ['A view, revision, stat or fact tag sits below other content, so the quest ignores it. Put them all at the very top, above INCLUDE world.ink.'] : [];
}

const ART_TAG = /#\s*img\s*:\s*([a-z0-9_]+)/g;

function artOf(source: string): string[] {
  return [...new Set([...source.matchAll(ART_TAG)].map((m) => m[1]))];
}

const SCENE_ART_TAG = /#\s*img\s*:\s*([a-z0-9_]+)/;
const SCENE_PLACE_TAG = /#\s*place\s*:\s*([^#]+)/;
const SCENE_CHECKPOINT_TAG = /#\s*checkpoint\s*:\s*([\w.]+)/;

function scenesOf(source: string): Record<string, QuestScene> {
  const scenes: Record<string, QuestScene> = {};
  let scene: QuestScene = { img: null, place: null };
  for (const line of source.split('\n')) {
    const checkpoint = line.match(SCENE_CHECKPOINT_TAG)?.[1];
    if (checkpoint !== undefined) scenes[checkpoint] = scene;
    const img = line.match(SCENE_ART_TAG)?.[1] ?? scene.img;
    const place = line.match(SCENE_PLACE_TAG)?.[1].trim() ?? scene.place;
    scene = { img, place };
  }
  return scenes;
}

function readHeaderTag(header: Header, story: Story, tag: string): void {
  const [key, ...rest] = tag.split(':');
  const value = rest.join(':').trim();
  const [name, ...words] = value.split(/\s+/);
  const text = words.join(' ');
  if (key === 'view') return readView(header, value);
  if (key === 'revision') return readRevision(header, value);
  if (key === 'stat') return readStat(header, story, name, text);
  if (key === 'fact') return readFact(header, story, name, text);
  header.errors.push(`Quest tag # ${tag} is unknown. A quest's top tags are view, revision, stat and fact.`);
}

function readRevision(header: Header, value: string): void {
  const revision = Number(value);
  if (/^\d+$/.test(value) && revision >= 1) header.revision = revision;
  else header.errors.push(`# revision: ${value} needs a whole number from 1 up`);
}

function readView(header: Header, value: string): void {
  if (QUEST_VIEWS.includes(value as QuestViewKind)) header.view = value as QuestViewKind;
  else header.errors.push(`# view: ${value} needs one of ${QUEST_VIEWS.join(', ')}`);
}

function readStat(header: Header, story: Story, name: string, text: string): void {
  const [label, words] = text.split(':').map((part) => part.trim());
  const list = words === undefined ? null : words.split(',').map((w) => w.trim());
  const value = name === MONEY_STAT ? 0 : story.variablesState.$(name);
  if (typeof value !== 'number' || !label) header.errors.push(`# stat: ${name} needs a number variable or money, then a label`);
  else header.stats.push({ name, label, words: list });
}

function readFact(header: Header, story: Story, name: string, text: string): void {
  if (typeof story.variablesState.$(name) !== 'boolean' || !text) header.errors.push(`# fact: ${name} needs a true or false variable, then the fact`);
  else header.facts.push({ name, text });
}

function parseInk(file: string, sources: QuestSources, countAllVisits: boolean): { parsed: Parsed | null; errors: string[]; warnings: string[] } {
  const source = sources[file];
  if (source === undefined) return { parsed: null, errors: [`No source file ${file}`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileHandler = { ResolveInkFilename: (name: string) => name, LoadInkFileContents: (name: string) => includedSource(sources, name) };
  const onError = (message: string, type: ErrorType) => (type === ErrorType.Error ? errors : warnings).push(message);
  const compiler = new Compiler(source, new CompilerOptions(file, [], countAllVisits, onError, fileHandler));
  const story = compileOrReport(compiler, errors);
  if (!story) return { parsed: null, errors, warnings };
  const parsed = compiler.parsedStory as unknown as ParsedRoot;
  const lists = [...parsed.variableDeclarations].filter(([, decl]) => decl.listDefinition).map(([name]) => `List ${name} cannot be saved. Use int, float, bool or string variables.`);
  if (lists.length > 0) return { parsed: null, errors: lists, warnings };
  return { parsed: { story, vars: [...parsed.variableDeclarations.keys()], externals: [...parsed.externals.keys()], flows: parsed.subFlowsByName, root: parsed }, errors, warnings };
}

function countErrors(parsed: Parsed): string[] {
  return nodesOf(parsed.root).flatMap((node) => {
    const at = `Line ${node.debugMetadata?.startLineNumber ?? '?'}`;
    if (node.typeName === 'Choice' && node.onceOnly) return [`${at}: a once-only * choice comes back after a load. Use a sticky + choice with a variable guard.`];
    return readsCount(node) ? [`${at}: ${node.name ?? 'this'} reads a visit count, which a load resets. Keep the fact in a variable.`] : [];
  });
}

function readsCount(node: ParsedNode): boolean {
  if (node.typeName === 'ref') return node.runtimeVarRef?.pathForCount != null;
  return node.typeName === 'FunctionCall' && (node.isReadCount === true || node.isTurnsSince === true);
}

const LINK_CALLS = { note: 'notes', has_note: 'readsNotes', begin: 'begins' } as const;
type LinkCall = keyof typeof LINK_CALLS;
type LinkSets = { reads: Set<string>; readsNotes: Set<string>; notes: Set<string>; begins: Set<string>; writes: Map<string, Set<QuestValue>>; errors: string[] };

function linksOf(parsed: Parsed, worldVars: ReadonlySet<string>, header: Header): { links: QuestLinks; errors: string[] } {
  const sets: LinkSets = { reads: new Set(), readsNotes: new Set(), notes: new Set(), begins: new Set(), writes: new Map(), errors: [] };
  for (const node of nodesOf(parsed.root).filter((n) => n.debugMetadata?.fileName !== WORLD_FILE)) readLink(sets, node, worldVars);
  for (const name of [...header.stats.map((s) => s.name), ...header.facts.map((f) => f.name)]) if (worldVars.has(name)) sets.reads.add(name);
  const sorted = (set: Set<string>) => [...set].sort();
  const writes = Object.fromEntries([...sets.writes].sort(([a], [b]) => a.localeCompare(b)).map(([name, values]) => [name, [...values].sort()]));
  return { links: { reads: sorted(sets.reads), readsNotes: sorted(sets.readsNotes), writes, notes: sorted(sets.notes), begins: sorted(sets.begins) }, errors: sets.errors };
}

function readLink(sets: LinkSets, node: ParsedNode, worldVars: ReadonlySet<string>): void {
  const at = `Line ${node.debugMetadata?.startLineNumber ?? '?'}`;
  if (node.typeName === 'ref' && node.name !== undefined && worldVars.has(node.name)) sets.reads.add(node.name);
  if (node.typeName === 'variable assignment' && !node.isNewTemporaryDeclaration && node.variableName !== undefined && worldVars.has(node.variableName)) readWrite(sets, node.variableName, node.expression ?? null, at);
  if (node.typeName === 'FunctionCall' && node.name !== undefined && node.name in LINK_CALLS) readCall(sets, node.name as LinkCall, node.args ?? [], at);
}

function readWrite(sets: LinkSets, name: string, expression: ParsedNode | null, at: string): void {
  const value = expression === null ? null : literalOf(expression);
  if (value === null) {
    sets.errors.push(`${at}: world variable ${name} gets a value worked out in play. Give it a plain value, so a save repair can tell which quest wrote it.`);
    return;
  }
  sets.writes.set(name, (sets.writes.get(name) ?? new Set<QuestValue>()).add(value));
}

function readCall(sets: LinkSets, name: LinkCall, args: ParsedNode[], at: string): void {
  const id = args.length === 1 ? literalOf(args[0]) : null;
  if (typeof id === 'string') sets[LINK_CALLS[name]].add(id);
  else sets.errors.push(`${at}: ${name}() needs one plain text id, so a save repair can tell which quest it links.`);
}

function literalOf(node: ParsedNode): QuestValue | null {
  if (node.typeName === 'Number' && isSaveable(node.value)) return node.value;
  if (node.typeName === 'String' && node.isSingleString === true) return String(node);
  return null;
}

function nodesOf(node: ParsedNode): ParsedNode[] {
  return [node, ...node.content.flatMap(nodesOf)];
}

function compileOrReport(compiler: Compiler, errors: readonly string[]): Story | null {
  try {
    return compiler.Compile();
  } catch (err) {
    if (errors.length > 0) return null;
    throw err;
  }
}

function includedSource(sources: QuestSources, name: string): string {
  const source = sources[name];
  if (source === undefined) throw new Error(`INCLUDE names ${name}, which is no quest source`);
  return source;
}

function declarations(story: Story, names: readonly string[]): Record<string, QuestVarDecl> {
  return Object.fromEntries([...names].sort().map((name) => {
    const init = story.variablesState.$(name);
    if (!isSaveable(init)) throw new Error(`Variable ${name} holds a value that cannot be saved`);
    return [name, { type: typeof init as QuestValueType, init }];
  }));
}

function isSaveable(value: unknown): value is QuestVarDecl['init'] {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function varErrors(parsed: Parsed): string[] {
  return parsed.vars.flatMap((name) => {
    return isSaveable(parsed.story.variablesState.$(name)) ? [] : [`Variable ${name} holds a divert or another value that cannot be saved. Use int, float, bool or string.`];
  });
}

export function sectionsOf(flows: Map<string, ParsedFlow>): string[] {
  return [...flows].filter(([, flow]) => !flow.isFunction).flatMap(([knot, flow]) => [knot, ...[...flow.subFlowsByName.keys()].map((stitch) => `${knot}.${stitch}`)]);
}

function checkpointTag(story: Story, path: string): string | null {
  const tag = (story.TagsForContentAtPath(path) ?? []).find((t) => t.startsWith(CHECKPOINT_TAG));
  return tag === undefined ? null : tag.slice(CHECKPOINT_TAG.length).trim();
}

function checkpointsOf(parsed: Parsed): string[] {
  return sectionsOf(parsed.flows).filter((path) => checkpointTag(parsed.story, path) === path);
}

function checkpointErrors(parsed: Parsed): string[] {
  return sectionsOf(parsed.flows).flatMap((path) => {
    const name = checkpointTag(parsed.story, path);
    return name === null || name === path ? [] : [`Section ${path} carries the checkpoint tag of ${name}. A checkpoint tag names its own section.`];
  });
}
