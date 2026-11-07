import type { GroundBake } from "../render/groundPaint";
import { noteError } from "./crash";

const DB = "roam-ground";
const STORE = "bake";
const ROW = "ground";
const READ_LIMIT_MS = 1500;

type Row = { key: string; bake: GroundBake };

function asked<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return asked(open);
}

async function read(key: string): Promise<GroundBake | null> {
  const db = await openDb();
  const row = (await asked(db.transaction(STORE).objectStore(STORE).get(ROW))) as Row | undefined;
  db.close();
  return row?.key === key ? row.bake : null;
}

export async function readGroundCache(key: string): Promise<GroundBake | null> {
  let timer = 0;
  const late = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => resolve(null), READ_LIMIT_MS);
  });
  try {
    return await Promise.race([read(key), late]);
  } catch (err) {
    noteError(err);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function writeGroundCache(key: string, bake: GroundBake): Promise<void> {
  try {
    const db = await openDb();
    await asked(db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, bake } satisfies Row, ROW));
    db.close();
  } catch (err) {
    noteError(err);
  }
}
