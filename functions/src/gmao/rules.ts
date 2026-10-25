// Règles métier pures (sans I/O) — partagées front / back.
import {
  Asset, AssetEvent, AssetState, DEFAULT_PRIORITY_DELAYS, PmPlan, PmScheduleEntry, Priority,
} from './model';
import { addPeriod, civilOf, compareCivil, isoOf, nextOccurrence } from './recurrence';

const DAY_MS = 86400000;

/** Priorité proposée : danger ou machine à l'arrêt → urgente ; mode dégradé → haute ; sinon normale. */
export function suggestPriority(i: { safety?: boolean; declaredState?: AssetState; remark?: boolean }): Priority {
  if (i.remark) return 'P4';
  if (i.safety || i.declaredState === 'INDISPONIBLE') return 'P1';
  if (i.declaredState === 'DEGRADE') return 'P2';
  return 'P3';
}

export function priorityReason(i: { safety?: boolean; declaredState?: AssetState }): string {
  if (i.safety) return 'Danger pour les personnes';
  if (i.declaredState === 'INDISPONIBLE') return 'Machine à l’arrêt';
  if (i.declaredState === 'DEGRADE') return 'Machine utilisable avec difficulté';
  return 'Machine utilisable';
}

export function dueDateFor(priority: Priority, from: Date, delays: Record<Priority, number> = DEFAULT_PRIORITY_DELAYS): string {
  return new Date(from.getTime() + (delays[priority] ?? DEFAULT_PRIORITY_DELAYS[priority]) * DAY_MS).toISOString();
}

// ─── Préventif ───────────────────────────────────────────────────────────────

/** Échéance initiale d'une machine dans une gamme. */
export function initialScheduleEntry(plan: Pick<PmPlan, 'trigger' | 'recurrence' | 'meterInterval'>, asset: Asset | undefined, now: Date, offsetMin: number, firstDate?: string | null, firstMeter?: number | null): PmScheduleEntry {
  if (plan.trigger === 'CALENDAIRE' && plan.recurrence) {
    const startDate = firstDate && /^\d{4}-\d{2}-\d{2}/.test(firstDate) ? firstDate.slice(0, 10) : civilOf(now, offsetMin);
    const first = nextOccurrence(plan.recurrence, startDate, startDate, true);
    return {
      startDate, doneCount: 0,
      nextDueAt: first ? isoOf(first.date, offsetMin) : null,
      ended: !first, openWorkOrderId: null,
    };
  }
  const current = asset?.meterValue || 0;
  const interval = plan.meterInterval || 0;
  const next = firstMeter != null ? firstMeter : current + interval;
  return { startMeter: next, nextDueMeter: next, doneCount: 0, openWorkOrderId: null };
}

export function isPmDue(plan: PmPlan, entry: PmScheduleEntry | undefined, asset: Asset | undefined, now: Date): boolean {
  if (!entry || entry.openWorkOrderId || entry.ended) return false;
  if (plan.trigger === 'CALENDAIRE') {
    if (!entry.nextDueAt) return false;
    return now.getTime() >= new Date(entry.nextDueAt).getTime() - plan.alertBefore * DAY_MS;
  }
  if (entry.nextDueMeter == null || asset?.meterValue == null) return false;
  return asset.meterValue >= entry.nextDueMeter - plan.alertBefore;
}

export function isPmOverdue(plan: PmPlan, entry: PmScheduleEntry | undefined, asset: Asset | undefined, now: Date): boolean {
  if (!entry || entry.ended) return false;
  if (plan.trigger === 'CALENDAIRE') return !!entry.nextDueAt && now.getTime() > new Date(entry.nextDueAt).getTime();
  return entry.nextDueMeter != null && asset?.meterValue != null && asset.meterValue > entry.nextDueMeter;
}

/**
 * Prochaine échéance après une réalisation.
 * Les occurrences manquées ne sont jamais rattrapées : une vidange mensuelle faite en retard en juillet
 * couvre juin et juillet, la suivante est celle d'août.
 */
export function nextEntryAfterCompletion(plan: PmPlan, entry: PmScheduleEntry | undefined, doneAtIso: string, doneMeter: number | null | undefined, offsetMin: number): PmScheduleEntry {
  const e: PmScheduleEntry = { ...(entry || {}), lastDoneAt: doneAtIso, openWorkOrderId: null, doneCount: (entry?.doneCount || 0) + 1 };
  if (plan.trigger === 'CALENDAIRE' && plan.recurrence) {
    const rule = plan.recurrence;
    const doneCivil = civilOf(doneAtIso, offsetMin);
    if (rule.anchor === 'REALISATION') {
      const next = addPeriod(doneCivil, rule);
      const reachedCount = rule.end.type === 'COUNT' && rule.end.count && e.doneCount! >= rule.end.count;
      const pastUntil = rule.end.type === 'UNTIL' && rule.end.until && compareCivil(next, rule.end.until) > 0;
      if (reachedCount || pastUntil) return { ...e, nextDueAt: null, ended: true };
      return { ...e, nextDueAt: isoOf(next, offsetMin), ended: false };
    }
    const dueCivil = e.nextDueAt ? civilOf(e.nextDueAt, offsetMin) : doneCivil;
    const after = compareCivil(doneCivil, dueCivil) > 0 ? doneCivil : dueCivil;
    const next = nextOccurrence(rule, e.startDate || dueCivil, after);
    return next ? { ...e, nextDueAt: isoOf(next.date, offsetMin), ended: false } : { ...e, nextDueAt: null, ended: true };
  }
  const interval = plan.meterInterval || 0;
  const reading = doneMeter != null ? doneMeter : (entry?.nextDueMeter ?? 0);
  e.lastDoneMeter = reading;
  if (plan.meterAnchor === 'FIXE' && interval > 0) {
    const base = entry?.startMeter ?? entry?.nextDueMeter ?? reading;
    const floor = Math.max(reading, entry?.nextDueMeter ?? reading);
    const k = Math.floor((floor - base) / interval) + 1;
    return { ...e, nextDueMeter: base + Math.max(1, k) * interval };
  }
  return { ...e, nextDueMeter: reading + interval };
}

