import { fileURLToPath } from 'node:url';
import { API, NodeBuilderFlags, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags } from 'typescript/unstable/sync';
import type { Checker, Project, ObjectType, StringLiteralType, Symbol as TsSymbol, Type, TypeReference, UnionType } from 'typescript/unstable/sync';
import type { Schema, SchemaNode } from '../three/save-fit';

type Ctx = {
  checker: Checker;
  root: string;
  defs: Record<string, SchemaNode>;
  names: Map<number, string>;
  owners: Map<string, number>;
  building: Set<number>;
  tags: Map<number, Set<string>>;
};

const FLAGS = TypeFlags;
const NAMED_SYMBOLS = SymbolFlags.Interface | SymbolFlags.Class;

function typeOf(symbol: TsSymbol, ctx: Ctx): Type {
  const type = ctx.checker.getTypeOfSymbol(symbol);
  if (!type) throw new Error(`${symbol.name}: the symbol has no type`);
  return type;
}

function unionMembers(type: Type): readonly Type[] {
  return (type as UnionType).getTypes();
}

function has(type: Type, flags: TypeFlags): boolean {
  return (type.flags & flags) !== 0;
}

function unsupported(type: Type, path: string, ctx: Ctx): never {
  throw new Error(`${path}: the schema cannot hold the type ${ctx.checker.typeToString(type)} (type flags ${type.flags})`);
}

function isProjectSymbol(symbol: TsSymbol, ctx: Ctx): boolean {
  const paths = symbol.declarations.map((declaration) => String(declaration.path));
  return paths.length > 0 && paths.every((path) => path.startsWith(ctx.root) && !path.includes('/node_modules/'));
}

function defName(type: Type, ctx: Ctx): string | null {
  const alias = type.getAliasSymbol();
  const symbol = type.getSymbol();
  const named = alias ?? (symbol && has(type, FLAGS.Object) && (symbol.flags & NAMED_SYMBOLS) !== 0 ? symbol : undefined);
  if (!named || !isProjectSymbol(named, ctx)) return null;
  const args = type.getAliasTypeArguments();
  if (!alias || args.length === 0) return named.name;
  return `${named.name}<${args.map((arg) => ctx.checker.typeToString(arg, undefined, NodeBuilderFlags.NoTruncation)).join(',')}>`;
}

function stringify(node: SchemaNode): string {
  return JSON.stringify(node);
}

function distinct(nodes: SchemaNode[]): SchemaNode[] {
  const byText = new Map(nodes.map((node) => [stringify(node), node]));
  return [...byText.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, node]) => node);
}

function propertyNames(type: Type, ctx: Ctx): string[] {
  return ctx.checker.getPropertiesOfType(type).map((symbol) => symbol.name);
}

function literalsOf(type: Type, name: string, ctx: Ctx): string[] | null {
  const symbol = ctx.checker.getPropertyOfType(type, name);
  if (!symbol || (symbol.flags & SymbolFlags.Optional) !== 0) return null;
  const propType = typeOf(symbol, ctx);
  const parts = has(propType, FLAGS.Union) ? unionMembers(propType) : [propType];
  if (!parts.every((part) => has(part, FLAGS.StringLiteral))) return null;
  return parts.map((part) => (part as StringLiteralType).value);
}

function isTag(members: Type[], name: string, ctx: Ctx): boolean {
  const sets = members.map((member) => literalsOf(member, name, ctx));
  if (sets.some((set) => set === null)) return false;
  const all = sets.flatMap((set) => set ?? []);
  return new Set(all).size === all.length;
}

function tagOf(members: Type[], ctx: Ctx): string | null {
  const candidates = propertyNames(members[0], ctx).sort();
  return candidates.find((name) => isTag(members, name, ctx)) ?? null;
}

function tagNode(members: Type[]): SchemaNode {
  const literals = distinct(members.map((member) => ({ lit: (member as StringLiteralType).value })));
  return literals.length === 1 ? literals[0] : { union: literals };
}

