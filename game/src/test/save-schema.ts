import { fileURLToPath } from 'node:url';
import ts from 'typescript5';
import type { Schema, SchemaNode } from '../three/save-fit';

type Ctx = {
  checker: ts.TypeChecker;
  program: ts.Program;
  defs: Record<string, SchemaNode>;
  names: Map<ts.Type, string>;
  owners: Map<string, ts.Type>;
  building: Set<ts.Type>;
  tags: Map<ts.Type, Set<string>>;
};

const FLAGS = ts.TypeFlags;
const NAMED_SYMBOLS = ts.SymbolFlags.Interface | ts.SymbolFlags.Class;

function has(type: ts.Type, flags: ts.TypeFlags): boolean {
  return (type.flags & flags) !== 0;
}

function unsupported(type: ts.Type, path: string, ctx: Ctx): never {
  throw new Error(`${path}: the schema cannot hold the type ${ctx.checker.typeToString(type)} (type flags ${type.flags})`);
}

function isProjectSymbol(symbol: ts.Symbol, ctx: Ctx): boolean {
  const files = (symbol.declarations ?? []).map((declaration) => declaration.getSourceFile());
  return files.length > 0 && files.every((file) => !ctx.program.isSourceFileDefaultLibrary(file) && !ctx.program.isSourceFileFromExternalLibrary(file));
}

function defName(type: ts.Type, ctx: Ctx): string | null {
  const alias = type.aliasSymbol;
  const symbol = type.getSymbol();
  const named = alias ?? (symbol && has(type, FLAGS.Object) && (symbol.flags & NAMED_SYMBOLS) !== 0 ? symbol : undefined);
  if (!named || !isProjectSymbol(named, ctx)) return null;
  const args = type.aliasTypeArguments ?? [];
  if (!alias || args.length === 0) return named.name;
  return `${named.name}<${args.map((arg) => ctx.checker.typeToString(arg, undefined, ts.TypeFormatFlags.NoTruncation)).join(',')}>`;
}

function stringify(node: SchemaNode): string {
  return JSON.stringify(node);
}

function distinct(nodes: SchemaNode[]): SchemaNode[] {
  const byText = new Map(nodes.map((node) => [stringify(node), node]));
  return [...byText.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, node]) => node);
}

function propertyNames(type: ts.Type, ctx: Ctx): string[] {
  return ctx.checker.getPropertiesOfType(type).map((symbol) => symbol.name);
}

function literalOf(type: ts.Type, name: string, ctx: Ctx): string | null {
  const symbol = ctx.checker.getPropertyOfType(type, name);
  if (!symbol) return null;
  const propType = ctx.checker.getTypeOfSymbol(symbol);
  return has(propType, FLAGS.StringLiteral) ? (propType as ts.StringLiteralType).value : null;
}

function tagOf(members: ts.Type[], ctx: Ctx): string | null {
  const candidates = propertyNames(members[0], ctx).sort();
  const tag = candidates.find((name) => {
    const values = members.map((member) => literalOf(member, name, ctx));
    return values.every((value) => value !== null) && new Set(values).size === members.length;
  });
  return tag ?? null;
}

function isObjectLike(type: ts.Type): boolean {
  return has(type, FLAGS.Object | FLAGS.Intersection);
}

function registerTag(members: ts.Type[], ctx: Ctx): string | null {
  if (members.length < 2 || !members.every(isObjectLike)) return null;
  const tag = tagOf(members, ctx);
  if (tag === null) return null;
  for (const member of members) {
    const tags = ctx.tags.get(member) ?? new Set<string>();
    if (ctx.names.has(member) && !tags.has(tag)) throw new Error(`The tagged union member ${ctx.checker.typeToString(member)} was read before its tag ${tag} was known`);
    ctx.tags.set(member, tags.add(tag));
  }
  return tag;
}

function convertMembers(members: ts.Type[], path: string, ctx: Ctx): SchemaNode {
  if (members.length === 0) throw new Error(`${path}: the type has no members`);
  const nonNull = members.filter((member) => !has(member, FLAGS.Null));
  const tag = registerTag(nonNull, ctx);
  const nodes = distinct(members.map((member) => convert(member, path, ctx)));
  if (nodes.length === 1) return nodes[0];
  return tag === null ? { union: nodes } : { union: nodes, tag };
}

function convertPrimitive(type: ts.Type): SchemaNode | null {
  if (has(type, FLAGS.String | FLAGS.StringLiteral)) return 'string';
  if (has(type, FLAGS.Number | FLAGS.NumberLiteral)) return 'number';
  if (has(type, FLAGS.Boolean | FLAGS.BooleanLiteral)) return 'boolean';
  if (has(type, FLAGS.Null)) return 'null';
  return null;
}

function convert(type: ts.Type, path: string, ctx: Ctx): SchemaNode {
  const primitive = convertPrimitive(type);
  if (primitive !== null) return primitive;
  if (has(type, FLAGS.Union) && !has(type, FLAGS.EnumLiteral)) return convertNamed(type, path, ctx, () => convertMembers((type as ts.UnionType).types, path, ctx));
  if (isObjectLike(type)) return convertNamed(type, path, ctx, () => convertObjectLike(type, path, ctx));
  return unsupported(type, path, ctx);
}