/** Occurrence annulée : on passe à la suivante, sans réalisation. */
export function skipOccurrence(plan: PmPlan, entry: PmScheduleEntry | undefined, offsetMin: number): PmScheduleEntry {
  const e: PmScheduleEntry = { ...(entry || {}), openWorkOrderId: null };
  if (plan.trigger === 'CALENDAIRE' && plan.recurrence) {
    const due = e.nextDueAt ? civilOf(e.nextDueAt, offsetMin) : civilOf(new Date(), offsetMin);
    if (plan.recurrence.anchor === 'REALISATION') return { ...e, nextDueAt: isoOf(addPeriod(due, plan.recurrence), offsetMin) };
    const next = nextOccurrence(plan.recurrence, e.startDate || due, due);
    return next ? { ...e, nextDueAt: isoOf(next.date, offsetMin) } : { ...e, nextDueAt: null, ended: true };
  }
  return { ...e, nextDueMeter: (e.nextDueMeter ?? 0) + (plan.meterInterval || 0) };
}

/** Échéance préventive la plus proche d'une machine (pour la fiche et l'espace client). */
export function nextPmFor(assetId: string, asset: Asset | undefined, plans: PmPlan[], now: Date) {
  let best: { planId: string; planName: string; dueAt?: string | null; dueMeter?: number | null; overdue: boolean; rank: number } | null = null;
  for (const p of plans) {
    if (!p.isActive || p.isArchived || !p.assetIds.includes(assetId)) continue;
    const e = p.schedule?.[assetId];
    if (!e || e.ended) continue;
    const overdue = isPmOverdue(p, e, asset, now);
    let rank = Infinity;
    if (p.trigger === 'CALENDAIRE' && e.nextDueAt) rank = new Date(e.nextDueAt).getTime();
    if (p.trigger === 'COMPTEUR' && e.nextDueMeter != null) rank = now.getTime() + Math.max(0, e.nextDueMeter - (asset?.meterValue || 0)) * 3600000;
    if (rank === Infinity) continue;
    if (!best || (overdue && !best.overdue) || (overdue === best.overdue && rank < best.rank)) {
      best = { planId: p.id, planName: p.name, dueAt: p.trigger === 'CALENDAIRE' ? e.nextDueAt : null, dueMeter: p.trigger === 'COMPTEUR' ? e.nextDueMeter : null, overdue, rank };
    }
  }
  if (!best) return null;
  const { rank, ...rest } = best;
  return rest;
}

export function hoursBetween(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

// ─── Disponibilité (le mode dégradé compte comme disponible) ────────────────

export function downtimeMs(asset: Asset, events: AssetEvent[], startMs: number, endMs: number): number {
  const stateEvents = events
    .filter(e => e.assetId === asset.id && e.type === 'STATE')
    .sort((a, b) => a.at.localeCompare(b.at));
  const createdMs = new Date(asset.createdAt).getTime();
  const from = Math.max(startMs, createdMs);
  if (from >= endMs) return 0;

  let state: AssetState = 'OPERATIONNEL';
  const before = stateEvents.filter(e => new Date(e.at).getTime() <= from);
  if (before.length) state = before[before.length - 1].toState || 'OPERATIONNEL';
  else if (stateEvents.length) state = stateEvents[0].fromState || 'OPERATIONNEL';
  else state = asset.state;

  let cursor = from;
  let down = 0;
  for (const e of stateEvents) {
    const t = new Date(e.at).getTime();
    if (t <= from) continue;
    if (t >= endMs) break;
    if (state === 'INDISPONIBLE') down += t - cursor;
    cursor = t;
    state = e.toState || state;
  }
  if (state === 'INDISPONIBLE') down += endMs - cursor;
  return down;
}

export function availabilityRate(asset: Asset, events: AssetEvent[], startMs: number, endMs: number): number | null {
  const from = Math.max(startMs, new Date(asset.createdAt).getTime());
  const span = endMs - from;
  if (span <= 0) return null;
  return 1 - downtimeMs(asset, events, startMs, endMs) / span;
}

export function stateCounts(assets: Asset[]) {
  const c = { OPERATIONNEL: 0, DEGRADE: 0, INDISPONIBLE: 0 } as Record<AssetState, number>;
  assets.forEach(a => { c[a.state] = (c[a.state] || 0) + 1; });
  return c;
}

/** Périmètre d'un technicien : machines qui lui sont affectées, ou affectées à tous. */
export function inPerimeter(asset: Pick<Asset, 'technicianIds'> | undefined, userId: string): boolean {
  if (!asset) return false;
  return !asset.technicianIds || asset.technicianIds.length === 0 || asset.technicianIds.includes(userId);
}
