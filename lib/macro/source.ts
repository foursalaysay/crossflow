import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db, all, transaction } from '../db';
import { MacroEvent, macroSchema } from '../types';
import schedule from '../../data/macro/bls-schedule.json';
export const FED_FEED = 'https://www.federalreserve.gov/feeds/press_monetary.xml';
export function parseFedFeed(xml: string, now = Date.now()): MacroEvent[] {
  if (xml.length > 1000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error('Unsafe or oversized feed');
  const parsed = new XMLParser({ ignoreAttributes: true, processEntities: true }).parse(xml);
  const raw = parsed?.rss?.channel?.item;
  if (!raw) throw Error('Monetary feed contains no items');
  return z
    .array(z.object({ title: z.string(), link: z.url(), pubDate: z.string() }))
    .parse(Array.isArray(raw) ? raw : [raw])
    .flatMap((item) => {
      const timestamp = Date.parse(item.pubDate),
        url = new URL(item.link);
      if (
        !Number.isFinite(timestamp) ||
        timestamp > now ||
        url.hostname !== 'www.federalreserve.gov' ||
        url.protocol !== 'https:'
      )
        return [];
      const eventType = /FOMC statement/i.test(item.title)
        ? 'FOMC_STATEMENT'
        : /projections/i.test(item.title)
          ? 'FED_PROJECTIONS'
          : /minutes/i.test(item.title)
            ? 'FOMC_MINUTES'
            : 'FED_MONETARY_POLICY';
      return [
        {
          id: `fed-${createHash('sha256').update(item.link).digest('hex').slice(0, 20)}`,
          timestamp: new Date(timestamp).toISOString(),
          eventType,
          title: item.title.replace(/&#39;|&apos;/g, "'"),
          country: 'US',
          importance: eventType === 'FOMC_STATEMENT' ? ('HIGH' as const) : ('MEDIUM' as const),
          actual: null,
          forecast: null,
          previous: null,
          surprise: null,
          source: item.link,
          affectedAssets: [],
          status: 'RELEASED' as const,
        },
      ];
    });
}
export function saveMacro(event: MacroEvent) {
  const d = db(),
    payload = JSON.stringify(event),
    previous = d.prepare('SELECT payload FROM MacroEvent WHERE id=?').get(event.id) as
      { payload: string } | undefined;
  if (previous?.payload === payload) return false;
  if (previous)
    d.prepare('INSERT INTO MacroEventRevision VALUES(?,?,?,?)').run(
      crypto.randomUUID(),
      event.id,
      Date.now(),
      previous.payload,
    );
  d.prepare(
    'INSERT INTO MacroEvent VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
  ).run(event.id, payload);
  return true;
}
export function macroFeedStatus() {
  const row = db().prepare('SELECT payload FROM Settings WHERE id=?').get('macro-feed') as
    { payload: string } | undefined;
  return row
    ? JSON.parse(row.payload)
    : { status: 'UNAVAILABLE', lastAttemptAt: null, lastSuccessAt: null, error: null };
}
export async function syncMacro(force = false) {
  const last = macroFeedStatus();
  if (!force && last.lastAttemptAt && Date.now() - last.lastAttemptAt < 3600000) return last;
  const now = Date.now();
  try {
    const response = await fetch(FED_FEED, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error(`Federal Reserve HTTP ${response.status}`);
    const events = parseFedFeed(await response.text(), now);
    let changed = 0;
    transaction(() => {
      for (const e of events) if (saveMacro(e)) changed++;
      for (const e of schedule.events) {
        const event = {
          ...macroSchema.parse({
            ...e,
            country: 'US',
            actual: null,
            forecast: null,
            previous: null,
            source: schedule.source,
            affectedAssets: [],
            status: 'UPCOMING',
          }),
          surprise: null,
          provenance: {
            type: 'VERIFIED_SCHEDULE_SNAPSHOT',
            verifiedAt: schedule.verifiedAt,
            note: schedule.notes,
          },
        };
        if (!all<MacroEvent>('MacroEvent').some((existing) => existing.id === e.id))
          saveMacro(event);
      }
    });
    const result = {
      status: 'VALID',
      lastAttemptAt: now,
      lastSuccessAt: now,
      events: events.length,
      changed,
      error: null,
      scheduledSource: 'BLS verified snapshot',
      scheduledVerifiedAt: schedule.verifiedAt,
      calendarAutoRefresh: false,
    };
    db()
      .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
      .run('macro-feed', JSON.stringify(result));
    return result;
  } catch (e) {
    const result = {
      ...last,
      status: 'ERROR',
      lastAttemptAt: now,
      error: e instanceof Error ? e.message : 'Feed failed',
    };
    db()
      .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
      .run('macro-feed', JSON.stringify(result));
    return result;
  }
}