function convertNamed(type: ts.Type, path: string, ctx: Ctx, build: () => SchemaNode): SchemaNode {
  const known = ctx.names.get(type);
  if (known !== undefined) return { ref: known };
  const name = defName(type, ctx);
  if (name === null) return buildGuarded(type, path, ctx, build);
  const owner = ctx.owners.get(name);
  if (owner !== undefined && owner !== type) throw new Error(`${path}: two different types share the name ${name}`);
  ctx.owners.set(name, type);
  ctx.names.set(type, name);
  const body = buildGuarded(type, path, ctx, build);
  if (typeof body === 'string') {
    ctx.names.delete(type);
    ctx.owners.delete(name);
    return body;
  }
  ctx.defs[name] = body;
  return { ref: name };
}

function buildGuarded(type: ts.Type, path: string, ctx: Ctx, build: () => SchemaNode): SchemaNode {
  if (ctx.building.has(type)) throw new Error(`${path}: the unnamed type ${ctx.checker.typeToString(type)} contains itself`);
  ctx.building.add(type);
  try {
    return build();
  } finally {
    ctx.building.delete(type);
  }
}

function typeArguments(type: ts.Type, ctx: Ctx): readonly ts.Type[] {
  return ctx.checker.getTypeArguments(type as ts.TypeReference);
}

function convertObjectLike(type: ts.Type, path: string, ctx: Ctx): SchemaNode {
  if (ctx.checker.isArrayType(type)) return { array: convert(typeArguments(type, ctx)[0], `${path}[]`, ctx) };
  if (ctx.checker.isTupleType(type)) return { tuple: typeArguments(type, ctx).map((item, i) => convert(item, `${path}[${i}]`, ctx)) };
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return unsupported(type, path, ctx);
  const indexed = indexedRecord(type, path, ctx);
  return indexed ?? convertProperties(type, path, ctx);
}

function indexedRecord(type: ts.Type, path: string, ctx: Ctx): SchemaNode | null {
  const index = ctx.checker.getIndexInfoOfType(type, ts.IndexKind.String) ?? ctx.checker.getIndexInfoOfType(type, ts.IndexKind.Number);
  if (!index) return null;
  if (ctx.checker.getPropertiesOfType(type).length > 0) throw new Error(`${path}: an object with an index and named properties`);
  return { record: convert(index.type, `${path}[]`, ctx) };
}

function isMapped(type: ts.Type): boolean {
  return has(type, FLAGS.Object) && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Mapped) !== 0;
}

function membersWithoutUndefined(type: ts.Type): { members: ts.Type[]; optional: boolean } {
  const all = has(type, FLAGS.Union) && !has(type, FLAGS.Boolean) ? (type as ts.UnionType).types : [type];
  const members = all.filter((member) => !has(member, FLAGS.Undefined));
  return { members, optional: members.length < all.length };
}

type Property = { name: string; node: SchemaNode; optional: boolean };

function convertProperty(owner: ts.Type, symbol: ts.Symbol, path: string, ctx: Ctx): Property {
  const type = ctx.checker.getTypeOfSymbol(symbol);
  const { members, optional } = membersWithoutUndefined(type);
  const here = `${path}.${symbol.name}`;
  const tags = ctx.tags.get(owner);
  const tagged = tags?.has(symbol.name) && members.length === 1 && has(members[0], FLAGS.StringLiteral);
  const node: SchemaNode = tagged ? { lit: (members[0] as ts.StringLiteralType).value } : convertMembers(members, here, ctx);
  return { name: symbol.name, node, optional: optional || (symbol.flags & ts.SymbolFlags.Optional) !== 0 };
}

function convertProperties(type: ts.Type, path: string, ctx: Ctx): SchemaNode {
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

function savedWorldType(program: ts.Program, file: string): ts.Type {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const module = source && checker.getSymbolAtLocation(source);
  const symbol = module && checker.getExportsOfModule(module).find((exported) => exported.name === 'SavedWorld');
  if (!symbol) throw new Error(`${file} exports no SavedWorld type`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function projectProgram(file: string): ts.Program {
  const configPath = fileURLToPath(new URL('../../tsconfig.json', import.meta.url));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL('../..', import.meta.url)));
  return ts.createProgram([file], parsed.options);
}

function sortedDefs(defs: Record<string, SchemaNode>): Record<string, SchemaNode> {
  return Object.fromEntries(Object.entries(defs).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function savedWorldSchema(): Schema {
  const file = fileURLToPath(new URL('../three/save-fit.ts', import.meta.url));
  const program = projectProgram(file);
  const ctx: Ctx = { checker: program.getTypeChecker(), program, defs: {}, names: new Map(), owners: new Map(), building: new Set(), tags: new Map() };
  const root = convert(savedWorldType(program, file), 'SavedWorld', ctx);
  return { root, defs: sortedDefs(ctx.defs) };
}
