import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
let database: DatabaseSync;
export function db() {
  if (database) return database;
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  database = new DatabaseSync(
    process.env.CROSSFLOW_DB ?? join(process.cwd(), 'data/crossflow.sqlite'),
  );
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS TradeDecision(id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, mode TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketSnapshot(id TEXT PRIMARY KEY REFERENCES TradeDecision(id), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS TradeEvent(id TEXT PRIMARY KEY, decisionId TEXT REFERENCES TradeDecision(id), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Trade(id TEXT PRIMARY KEY, decisionId TEXT REFERENCES TradeDecision(id), status TEXT NOT NULL, mode TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS TradeJournal(tradeId TEXT PRIMARY KEY REFERENCES Trade(id), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS MacroEvent(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS MacroEventRevision(id TEXT PRIMARY KEY, eventId TEXT REFERENCES MacroEvent(id), recordedAt INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS StrategyMemory(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Cashflow(id TEXT PRIMARY KEY, tradeId TEXT REFERENCES Trade(id), timestamp INTEGER NOT NULL, amount REAL NOT NULL);
CREATE TABLE IF NOT EXISTS Settings(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS EquitySnapshot(timestamp INTEGER PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS RunLock(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
`);
  return database;
}
export function all<T>(
  table: 'TradeDecision' | 'Trade' | 'TradeJournal' | 'MacroEvent' | 'StrategyMemory',
): T[] {
  return (
    db().prepare(`SELECT payload FROM ${table} ORDER BY rowid DESC`).all() as { payload: string }[]
  ).map((v) => JSON.parse(v.payload));
}
export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
