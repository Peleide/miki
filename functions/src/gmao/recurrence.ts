// Récurrences calendaires, sur le modèle des rendez-vous récurrents de Google Agenda.
// Toutes les dates sont des dates civiles « AAAA-MM-JJ » dans le fuseau de l'organisation,
// pour qu'un « lundi » ou un « 15 du mois » ne dépende pas du fuseau du serveur.
import { Recurrence } from './model';

const DAY = 86400000;
export const WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const WEEKDAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type Civil = { y: number; m: number; d: number }; // m : 0–11

const pad = (n: number) => String(n).padStart(2, '0');
export const parseCivil = (s: string): Civil => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return { y, m: m - 1, d };
};
export const fmtCivil = (c: Civil) => `${c.y}-${pad(c.m + 1)}-${pad(c.d)}`;
const toUtc = (c: Civil) => Date.UTC(c.y, c.m, c.d);
const fromUtc = (ms: number): Civil => { const x = new Date(ms); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }; };
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** 0 = lundi … 6 = dimanche */
export const weekdayOf = (s: string) => (new Date(toUtc(parseCivil(s))).getUTCDay() + 6) % 7;
export const addDaysCivil = (s: string, n: number) => fmtCivil(fromUtc(toUtc(parseCivil(s)) + n * DAY));
export const compareCivil = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Date civile (fuseau de l'organisation) d'un instant. */
export function civilOf(iso: string | Date, offsetMin: number): string {
  const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime() + offsetMin * 60000;
  return fmtCivil(fromUtc(t));
}
/** Instant ISO correspondant à une date civile à une heure locale donnée. */
export function isoOf(civil: string, offsetMin: number, hour = 8): string {
  const c = parseCivil(civil);
  return new Date(Date.UTC(c.y, c.m, c.d, hour, 0) - offsetMin * 60000).toISOString();
}

function addMonthsClamped(c: Civil, months: number, day: number): Civil {
  const total = c.y * 12 + c.m + months;
  const y = Math.floor(total / 12), m = total % 12;
  return { y, m, d: Math.min(day, daysInMonth(y, m)) };
}

/** n-ième (1–4) ou dernier (-1) jour de semaine `wd` d'un mois. */
function nthWeekday(y: number, m: number, wd: number, nth: number): Civil {
  if (nth === -1) {
    const last = daysInMonth(y, m);
    const wdLast = (new Date(Date.UTC(y, m, last)).getUTCDay() + 6) % 7;
    return { y, m, d: last - ((wdLast - wd + 7) % 7) };
  }
  const wdFirst = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const d = 1 + ((wd - wdFirst + 7) % 7) + (nth - 1) * 7;
  return d > daysInMonth(y, m) ? nthWeekday(y, m, wd, -1) : { y, m, d };
}

/** Rang du jour dans le mois : 1–4, ou -1 si c'est le dernier de ce jour de semaine. */
export function nthOf(s: string): number {
  const c = parseCivil(s);
  if (c.d + 7 > daysInMonth(c.y, c.m)) return -1;
  return Math.ceil(c.d / 7);
}

/**
 * Énumère les occurrences de la série à partir de `start` (incluse si elle correspond à la règle).
 * Renvoie la date et le rang (0, 1, 2…) dans la série.
 */
export function* occurrences(rule: Recurrence, start: string, maxIter = 4000): Generator<{ date: string; index: number }> {
  const s = parseCivil(start);
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  let index = 0;
  const ok = (date: string) => {
    if (rule.end?.type === 'UNTIL' && rule.end.until && compareCivil(date, rule.end.until) > 0) return false;
    if (rule.end?.type === 'COUNT' && rule.end.count && index >= rule.end.count) return false;
    return true;
  };
  for (let k = 0; k < maxIter; k++) {
    if (rule.freq === 'DAILY') {
      const date = fmtCivil(fromUtc(toUtc(s) + k * interval * DAY));
      if (!ok(date)) return;
      yield { date, index: index++ };
    } else if (rule.freq === 'WEEKLY') {
      const days = (rule.byWeekday && rule.byWeekday.length ? [...rule.byWeekday] : [weekdayOf(start)]).sort((a, b) => a - b);
      const monday = toUtc(s) - weekdayOf(start) * DAY + k * interval * 7 * DAY;
      for (const wd of days) {
        const date = fmtCivil(fromUtc(monday + wd * DAY));
        if (compareCivil(date, start) < 0) continue;
        if (!ok(date)) return;
        yield { date, index: index++ };
      }
    } else if (rule.freq === 'MONTHLY') {
      let c: Civil;
      if (rule.monthlyMode === 'NTH_WEEKDAY') {
        const total = s.y * 12 + s.m + k * interval;
        c = nthWeekday(Math.floor(total / 12), total % 12, weekdayOf(start), nthOf(start));
      } else {
        c = addMonthsClamped(s, k * interval, s.d);
      }
      const date = fmtCivil(c);
      if (compareCivil(date, start) < 0) continue;
      if (!ok(date)) return;
      yield { date, index: index++ };
    } else {
      const date = fmtCivil(addMonthsClamped(s, k * interval * 12, s.d));
      if (!ok(date)) return;
      yield { date, index: index++ };
    }
  }
}

/** Première occurrence strictement postérieure à `after` (ou ≥ si `inclusive`). */
export function nextOccurrence(rule: Recurrence, start: string, after: string, inclusive = false): { date: string; index: number } | null {
  for (const o of occurrences(rule, start)) {
    const c = compareCivil(o.date, after);
    if (c > 0 || (inclusive && c === 0)) return o;
  }
  return null;
}

/** Ajoute une période (mode « depuis la dernière réalisation »). */
export function addPeriod(civil: string, rule: Pick<Recurrence, 'freq' | 'interval'>): string {
  const c = parseCivil(civil);
  const n = Math.max(1, Math.floor(rule.interval || 1));
  if (rule.freq === 'DAILY') return addDaysCivil(civil, n);
  if (rule.freq === 'WEEKLY') return addDaysCivil(civil, 7 * n);
  if (rule.freq === 'MONTHLY') return fmtCivil(addMonthsClamped(c, n, c.d));
  return fmtCivil(addMonthsClamped(c, 12 * n, c.d));
}

const ORD = (n: number) => (n === -1 ? 'dernier' : n === 1 ? '1er' : `${n}e`);

/** Libellé lisible, ex. « Tous les 3 mois, le 15 · 10 fois ». */
export function describeRecurrence(rule: Recurrence, start?: string | null): string {
  const n = Math.max(1, rule.interval || 1);
  let base = '';
  if (rule.freq === 'DAILY') base = n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
  if (rule.freq === 'WEEKLY') {
    const days = (rule.byWeekday && rule.byWeekday.length ? rule.byWeekday : start ? [weekdayOf(start)] : []).slice().sort((a, b) => a - b);
    const list = days.map(d => WEEKDAY_LONG[d]);
    const daysTxt = list.length > 1 ? `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}` : list[0] || '';
    base = `${n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`}${daysTxt ? ` le ${daysTxt}` : ''}`;
  }
  if (rule.freq === 'MONTHLY') {
    const head = n === 1 ? 'Tous les mois' : `Tous les ${n} mois`;
    if (!start) base = head;
    else if (rule.monthlyMode === 'NTH_WEEKDAY') base = `${head}, le ${ORD(nthOf(start))} ${WEEKDAY_LONG[weekdayOf(start)]}`;
    else base = `${head}, le ${parseCivil(start).d === 1 ? '1er' : parseCivil(start).d}`;
  }
  if (rule.freq === 'YEARLY') {
    const head = n === 1 ? 'Tous les ans' : `Tous les ${n} ans`;
    base = start ? `${head}, le ${parseCivil(start).d === 1 ? '1er' : parseCivil(start).d} ${MONTHS[parseCivil(start).m]}` : head;
  }
  const end = rule.end?.type === 'COUNT' && rule.end.count ? ` · ${rule.end.count} fois`
    : rule.end?.type === 'UNTIL' && rule.end.until ? ` · jusqu'au ${parseCivil(rule.end.until).d} ${MONTHS[parseCivil(rule.end.until).m]} ${parseCivil(rule.end.until).y}` : '';
  const anchor = rule.anchor === 'REALISATION' ? ' · à compter de la dernière réalisation' : '';
  return base + end + anchor;
}

export function normalizeRecurrence(r: any): Recurrence {
  const freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r?.freq) ? r.freq : 'MONTHLY';
  const interval = Math.max(1, Math.min(999, Math.floor(Number(r?.interval) || 1)));
  const byWeekday = freq === 'WEEKLY' && Array.isArray(r?.byWeekday)
    ? Array.from(new Set(r.byWeekday.map(Number).filter((x: number) => x >= 0 && x <= 6))) as number[]
    : undefined;
  const endType = ['NEVER', 'UNTIL', 'COUNT'].includes(r?.end?.type) ? r.end.type : 'NEVER';
  const end = endType === 'UNTIL' && /^\d{4}-\d{2}-\d{2}$/.test(String(r?.end?.until || ''))
    ? { type: 'UNTIL' as const, until: String(r.end.until) }
    : endType === 'COUNT' && Number(r?.end?.count) > 0
      ? { type: 'COUNT' as const, count: Math.floor(Number(r.end.count)) }
      : { type: 'NEVER' as const };
  return {
    freq, interval,
    ...(byWeekday && byWeekday.length ? { byWeekday: byWeekday.sort((a, b) => a - b) } : {}),
    ...(freq === 'MONTHLY' ? { monthlyMode: r?.monthlyMode === 'NTH_WEEKDAY' ? 'NTH_WEEKDAY' : 'DAY' } : {}),
    end,
    anchor: r?.anchor === 'REALISATION' ? 'REALISATION' : 'CALENDRIER',
  } as Recurrence;
}
