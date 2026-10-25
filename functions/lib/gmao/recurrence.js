"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareCivil = exports.addDaysCivil = exports.weekdayOf = exports.daysInMonth = exports.fmtCivil = exports.parseCivil = exports.WEEKDAY_LONG = exports.WEEKDAY_SHORT = void 0;
exports.civilOf = civilOf;
exports.isoOf = isoOf;
exports.nthOf = nthOf;
exports.occurrences = occurrences;
exports.nextOccurrence = nextOccurrence;
exports.addPeriod = addPeriod;
exports.describeRecurrence = describeRecurrence;
exports.normalizeRecurrence = normalizeRecurrence;
const DAY = 86400000;
exports.WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
exports.WEEKDAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n) => String(n).padStart(2, '0');
const parseCivil = (s) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return { y, m: m - 1, d };
};
exports.parseCivil = parseCivil;
const fmtCivil = (c) => `${c.y}-${pad(c.m + 1)}-${pad(c.d)}`;
exports.fmtCivil = fmtCivil;
const toUtc = (c) => Date.UTC(c.y, c.m, c.d);
const fromUtc = (ms) => { const x = new Date(ms); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
exports.daysInMonth = daysInMonth;
/** 0 = lundi … 6 = dimanche */
const weekdayOf = (s) => (new Date(toUtc((0, exports.parseCivil)(s))).getUTCDay() + 6) % 7;
exports.weekdayOf = weekdayOf;
const addDaysCivil = (s, n) => (0, exports.fmtCivil)(fromUtc(toUtc((0, exports.parseCivil)(s)) + n * DAY));
exports.addDaysCivil = addDaysCivil;
const compareCivil = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
exports.compareCivil = compareCivil;
/** Date civile (fuseau de l'organisation) d'un instant. */
function civilOf(iso, offsetMin) {
    const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime() + offsetMin * 60000;
    return (0, exports.fmtCivil)(fromUtc(t));
}
/** Instant ISO correspondant à une date civile à une heure locale donnée. */
function isoOf(civil, offsetMin, hour = 8) {
    const c = (0, exports.parseCivil)(civil);
    return new Date(Date.UTC(c.y, c.m, c.d, hour, 0) - offsetMin * 60000).toISOString();
}
function addMonthsClamped(c, months, day) {
    const total = c.y * 12 + c.m + months;
    const y = Math.floor(total / 12), m = total % 12;
    return { y, m, d: Math.min(day, (0, exports.daysInMonth)(y, m)) };
}
/** n-ième (1–4) ou dernier (-1) jour de semaine `wd` d'un mois. */
function nthWeekday(y, m, wd, nth) {
    if (nth === -1) {
        const last = (0, exports.daysInMonth)(y, m);
        const wdLast = (new Date(Date.UTC(y, m, last)).getUTCDay() + 6) % 7;
        return { y, m, d: last - ((wdLast - wd + 7) % 7) };
    }
    const wdFirst = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const d = 1 + ((wd - wdFirst + 7) % 7) + (nth - 1) * 7;
    return d > (0, exports.daysInMonth)(y, m) ? nthWeekday(y, m, wd, -1) : { y, m, d };
}
/** Rang du jour dans le mois : 1–4, ou -1 si c'est le dernier de ce jour de semaine. */
function nthOf(s) {
    const c = (0, exports.parseCivil)(s);
    if (c.d + 7 > (0, exports.daysInMonth)(c.y, c.m))
        return -1;
    return Math.ceil(c.d / 7);
}
/**
 * Énumère les occurrences de la série à partir de `start` (incluse si elle correspond à la règle).
 * Renvoie la date et le rang (0, 1, 2…) dans la série.
 */
function* occurrences(rule, start, maxIter = 4000) {
    const s = (0, exports.parseCivil)(start);
    const interval = Math.max(1, Math.floor(rule.interval || 1));
    let index = 0;
    const ok = (date) => {
        if (rule.end?.type === 'UNTIL' && rule.end.until && (0, exports.compareCivil)(date, rule.end.until) > 0)
            return false;
        if (rule.end?.type === 'COUNT' && rule.end.count && index >= rule.end.count)
            return false;
        return true;
    };
    for (let k = 0; k < maxIter; k++) {
        if (rule.freq === 'DAILY') {
            const date = (0, exports.fmtCivil)(fromUtc(toUtc(s) + k * interval * DAY));
            if (!ok(date))
                return;
            yield { date, index: index++ };
        }
        else if (rule.freq === 'WEEKLY') {
            const days = (rule.byWeekday && rule.byWeekday.length ? [...rule.byWeekday] : [(0, exports.weekdayOf)(start)]).sort((a, b) => a - b);
            const monday = toUtc(s) - (0, exports.weekdayOf)(start) * DAY + k * interval * 7 * DAY;
            for (const wd of days) {
                const date = (0, exports.fmtCivil)(fromUtc(monday + wd * DAY));
                if ((0, exports.compareCivil)(date, start) < 0)
                    continue;
                if (!ok(date))
                    return;
                yield { date, index: index++ };
            }
        }
        else if (rule.freq === 'MONTHLY') {
            let c;
            if (rule.monthlyMode === 'NTH_WEEKDAY') {
                const total = s.y * 12 + s.m + k * interval;
                c = nthWeekday(Math.floor(total / 12), total % 12, (0, exports.weekdayOf)(start), nthOf(start));
            }
            else {
                c = addMonthsClamped(s, k * interval, s.d);
            }
            const date = (0, exports.fmtCivil)(c);
            if ((0, exports.compareCivil)(date, start) < 0)
                continue;
            if (!ok(date))
                return;
            yield { date, index: index++ };
        }
        else {
            const date = (0, exports.fmtCivil)(addMonthsClamped(s, k * interval * 12, s.d));
            if (!ok(date))
                return;
            yield { date, index: index++ };
        }
    }
}
/** Première occurrence strictement postérieure à `after` (ou ≥ si `inclusive`). */
function nextOccurrence(rule, start, after, inclusive = false) {
    for (const o of occurrences(rule, start)) {
        const c = (0, exports.compareCivil)(o.date, after);
        if (c > 0 || (inclusive && c === 0))
            return o;
    }
    return null;
}
/** Ajoute une période (mode « depuis la dernière réalisation »). */
function addPeriod(civil, rule) {
    const c = (0, exports.parseCivil)(civil);
    const n = Math.max(1, Math.floor(rule.interval || 1));
    if (rule.freq === 'DAILY')
        return (0, exports.addDaysCivil)(civil, n);
    if (rule.freq === 'WEEKLY')
        return (0, exports.addDaysCivil)(civil, 7 * n);
    if (rule.freq === 'MONTHLY')
        return (0, exports.fmtCivil)(addMonthsClamped(c, n, c.d));
    return (0, exports.fmtCivil)(addMonthsClamped(c, 12 * n, c.d));
}
const ORD = (n) => (n === -1 ? 'dernier' : n === 1 ? '1er' : `${n}e`);
/** Libellé lisible, ex. « Tous les 3 mois, le 15 · 10 fois ». */
function describeRecurrence(rule, start) {
    const n = Math.max(1, rule.interval || 1);
    let base = '';
    if (rule.freq === 'DAILY')
        base = n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
    if (rule.freq === 'WEEKLY') {
        const days = (rule.byWeekday && rule.byWeekday.length ? rule.byWeekday : start ? [(0, exports.weekdayOf)(start)] : []).slice().sort((a, b) => a - b);
        const list = days.map(d => exports.WEEKDAY_LONG[d]);
        const daysTxt = list.length > 1 ? `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}` : list[0] || '';
        base = `${n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`}${daysTxt ? ` le ${daysTxt}` : ''}`;
    }
    if (rule.freq === 'MONTHLY') {
        const head = n === 1 ? 'Tous les mois' : `Tous les ${n} mois`;
        if (!start)
            base = head;
        else if (rule.monthlyMode === 'NTH_WEEKDAY')
            base = `${head}, le ${ORD(nthOf(start))} ${exports.WEEKDAY_LONG[(0, exports.weekdayOf)(start)]}`;
        else
            base = `${head}, le ${(0, exports.parseCivil)(start).d === 1 ? '1er' : (0, exports.parseCivil)(start).d}`;
    }
    if (rule.freq === 'YEARLY') {
        const head = n === 1 ? 'Tous les ans' : `Tous les ${n} ans`;
        base = start ? `${head}, le ${(0, exports.parseCivil)(start).d === 1 ? '1er' : (0, exports.parseCivil)(start).d} ${MONTHS[(0, exports.parseCivil)(start).m]}` : head;
    }
    const end = rule.end?.type === 'COUNT' && rule.end.count ? ` · ${rule.end.count} fois`
        : rule.end?.type === 'UNTIL' && rule.end.until ? ` · jusqu'au ${(0, exports.parseCivil)(rule.end.until).d} ${MONTHS[(0, exports.parseCivil)(rule.end.until).m]} ${(0, exports.parseCivil)(rule.end.until).y}` : '';
    const anchor = rule.anchor === 'REALISATION' ? ' · à compter de la dernière réalisation' : '';
    return base + end + anchor;
}
function normalizeRecurrence(r) {
    const freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r?.freq) ? r.freq : 'MONTHLY';
    const interval = Math.max(1, Math.min(999, Math.floor(Number(r?.interval) || 1)));
    const byWeekday = freq === 'WEEKLY' && Array.isArray(r?.byWeekday)
        ? Array.from(new Set(r.byWeekday.map(Number).filter((x) => x >= 0 && x <= 6)))
        : undefined;
    const endType = ['NEVER', 'UNTIL', 'COUNT'].includes(r?.end?.type) ? r.end.type : 'NEVER';
    const end = endType === 'UNTIL' && /^\d{4}-\d{2}-\d{2}$/.test(String(r?.end?.until || ''))
        ? { type: 'UNTIL', until: String(r.end.until) }
        : endType === 'COUNT' && Number(r?.end?.count) > 0
            ? { type: 'COUNT', count: Math.floor(Number(r.end.count)) }
            : { type: 'NEVER' };
    return {
        freq, interval,
        ...(byWeekday && byWeekday.length ? { byWeekday: byWeekday.sort((a, b) => a - b) } : {}),
        ...(freq === 'MONTHLY' ? { monthlyMode: r?.monthlyMode === 'NTH_WEEKDAY' ? 'NTH_WEEKDAY' : 'DAY' } : {}),
        end,
        anchor: r?.anchor === 'REALISATION' ? 'REALISATION' : 'CALENDRIER',
    };
}
//# sourceMappingURL=recurrence.js.map