function isObjectLike(type: Type): boolean {
  return has(type, FLAGS.Object | FLAGS.Intersection);
}

function registerTag(members: Type[], ctx: Ctx): string | null {
  if (members.length < 2 || !members.every(isObjectLike)) return null;
  const tag = tagOf(members, ctx);
  if (tag === null) return null;
  for (const member of members) {
    const tags = ctx.tags.get(member.id) ?? new Set<string>();
    if (ctx.names.has(member.id) && !tags.has(tag)) throw new Error(`The tagged union member ${ctx.checker.typeToString(member)} was read before its tag ${tag} was known`);
    ctx.tags.set(member.id, tags.add(tag));
  }
  return tag;
}

function convertMembers(members: readonly Type[], path: string, ctx: Ctx): SchemaNode {
  if (members.length === 0) throw new Error(`${path}: the type has no members`);
  const nonNull = members.filter((member) => !has(member, FLAGS.Null));
  const tag = registerTag(nonNull, ctx);
  const nodes = distinct(members.map((member) => convert(member, path, ctx)));
  if (nodes.length === 1) return nodes[0];
  return tag === null ? { union: nodes } : { union: nodes, tag };
}

function convertPrimitive(type: Type): SchemaNode | null {
  if (has(type, FLAGS.String | FLAGS.StringLiteral)) return 'string';
  if (has(type, FLAGS.Number | FLAGS.NumberLiteral)) return 'number';
  if (has(type, FLAGS.Boolean | FLAGS.BooleanLiteral)) return 'boolean';
  if (has(type, FLAGS.Null)) return 'null';
  return null;
}

function convert(type: Type, path: string, ctx: Ctx): SchemaNode {
  const primitive = convertPrimitive(type);
  if (primitive !== null) return primitive;
  if (has(type, FLAGS.Union) && !has(type, FLAGS.EnumLiteral)) return convertNamed(type, path, ctx, () => convertMembers(unionMembers(type), path, ctx));
  if (isObjectLike(type)) return convertNamed(type, path, ctx, () => convertObjectLike(type, path, ctx));
  return unsupported(type, path, ctx);
}

function convertNamed(type: Type, path: string, ctx: Ctx, build: () => SchemaNode): SchemaNode {
  const known = ctx.names.get(type.id);
  if (known !== undefined) return { ref: known };
  const name = defName(type, ctx);
  if (name === null) return buildGuarded(type, path, ctx, build);
  const owner = ctx.owners.get(name);
  if (owner !== undefined && owner !== type.id) throw new Error(`${path}: two different types share the name ${name}`);
  ctx.owners.set(name, type.id);
  ctx.names.set(type.id, name);
  const body = buildGuarded(type, path, ctx, build);
  if (typeof body === 'string') {
    ctx.names.delete(type.id);
    ctx.owners.delete(name);
    return body;
  }
  ctx.defs[name] = body;
  return { ref: name };
}

function buildGuarded(type: Type, path: string, ctx: Ctx, build: () => SchemaNode): SchemaNode {
  if (ctx.building.has(type.id)) throw new Error(`${path}: the unnamed type ${ctx.checker.typeToString(type)} contains itself`);
  ctx.building.add(type.id);
  try {
    return build();
  } finally {
    ctx.building.delete(type.id);
  }
}

function typeArguments(type: Type, ctx: Ctx): readonly Type[] {
  return ctx.checker.getTypeArguments(type as TypeReference);
}

function convertObjectLike(type: Type, path: string, ctx: Ctx): SchemaNode {
  if (ctx.checker.isArrayType(type)) return { array: convert(typeArguments(type, ctx)[0], `${path}[]`, ctx) };
  if (ctx.checker.isTupleType(type)) return { tuple: typeArguments(type, ctx).map((item, i) => convert(item, `${path}[${i}]`, ctx)) };
  if (ctx.checker.getSignaturesOfType(type, SignatureKind.Call).length > 0 || ctx.checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) return unsupported(type, path, ctx);
  const indexed = indexedRecord(type, path, ctx);
  return indexed ?? convertProperties(type, path, ctx);
}

