// Règles métier pures (sans I/O) — partagées front / back.
import {
  Asset, AssetEvent, AssetState, CalendarUnit, Impact, PmPlan, PmScheduleEntry, Priority,
  PRIORITY_DELAY_DAYS, WorkOrder,
} from './model';

const DAY_MS = 86400000;

export function suggestPriority(impact: Impact): Priority {
  if (impact.safety || impact.production === 'ARRET') return 'P1';
  if (impact.regulatory || impact.production === 'DEGRADE') return 'P2';
  if (impact.production === 'AUCUN') return 'P3';
  return 'P4';
}

export function priorityReason(impact: Impact): string {
  if (impact.safety) return 'Impact sécurité';
  if (impact.production === 'ARRET') return "Bloque l'exploitation";
  if (impact.regulatory) return 'Impact réglementaire';
  if (impact.production === 'DEGRADE') return "Ralentit l'exploitation";
  if (impact.production === 'AUCUN') return "Pas d'impact immédiat";
  return 'Gêne mineure';
}

export function dueDateFor(priority: Priority, from: Date): string {
  return new Date(from.getTime() + PRIORITY_DELAY_DAYS[priority] * DAY_MS).toISOString();
}

export function addInterval(fromIso: string, value: number, unit: CalendarUnit): string {
  const d = new Date(fromIso);
  if (unit === 'JOURS') d.setDate(d.getDate() + value);
  else if (unit === 'SEMAINES') d.setDate(d.getDate() + value * 7);
  else d.setMonth(d.getMonth() + value);
  return d.toISOString();
}

export function initialScheduleEntry(plan: Pick<PmPlan, 'trigger' | 'intervalValue' | 'intervalUnit'>, asset: Asset | undefined, now: Date, firstDueAt?: string | null, firstDueMeter?: number | null): PmScheduleEntry {
  if (plan.trigger === 'CALENDAIRE') {
    return {
      nextDueAt: firstDueAt || addInterval(now.toISOString(), plan.intervalValue, plan.intervalUnit || 'MOIS'),
      openWorkOrderId: null,
    };
  }
  const current = asset?.meterValue || 0;
  return {
    nextDueMeter: firstDueMeter != null ? firstDueMeter : current + plan.intervalValue,
    openWorkOrderId: null,
  };
}

export function isPmDue(plan: PmPlan, entry: PmScheduleEntry | undefined, asset: Asset | undefined, now: Date): boolean {
  if (!entry || entry.openWorkOrderId) return false;
  if (plan.trigger === 'CALENDAIRE') {
    if (!entry.nextDueAt) return false;
    return now.getTime() >= new Date(entry.nextDueAt).getTime() - plan.alertBefore * DAY_MS;
  }
  if (entry.nextDueMeter == null || asset?.meterValue == null) return false;
  return asset.meterValue >= entry.nextDueMeter - plan.alertBefore;
}

export function isPmOverdue(plan: PmPlan, entry: PmScheduleEntry | undefined, asset: Asset | undefined, now: Date): boolean {
  if (!entry) return false;
  if (plan.trigger === 'CALENDAIRE') return !!entry.nextDueAt && now.getTime() > new Date(entry.nextDueAt).getTime();
  return entry.nextDueMeter != null && asset?.meterValue != null && asset.meterValue > entry.nextDueMeter;
}

export function nextEntryAfterCompletion(plan: PmPlan, entry: PmScheduleEntry | undefined, doneAt: string, doneMeter: number | null | undefined): PmScheduleEntry {
  if (plan.trigger === 'CALENDAIRE') {
    return {
      ...(entry || {}),
      lastDoneAt: doneAt,
      nextDueAt: addInterval(doneAt, plan.intervalValue, plan.intervalUnit || 'MOIS'),
      openWorkOrderId: null,
    };
  }
  const base = doneMeter != null ? doneMeter : (entry?.nextDueMeter ?? 0);
  return {
    ...(entry || {}),
    lastDoneAt: doneAt,
    lastDoneMeter: base,
    nextDueMeter: base + plan.intervalValue,
    openWorkOrderId: null,
  };
}

export function skipOccurrence(plan: PmPlan, entry: PmScheduleEntry | undefined): PmScheduleEntry {
  if (plan.trigger === 'CALENDAIRE') {
    const from = entry?.nextDueAt || new Date().toISOString();
    return { ...(entry || {}), nextDueAt: addInterval(from, plan.intervalValue, plan.intervalUnit || 'MOIS'), openWorkOrderId: null };
  }
  return { ...(entry || {}), nextDueMeter: (entry?.nextDueMeter ?? 0) + plan.intervalValue, openWorkOrderId: null };
}

export function workOrderCost(wo: Pick<WorkOrder, 'laborHours' | 'partsCost' | 'externalCost' | 'resourceType'>, hourlyRate: number) {
  const labor = wo.resourceType === 'INTERNE' ? (wo.laborHours || 0) * (hourlyRate || 0) : 0;
  const parts = wo.partsCost || 0;
  const external = wo.externalCost || 0;
  return { labor, parts, external, total: labor + parts + external };
}

export function hoursBetween(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}

// Disponibilité : le mode dégradé compte comme disponible (cf. CDC 4.1.2).
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