function indexedRecord(type: Type, path: string, ctx: Ctx): SchemaNode | null {
  const infos = ctx.checker.getIndexInfosOfType(type);
  const index = infos.find((info) => has(info.keyType, FLAGS.String)) ?? infos.find((info) => has(info.keyType, FLAGS.Number));
  if (!index) return null;
  if (ctx.checker.getPropertiesOfType(type).length > 0) throw new Error(`${path}: an object with an index and named properties`);
  return { record: convert(index.valueType, `${path}[]`, ctx) };
}

function isMapped(type: Type): boolean {
  return has(type, FLAGS.Object) && ((type as ObjectType).objectFlags & ObjectFlags.Mapped) !== 0;
}

function membersWithoutUndefined(type: Type): { members: Type[]; optional: boolean } {
  const all = has(type, FLAGS.Union) && !has(type, FLAGS.Boolean) ? unionMembers(type) : [type];
  const members = all.filter((member) => !has(member, FLAGS.Undefined));
  return { members, optional: members.length < all.length };
}

type Property = { name: string; node: SchemaNode; optional: boolean };

function convertProperty(owner: Type, symbol: TsSymbol, path: string, ctx: Ctx): Property {
  const type = typeOf(symbol, ctx);
  const { members, optional } = membersWithoutUndefined(type);
  const here = `${path}.${symbol.name}`;
  const tags = ctx.tags.get(owner.id);
  const tagged = tags?.has(symbol.name) && members.every((member) => has(member, FLAGS.StringLiteral));
  const node: SchemaNode = tagged ? tagNode(members) : convertMembers(members, here, ctx);
  return { name: symbol.name, node, optional: optional || (symbol.flags & SymbolFlags.Optional) !== 0 };
}

function convertProperties(type: Type, path: string, ctx: Ctx): SchemaNode {
  const symbols = [...ctx.checker.getPropertiesOfType(type)].sort((a, b) => (a.name < b.name ? -1 : 1));
  const properties = symbols.map((symbol) => convertProperty(type, symbol, path, ctx));
  if (isMapped(type) && properties.length > 0 && properties.every((property) => property.optional)) {
    const values = distinct(properties.map((property) => property.node));
    return { record: values.length === 1 ? values[0] : { union: values } };
  }
  const required = properties.filter((property) => !property.optional);
  const optional = properties.filter((property) => property.optional);
  const node = { object: Object.fromEntries(required.map((p) => [p.name, p.node])) };
  return optional.length === 0 ? node : { ...node, optional: Object.fromEntries(optional.map((p) => [p.name, p.node])) };
}

function savedWorldType(project: Project, file: string): Type {
  const { checker, program } = project;
  const source = program.getSourceFile(file);
  const module = source && checker.getSymbolAtLocation(source);
  const symbol = module && checker.getExportsOfModule(module).find((exported) => exported.name === 'SavedWorld');
  if (!symbol) throw new Error(`${file} exports no SavedWorld type`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function sortedDefs(defs: Record<string, SchemaNode>): Record<string, SchemaNode> {
  return Object.fromEntries(Object.entries(defs).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function savedWorldSchema(): Schema {
  const file = fileURLToPath(new URL('../three/save-fit.ts', import.meta.url));
  const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
  const api = new API({ cwd: root });
  try {
    const project = api.updateSnapshot({ openProject: `${root}/tsconfig.json` }).getProject(`${root}/tsconfig.json`);
    if (!project) throw new Error('The game tsconfig.json opened no project');
    const ctx: Ctx = { checker: project.checker, root, defs: {}, names: new Map(), owners: new Map(), building: new Set(), tags: new Map() };
    const node = convert(savedWorldType(project, file), 'SavedWorld', ctx);
    return { root: node, defs: sortedDefs(ctx.defs) };
  } finally {
    api.close();
  }
}
