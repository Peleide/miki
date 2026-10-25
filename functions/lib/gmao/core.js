"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.civilOf = exports.PUBLIC_LIMITS = exports.GmaoError = void 0;
exports.canDo = canDo;
exports.randomToken = randomToken;
exports.runPreventiveScan = runPreventiveScan;
exports.handlePublicAction = handlePublicAction;
exports.handleGmaoAction = handleGmaoAction;
// Cœur métier GMAO : toutes les mutations passent par handleGmaoAction (comptes connectés)
// ou handlePublicAction (formulaire public du QR code).
// Exécuté côté serveur (Cloud Functions) et, en mode démo, dans le navigateur.
const model_1 = require("./model");
const rules_1 = require("./rules");
const recurrence_1 = require("./recurrence");
Object.defineProperty(exports, "civilOf", { enumerable: true, get: function () { return recurrence_1.civilOf; } });
const kits_1 = require("./kits");
class GmaoError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.GmaoError = GmaoError;
function fail(code, msg) { throw new GmaoError(code, msg); }
// ─── Permissions (rôle) ─────────────────────────────────────────────────────
// Les contrôles fins (périmètre, réglages, client) sont faits dans chaque action.
const R = ['RESPONSABLE'];
const RT = ['RESPONSABLE', 'TECHNICIEN'];
const ALL = ['RESPONSABLE', 'TECHNICIEN', 'CLIENT'];
const PERMISSIONS = {
    SITE_SAVE: R, TYPOLOGY_SAVE: R, TYPOLOGY_ARCHIVE: R, CLIENT_SAVE: R, CLIENT_ARCHIVE: R,
    ASSET_CREATE: R, ASSET_IMPORT: R, ASSET_UPDATE: R, ASSET_ARCHIVE: R, ASSET_RESTORE: R,
    ASSET_ADD_DOCUMENT: R, ASSET_REMOVE_DOCUMENT: R,
    ASSET_SET_STATE: RT, METER_ADD: RT,
    REQUEST_CREATE: ALL, REQUEST_APPROVE: RT, REQUEST_CANCEL: RT, REQUEST_ACK: RT,
    WO_CREATE: RT, WO_RECORD: RT, WO_UPDATE: R, WO_PLAN: RT, WO_UNPLAN: RT, WO_HOLD: RT, WO_CANCEL: R,
    WO_START: RT, WO_CLOSE: RT,
    PM_SAVE: R, PM_TOGGLE: R, PM_ARCHIVE: R, PM_SET_NEXT: R, PM_SCAN: RT,
    TASK_SAVE: RT, TASK_DELETE: RT, TASK_TOGGLE_DONE: RT,
    CHECKLIST_SAVE: R, CHECKLIST_ARCHIVE: R,
    SETTINGS_SAVE: R, KIT_APPLY: R, USERS_LIST: RT,
};
function canDo(role, action) {
    return (PERMISSIONS[action] || []).includes(role);
}
// ─── Utilitaires ────────────────────────────────────────────────────────────
const clean = (o) => JSON.parse(JSON.stringify(o));
const str = (v, field, required = true, max = 4000) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (required && !s)
        fail('invalid-argument', `Champ obligatoire manquant : ${field}.`);
    if (s.length > max)
        fail('invalid-argument', `${field} : texte trop long (${max} caractères maximum).`);
    return s;
};
const num = (v) => {
    if (v === '' || v === null || v === undefined)
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const isPriority = (p) => model_1.PRIORITIES.includes(p);
const isState = (s) => ['OPERATIONNEL', 'DEGRADE', 'INDISPONIBLE'].includes(s);
const severity = { OPERATIONNEL: 0, DEGRADE: 1, INDISPONIBLE: 2 };
function randomToken(len = 20) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(len);
    const c = globalThis.crypto;
    if (c?.getRandomValues)
        c.getRandomValues(bytes);
    else
        for (let i = 0; i < len; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
async function settingsOf(ctx) {
    ctx.memo = ctx.memo || {};
    if (!ctx.memo.settings)
        ctx.memo.settings = (0, model_1.withDefaults)(await ctx.store.getSettings());
    return ctx.memo.settings;
}
async function usersOf(ctx) {
    ctx.memo = ctx.memo || {};
    if (!ctx.memo.users)
        ctx.memo.users = await ctx.store.getUsers();
    return ctx.memo.users;
}
async function counterNumber(ctx, prefix) {
    const year = ctx.now.getFullYear();
    const n = await ctx.store.nextNumber(`${prefix}-${year}`);
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}
async function getAsset(ctx, id) {
    const a = await ctx.store.get(model_1.COLL.assets, id);
    if (!a)
        fail('not-found', 'Machine introuvable.');
    return a;
}
async function getWorkOrder(ctx, id) {
    const w = await ctx.store.get(model_1.COLL.workOrders, id);
    if (!w)
        fail('not-found', 'Intervention introuvable.');
    return w;
}
function requirePerimeter(ctx, asset) {
    if (ctx.actor.role === 'TECHNICIEN' && !(0, rules_1.inPerimeter)(asset, ctx.actor.id)) {
        fail('permission-denied', `${asset.code} ne fait pas partie de votre parc.`);
    }
    if (ctx.actor.role === 'CLIENT' && asset.clientId !== (ctx.actor.clientId || '__none__')) {
        fail('permission-denied', 'Cette machine ne fait pas partie de votre parc.');
    }
}
async function setAssetState(ctx, asset, toState, reason, workOrderId) {
    if (asset.state === toState && (asset.stateReason || null) === (reason || null))
        return;
    const at = ctx.now.toISOString();
    const ev = {
        id: ctx.store.newId(model_1.COLL.assetEvents), assetId: asset.id, clientId: asset.clientId || null, type: 'STATE', at,
        byId: ctx.actor.id, byName: ctx.actor.name, fromState: asset.state, toState,
        reason: reason || null, workOrderId: workOrderId || null,
    };
    await ctx.store.set(model_1.COLL.assetEvents, ev.id, ev);
    const sinceChanges = asset.state !== toState;
    await ctx.store.update(model_1.COLL.assets, asset.id, {
        state: toState,
        stateReason: toState === 'OPERATIONNEL' ? null : (reason || null),
        ...(sinceChanges ? { stateSince: at } : {}),
    });
    asset.state = toState;
}
async function addMeterReading(ctx, asset, value, workOrderId) {
    if (!asset.meterType)
        fail('failed-precondition', "Cette machine n'a pas de compteur.");
    if (asset.meterValue != null && value < asset.meterValue) {
        fail('invalid-argument', `Le relevé (${value}) est inférieur au dernier relevé (${asset.meterValue}).`);
    }
    const at = ctx.now.toISOString();
    const ev = {
        id: ctx.store.newId(model_1.COLL.assetEvents), assetId: asset.id, clientId: asset.clientId || null, type: 'METER', at,
        byId: ctx.actor.id, byName: ctx.actor.name, value, workOrderId: workOrderId || null,
    };
    await ctx.store.set(model_1.COLL.assetEvents, ev.id, ev);
    await ctx.store.update(model_1.COLL.assets, asset.id, { meterValue: value, meterUpdatedAt: at });
    asset.meterValue = value;
}
async function resolveAssignees(ctx, ids) {
    const list = Array.isArray(ids) ? Array.from(new Set(ids.filter((x) => typeof x === 'string'))) : [];
    if (!list.length)
        return { ids: [], names: [] };
    const users = await usersOf(ctx);
    const names = list.map(id => {
        const u = users.find(x => x.id === id);
        if (!u)
            fail('invalid-argument', 'Intervenant inconnu.');
        if (u.role === 'CLIENT')
            fail('invalid-argument', `${u.name} n'est pas un intervenant maintenance.`);
        return u.name;
    });
    return { ids: list, names };
}
/** Technicien attribué d'office : l'unique technicien du périmètre de la machine (ou de l'organisation). */
async function defaultAssignees(ctx, asset) {
    const techs = (await usersOf(ctx)).filter(u => u.role === 'TECHNICIEN');
    const pool = asset.technicianIds?.length ? techs.filter(t => asset.technicianIds.includes(t.id)) : techs;
    if (pool.length === 1)
        return { ids: [pool[0].id], names: [pool[0].name] };
    return { ids: [], names: [] };
}
/** Personnes à prévenir pour une machine : responsables (via notifyManagers) + techniciens du périmètre. */
async function notifyTeam(ctx, asset, title, message, level, exceptIds = []) {
    ctx.effects.push({ type: 'notifyManagers', title, message, level });
    const techs = (await usersOf(ctx)).filter(u => u.role === 'TECHNICIEN' && (0, rules_1.inPerimeter)(asset, u.id) && !exceptIds.includes(u.id));
    for (const t of techs)
        ctx.effects.push({ type: 'notifyUser', userId: t.id, title, message, level });
}
function validateAnswers(checklist, answers, safety) {
    for (const item of checklist.items) {
        const v = answers?.[item.id]?.value;
        const empty = v === undefined || v === null || v === '';
        if (item.required && empty)
            fail('invalid-argument', `Check-list « ${checklist.name} » : « ${item.label} » est obligatoire.`);
        if (item.type === 'CHOICE' && !empty && item.options?.length && !item.options.includes(v)) {
            fail('invalid-argument', `Check-list « ${checklist.name} » : réponse invalide pour « ${item.label} ».`);
        }
        if (safety && item.type === 'BOOLEAN' && item.required && v === false) {
            fail('failed-precondition', `Sécurité non validée : « ${item.label} ». L'intervention ne peut pas démarrer.`);
        }
    }
}
async function checkSafety(ctx, wo, answers) {
    if (!wo.safetyCheckRequired)
        return null;
    const settings = await settingsOf(ctx);
    if (!settings.safetyChecklistId)
        return null;
    const chk = await ctx.store.get(model_1.COLL.checklists, settings.safetyChecklistId);
    if (!chk || chk.isArchived)
        return null;
    validateAnswers(chk, answers, true);
    return answers;
}
// ─── Quotas de l'offre ──────────────────────────────────────────────────────
async function checkQuota(ctx, kind, adding = 1) {
    const { plan } = await ctx.store.getTenantInfo();
    if (!plan)
        return;
    const label = model_1.PLANS[plan.tier]?.label || plan.tier;
    if (kind === 'assets') {
        const active = (await ctx.store.list(model_1.COLL.assets)).filter(a => !a.isArchived && a.level === 'EQUIPEMENT').length;
        if (active + adding > plan.maxAssets) {
            fail('resource-exhausted', `Votre offre ${label} est limitée à ${plan.maxAssets} machines actives (${active} aujourd'hui). Archivez une machine ou passez à l'offre supérieure.`);
        }
    }
    else {
        const active = (await ctx.store.list(model_1.COLL.clients)).filter(c => !c.isArchived).length;
        if (active + adding > plan.maxClients) {
            fail('resource-exhausted', `Votre offre ${label} est limitée à ${plan.maxClients} client(s) (${active} aujourd'hui). Archivez un client ou passez à l'offre supérieure.`);
        }
    }
}
// ─── Préventif : dénormalisation de la prochaine échéance ───────────────────
async function refreshNextPm(ctx, assetIds) {
    const plans = await ctx.store.list(model_1.COLL.pmPlans);
    const assets = await ctx.store.list(model_1.COLL.assets);
    const targets = assetIds ? assets.filter(a => assetIds.includes(a.id)) : assets;
    for (const a of targets) {
        const next = (0, rules_1.nextPmFor)(a.id, a, plans, ctx.now);
        if (JSON.stringify(next || null) !== JSON.stringify(a.nextPm || null)) {
            await ctx.store.update(model_1.COLL.assets, a.id, { nextPm: next ? clean(next) : null });
        }
    }
}
// ─── Interventions ──────────────────────────────────────────────────────────
async function createWorkOrder(ctx, data) {
    const asset = await getAsset(ctx, data.assetId);
    if (asset.isArchived)
        fail('failed-precondition', 'Machine archivée.');
    const settings = await settingsOf(ctx);
    const id = ctx.store.newId(model_1.COLL.workOrders);
    const priority = isPriority(data.priority) ? data.priority : 'P3';
    const assignees = data.assigneeIds?.length
        ? { ids: data.assigneeIds, names: data.assigneeNames || [] }
        : await defaultAssignees(ctx, asset);
    const wo = {
        id,
        number: await counterNumber(ctx, 'INT'),
        kind: data.kind,
        workRequestId: data.workRequestId || null,
        pmPlanId: data.pmPlanId || null,
        generatedAutomatically: !!data.generatedAutomatically,
        assetId: asset.id,
        assetCode: asset.code,
        assetName: asset.name,
        siteId: asset.siteId,
        clientId: asset.clientId || null,
        typologyId: asset.typologyId || null,
        title: data.title,
        description: data.description || '',
        priority,
        dueDate: data.dueDate || (0, rules_1.dueDateFor)(priority, ctx.now, settings.priorityDelays),
        interventionType: data.interventionType || settings.interventionTypes[0] || 'Autre',
        procedure: data.procedure || '',
        checklistId: data.checklistId || null,
        safetyCheckRequired: data.safetyCheckRequired ?? !!settings.safetyChecklistId,
        estimatedHours: data.estimatedHours ?? null,
        resourceType: data.resourceType || 'INTERNE',
        assigneeIds: assignees.ids,
        assigneeNames: assignees.names,
        externalProvider: data.externalProvider || null,
        plannedStart: null,
        plannedEnd: null,
        status: 'A_PLANIFIER',
        photos: [],
        createdAt: ctx.now.toISOString(),
        createdById: ctx.actor.id,
        createdByName: ctx.actor.name,
    };
    await ctx.store.set(model_1.COLL.workOrders, id, clean(wo));
    return wo;
}
async function approveRequest(ctx, req, opts) {
    if (req.status !== 'A_TRAITER')
        fail('failed-precondition', 'Ce signalement a déjà été traité.');
    if (req.kind === 'REMARQUE' && !opts.force)
        fail('failed-precondition', 'Une remarque ne génère pas d’intervention : marquez-la comme lue.');
    const settings = await settingsOf(ctx);
    const priority = isPriority(opts.priority) ? opts.priority : req.priority;
    let assignees;
    if (ctx.actor.role === 'RESPONSABLE' && Array.isArray(opts.assigneeIds) && opts.assigneeIds.length)
        assignees = await resolveAssignees(ctx, opts.assigneeIds);
    else if (ctx.actor.role === 'TECHNICIEN' && opts.takeIt)
        assignees = { ids: [ctx.actor.id], names: [ctx.actor.name] };
    const wo = await createWorkOrder(ctx, {
        kind: 'CORRECTIF',
        assetId: req.assetId,
        title: (opts.title || '').trim() || req.description.slice(0, 80),
        description: `${req.description}${req.requesterName ? `\n\nSignalé par ${req.requesterName}${req.requesterContact ? ` (${req.requesterContact})` : ''}` : ''}`,
        priority,
        dueDate: (0, rules_1.dueDateFor)(priority, new Date(req.createdAt), settings.priorityDelays),
        interventionType: opts.interventionType || undefined,
        checklistId: opts.checklistId || null,
        procedure: opts.procedure || '',
        workRequestId: req.id,
        ...(assignees ? { assigneeIds: assignees.ids, assigneeNames: assignees.names } : {}),
    });
    await ctx.store.update(model_1.COLL.requests, req.id, {
        status: 'APPROUVEE',
        priority,
        dueDate: wo.dueDate,
        workOrderId: wo.id,
        decisionById: ctx.actor.id,
        decisionByName: ctx.actor.name,
        decisionAt: ctx.now.toISOString(),
    });
    ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_APPROVED', targetId: req.id, targetName: req.number, details: { intervention: wo.number, priority } });
    for (const uid of wo.assigneeIds) {
        if (uid !== ctx.actor.id)
            ctx.effects.push({ type: 'notifyUser', userId: uid, level: priority === 'P1' ? 'CRITICAL' : 'INFO', title: `${wo.number} · ${wo.assetCode}`, message: `Nouvelle intervention : ${wo.title}` });
    }
    return wo;
}
async function syncRequestStatus(ctx, wo, status, cancelReason) {
    if (!wo.workRequestId)
        return;
    await ctx.store.update(model_1.COLL.requests, wo.workRequestId, { status, ...(cancelReason ? { cancelReason } : {}) });
}
/** Un technicien peut exécuter une intervention qui lui est attribuée, ou une intervention libre de son parc. */
async function claimForExecution(ctx, wo) {
    if (ctx.actor.role !== 'TECHNICIEN')
        return {};
    if (wo.assigneeIds.includes(ctx.actor.id))
        return {};
    const asset = await getAsset(ctx, wo.assetId);
    if (wo.assigneeIds.length || !(0, rules_1.inPerimeter)(asset, ctx.actor.id))
        fail('permission-denied', "Cette intervention ne vous est pas attribuée.");
    return { assigneeIds: [ctx.actor.id], assigneeNames: [ctx.actor.name] };
}
async function closeWorkOrder(ctx, wo, p) {
    if (!['PLANIFIE', 'EN_COURS', 'EN_ATTENTE', 'A_PLANIFIER'].includes(wo.status))
        fail('failed-precondition', 'Cette intervention est déjà réalisée ou annulée.');
    const claim = await claimForExecution(ctx, wo);
    const settings = await settingsOf(ctx);
    const report = str(p.report, "compte rendu d'intervention");
    const actualStart = str(p.actualStart || wo.startedAt, 'début réel');
    const actualEnd = str(p.actualEnd, 'fin réelle');
    if (new Date(actualEnd).getTime() <= new Date(actualStart).getTime())
        fail('invalid-argument', 'La fin réelle doit être après le début.');
    if (new Date(actualEnd).getTime() > ctx.now.getTime() + 5 * 60000)
        fail('invalid-argument', 'La fin réelle ne peut pas être dans le futur.');
    const safetyAnswers = wo.status === 'EN_COURS' ? wo.safetyAnswers || null : await checkSafety(ctx, wo, p.safetyAnswers);
    if (wo.checklistId) {
        const chk = await ctx.store.get(model_1.COLL.checklists, wo.checklistId);
        if (chk && !chk.isArchived)
            validateAnswers(chk, p.checklistAnswers, false);
    }
    const assetStateAfter = isState(p.assetStateAfter) ? p.assetStateAfter : 'OPERATIONNEL';
    const asset = await getAsset(ctx, wo.assetId);
    const meterAtClose = num(p.meterAtClose);
    if (meterAtClose != null && asset.meterType && (asset.meterValue == null || meterAtClose > asset.meterValue)) {
        await addMeterReading(ctx, asset, meterAtClose, wo.id);
    }
    await ctx.store.update(model_1.COLL.workOrders, wo.id, clean({
        ...claim,
        status: 'CLOTURE', report, actualStart, actualEnd,
        startedAt: wo.startedAt || actualStart,
        startedByName: wo.startedByName || ctx.actor.name,
        safetyAnswers,
        checklistAnswers: p.checklistAnswers || null,
        photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string').slice(0, 12) : (wo.photos || []),
        meterAtClose: meterAtClose ?? null,
        assetStateAfter,
        closedAt: ctx.now.toISOString(), closedById: ctx.actor.id, closedByName: ctx.actor.name,
    }));
    const stateReason = assetStateAfter === 'OPERATIONNEL' ? null : ((p.assetStateReason || '').trim() || `Suite ${wo.number}`);
    await setAssetState(ctx, asset, assetStateAfter, stateReason, wo.id);
    if (!asset.lastMaintenanceAt || asset.lastMaintenanceAt < actualEnd)
        await ctx.store.update(model_1.COLL.assets, asset.id, { lastMaintenanceAt: actualEnd });
    await syncRequestStatus(ctx, wo, 'CLOTUREE');
    if (wo.pmPlanId) {
        const plan = await ctx.store.get(model_1.COLL.pmPlans, wo.pmPlanId);
        if (plan) {
            const schedule = { ...(plan.schedule || {}) };
            schedule[wo.assetId] = (0, rules_1.nextEntryAfterCompletion)(plan, schedule[wo.assetId], actualEnd, meterAtClose ?? asset.meterValue, settings.utcOffsetMinutes);
            await ctx.store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
        }
    }
    await refreshNextPm(ctx, [wo.assetId]);
    if (ctx.actor.role === 'TECHNICIEN') {
        ctx.effects.push({ type: 'notifyManagers', level: 'INFO', title: `${wo.number} réalisée`, message: `${ctx.actor.name} · ${wo.assetCode} : ${report.slice(0, 100)}` });
    }
    ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CLOSED', targetId: wo.id, targetName: wo.number, details: { asset: wo.assetCode, state: assetStateAfter } });
}
// ─── Préventif : génération des interventions échues ────────────────────────
async function runPreventiveScan(ctx) {
    const settings = await settingsOf(ctx);
    const plans = (await ctx.store.list(model_1.COLL.pmPlans)).filter(p => p.isActive && !p.isArchived);
    const assets = await ctx.store.list(model_1.COLL.assets);
    const created = [];
    for (const plan of plans) {
        const schedule = { ...(plan.schedule || {}) };
        let changed = false;
        for (const assetId of plan.assetIds) {
            const asset = assets.find(a => a.id === assetId && !a.isArchived);
            const entry = schedule[assetId];
            if (!asset || !(0, rules_1.isPmDue)(plan, entry, asset, ctx.now))
                continue;
            const dueDate = plan.trigger === 'CALENDAIRE' && entry?.nextDueAt ? entry.nextDueAt : (0, rules_1.dueDateFor)(plan.priority, ctx.now, settings.priorityDelays);
            const contact = asset.contactName || asset.contactPhone ? ` Contacter : ${[asset.contactName, asset.contactPhone].filter(Boolean).join(' · ')}.` : '';
            const wo = await createWorkOrder(ctx, {
                kind: 'PREVENTIF',
                assetId,
                title: plan.name,
                description: [
                    plan.trigger === 'COMPTEUR' && entry?.nextDueMeter != null ? `Échéance à ${entry.nextDueMeter.toLocaleString('fr-FR')} ${asset.meterType ? model_1.METER_UNIT[asset.meterType] : ''} (relevé actuel : ${(asset.meterValue || 0).toLocaleString('fr-FR')}).` : '',
                    plan.consumables ? `Consommables : ${plan.consumables}` : '',
                    contact.trim(),
                ].filter(Boolean).join('\n'),
                priority: plan.priority,
                dueDate,
                interventionType: plan.interventionType,
                procedure: plan.procedure || '',
                checklistId: plan.checklistId || null,
                safetyCheckRequired: plan.safetyCheckRequired,
                estimatedHours: plan.estimatedHours ?? null,
                pmPlanId: plan.id,
                generatedAutomatically: true,
            });
            schedule[assetId] = { ...(entry || {}), openWorkOrderId: wo.id };
            changed = true;
            created.push(wo);
            for (const uid of wo.assigneeIds) {
                ctx.effects.push({ type: 'notifyUser', userId: uid, level: 'INFO', title: `Préventif · ${asset.code}`, message: `${plan.name}${contact}` });
            }
        }
        if (changed)
            await ctx.store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
    }
    if (created.length) {
        ctx.effects.push({
            type: 'notifyManagers', level: 'INFO',
            title: 'Préventif à planifier',
            message: `${created.length} intervention(s) préventive(s) générée(s) : ${created.slice(0, 3).map(w => `${w.assetCode} – ${w.title}`).join(', ')}${created.length > 3 ? '…' : ''}`,
        });
        await refreshNextPm(ctx, Array.from(new Set(created.map(w => w.assetId))));
    }
    return created;
}
// ─── Machines ───────────────────────────────────────────────────────────────
async function nextAssetCode(ctx, assets) {
    const settings = await settingsOf(ctx);
    const prefix = (settings.assetCodePrefix || 'MAC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'MAC';
    const used = new Set(assets.map(a => a.code.toUpperCase()));
    for (;;) {
        const n = await ctx.store.nextNumber('ASSET');
        const code = `${prefix}-${String(n).padStart(4, '0')}`;
        if (!used.has(code))
            return code;
    }
}
async function validTechnicians(ctx, ids) {
    if (!Array.isArray(ids))
        return [];
    const techs = (await usersOf(ctx)).filter(u => u.role === 'TECHNICIEN').map(u => u.id);
    return Array.from(new Set(ids.filter((id) => typeof id === 'string' && techs.includes(id))));
}
async function validClientId(ctx, id) {
    if (!id)
        return null;
    const c = await ctx.store.get(model_1.COLL.clients, id);
    if (!c || c.isArchived)
        fail('invalid-argument', 'Client introuvable ou archivé.');
    return c.id;
}
async function validTypology(ctx, id) {
    if (!id)
        return null;
    const t = await ctx.store.get(model_1.COLL.typologies, id);
    if (!t || t.isArchived)
        fail('invalid-argument', 'Typologie introuvable ou archivée.');
    return t;
}
/** Ajoute la machine aux gammes types de sa typologie. */
async function attachTypologyPlans(ctx, asset) {
    if (!asset.typologyId || asset.level !== 'EQUIPEMENT')
        return [];
    const settings = await settingsOf(ctx);
    const plans = (await ctx.store.list(model_1.COLL.pmPlans)).filter(p => !p.isArchived && p.typologyId === asset.typologyId && !p.assetIds.includes(asset.id));
    const attached = [];
    for (const plan of plans) {
        if (plan.trigger === 'COMPTEUR' && !asset.meterType)
            continue;
        const entry = (0, rules_1.initialScheduleEntry)(plan, asset, ctx.now, settings.utcOffsetMinutes);
        await ctx.store.update(model_1.COLL.pmPlans, plan.id, { assetIds: [...plan.assetIds, asset.id], schedule: clean({ ...(plan.schedule || {}), [asset.id]: entry }) });
        attached.push(plan.name);
    }
    return attached;
}
async function createAsset(ctx, p, assets) {
    const settings = await settingsOf(ctx);
    const nowIso = ctx.now.toISOString();
    const name = str(p.name, 'désignation', true, 200);
    let parent;
    if (p.parentId) {
        if (!settings.assetHierarchy)
            fail('failed-precondition', 'Les sous-ensembles sont désactivés dans les réglages.');
        parent = assets.find(a => a.id === p.parentId);
        if (!parent)
            fail('invalid-argument', 'Machine parente introuvable.');
        if (parent.level === 'COMPOSANT')
            fail('invalid-argument', 'Un composant ne peut pas avoir d’enfant.');
    }
    let code = typeof p.code === 'string' ? p.code.trim().toUpperCase() : '';
    if (!code) {
        if (settings.assetCodeMode === 'MANUAL')
            fail('invalid-argument', 'Le code machine est obligatoire.');
        code = await nextAssetCode(ctx, assets);
    }
    if (code.length > 40)
        fail('invalid-argument', 'Code machine trop long.');
    if (assets.some(a => a.code.toUpperCase() === code && !a.isArchived))
        fail('invalid-argument', `Le code ${code} existe déjà.`);
    const level = parent ? (parent.level === 'EQUIPEMENT' ? (p.level === 'COMPOSANT' ? 'COMPOSANT' : 'SOUS_EQUIPEMENT') : 'COMPOSANT') : 'EQUIPEMENT';
    if (level === 'EQUIPEMENT')
        await checkQuota(ctx, 'assets', 1);
    const typology = parent ? (p.typologyId ? await validTypology(ctx, p.typologyId) : null) : await validTypology(ctx, p.typologyId);
    const siteId = parent ? parent.siteId : str(p.siteId, 'site');
    if (!parent) {
        const site = await ctx.store.get(model_1.COLL.sites, siteId);
        if (!site)
            fail('invalid-argument', 'Site introuvable.');
    }
    const meterType = p.meterType === 'KM' || p.meterType === 'HEURES' ? p.meterType : p.meterType === undefined ? (typology?.meterType || null) : null;
    const id = ctx.store.newId(model_1.COLL.assets);
    const asset = {
        id, code, name, level,
        parentId: parent ? parent.id : null,
        typologyId: typology?.id || (parent ? parent.typologyId : null) || null,
        siteId,
        location: str(p.location, 'localisation', false, 200),
        clientId: parent ? parent.clientId : await validClientId(ctx, p.clientId),
        technicianIds: parent ? parent.technicianIds || [] : await validTechnicians(ctx, p.technicianIds),
        brand: str(p.brand, 'marque', false, 100), model: str(p.model, 'modèle', false, 100),
        serialNumber: str(p.serialNumber, 'n° de série', false, 100), registration: str(p.registration, 'immatriculation', false, 40),
        commissioningDate: typeof p.commissioningDate === 'string' ? p.commissioningDate : '',
        contactName: str(p.contactName, 'référent', false, 120), contactPhone: str(p.contactPhone, 'téléphone', false, 40),
        state: 'OPERATIONNEL', stateReason: null, stateSince: nowIso,
        meterType,
        meterValue: meterType ? num(p.meterValue) : null,
        meterUpdatedAt: meterType && num(p.meterValue) != null ? nowIso : null,
        documents: [],
        qrToken: randomToken(),
        nextPm: null,
        lastMaintenanceAt: null,
        notes: str(p.notes, 'notes', false, 4000),
        isArchived: false,
        createdAt: nowIso,
    };
    await ctx.store.set(model_1.COLL.assets, id, clean(asset));
    await ctx.store.registerQr(asset.qrToken, id);
    assets.push(asset);
    return asset;
}
/** Propage site, client et périmètre d'une machine à ses sous-ensembles, et le client à son historique. */
async function propagateScope(ctx, root, updates) {
    const all = await ctx.store.list(model_1.COLL.assets);
    const descendants = (pid) => all.filter(a => a.parentId === pid).flatMap(c => [c, ...descendants(c.id)]);
    const family = [root, ...descendants(root.id)];
    const childUpdates = clean({ siteId: updates.siteId, clientId: 'clientId' in updates ? updates.clientId : undefined, technicianIds: updates.technicianIds });
    for (const child of family.slice(1))
        if (Object.keys(childUpdates).length)
            await ctx.store.update(model_1.COLL.assets, child.id, childUpdates);
    if ('clientId' in updates) {
        const ids = new Set(family.map(a => a.id));
        for (const c of [model_1.COLL.workOrders, model_1.COLL.requests, model_1.COLL.assetEvents]) {
            for (const d of await ctx.store.list(c))
                if (ids.has(d.assetId) && (d.clientId || null) !== (updates.clientId || null))
                    await ctx.store.update(c, d.id, { clientId: updates.clientId || null });
        }
    }
    if (updates.siteId) {
        const ids = new Set(family.map(a => a.id));
        for (const w of await ctx.store.list(model_1.COLL.workOrders))
            if (ids.has(w.assetId) && model_1.OPEN_WORK_ORDER_STATUSES.includes(w.status) && w.siteId !== updates.siteId)
                await ctx.store.update(model_1.COLL.workOrders, w.id, { siteId: updates.siteId });
    }
}
// ─── Formulaire public du QR code ───────────────────────────────────────────
exports.PUBLIC_LIMITS = { perAssetPerHour: 5, perTenantPerDay: 60, minFillMs: 2500, maxPhotos: 3 };
async function assetByToken(store, token) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(token || '')))
        return null;
    return (await store.list(model_1.COLL.assets)).find(a => a.qrToken === token && !a.isArchived) || null;
}
/**
 * Actions sans compte : INFO (ce que montre la page du QR code) et REPORT (signalement).
 * Les garde-fous anti-spam d'ici s'ajoutent à la limite par adresse IP de la Cloud Function.
 */
async function handlePublicAction(ctx, action, p) {
    p = p || {};
    const { store, now } = ctx;
    const asset = await assetByToken(store, p.token);
    if (!asset)
        fail('not-found', 'Ce QR code ne correspond à aucune machine active.');
    const settings = await settingsOf(ctx);
    const tenant = await store.getTenantInfo();
    const [sites, typologies, clients] = await Promise.all([
        store.list(model_1.COLL.sites), store.list(model_1.COLL.typologies), store.list(model_1.COLL.clients),
    ]);
    if (action === 'INFO') {
        return {
            organization: tenant.name,
            enabled: settings.publicReports,
            asset: {
                code: asset.code, name: asset.name,
                typology: typologies.find(t => t.id === asset.typologyId)?.name || null,
                site: sites.find(s => s.id === asset.siteId)?.name || null,
                location: asset.location || null,
                client: clients.find(c => c.id === asset.clientId)?.name || null,
            },
        };
    }
    if (action !== 'REPORT')
        fail('invalid-argument', 'Action inconnue.');
    if (!settings.publicReports)
        fail('failed-precondition', 'Le signalement par QR code est désactivé pour cette organisation.');
    // Garde-fous : champ piège, délai minimal de saisie, contenu minimal, débit par machine et par organisation.
    if (p.website)
        fail('invalid-argument', 'Signalement refusé.');
    if (typeof p.elapsedMs === 'number' && p.elapsedMs < exports.PUBLIC_LIMITS.minFillMs)
        fail('invalid-argument', 'Merci de prendre le temps de décrire le problème.');
    const name = str(p.name, 'votre nom', true, 80);
    if (name.length < 2)
        fail('invalid-argument', 'Indiquez votre nom.');
    const description = str(p.description, 'description', true, 2000);
    if (description.length < 8)
        fail('invalid-argument', 'Décrivez le problème en quelques mots (8 caractères minimum).');
    if (/(https?:\/\/|www\.)/i.test(description))
        fail('invalid-argument', 'Les liens ne sont pas acceptés dans un signalement.');
    const contact = str(p.contact, 'contact', false, 120);
    const requests = await store.list(model_1.COLL.requests);
    const publicOnes = requests.filter(r => r.source === 'QR_PUBLIC');
    const hourAgo = now.getTime() - 3600000, dayAgo = now.getTime() - 86400000;
    if (publicOnes.filter(r => r.assetId === asset.id && new Date(r.createdAt).getTime() > hourAgo).length >= exports.PUBLIC_LIMITS.perAssetPerHour) {
        fail('resource-exhausted', 'Cette machine a déjà été signalée plusieurs fois dans l’heure : l’équipe maintenance est prévenue.');
    }
    if (publicOnes.filter(r => new Date(r.createdAt).getTime() > dayAgo).length >= exports.PUBLIC_LIMITS.perTenantPerDay) {
        fail('resource-exhausted', 'Trop de signalements aujourd’hui. Réessayez plus tard ou prévenez directement l’équipe.');
    }
    const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const dup = requests.find(r => r.assetId === asset.id && r.status === 'A_TRAITER' && norm(r.description) === norm(description));
    if (dup)
        return { number: dup.number, duplicate: true };
    const safety = !!p.safety;
    const declaredState = isState(p.declaredState) ? p.declaredState : 'OPERATIONNEL';
    const priority = (0, rules_1.suggestPriority)({ safety, declaredState });
    const photos = (Array.isArray(p.photos) ? p.photos : []).filter((x) => typeof x === 'string').slice(0, exports.PUBLIC_LIMITS.maxPhotos);
    const id = store.newId(model_1.COLL.requests);
    const req = {
        id, number: await counterNumber(ctx, 'SIG'), kind: 'PROBLEME', source: 'QR_PUBLIC',
        assetId: asset.id, assetCode: asset.code, assetName: asset.name, siteId: asset.siteId, clientId: asset.clientId || null,
        description, photos, requesterId: null, requesterName: name, requesterContact: contact || null, createdAt: now.toISOString(),
        safety, declaredState, suggestedPriority: priority, priority,
        dueDate: (0, rules_1.dueDateFor)(priority, now, settings.priorityDelays),
        status: 'A_TRAITER', workOrderId: null,
    };
    await store.set(model_1.COLL.requests, id, clean(req));
    await notifyTeam(ctx, asset, `${req.number} · ${asset.code} (QR code)`, `${name} : ${description.slice(0, 120)}`, priority === 'P1' ? 'CRITICAL' : 'WARNING');
    ctx.effects.push({ type: 'audit', action: 'GMAO_PUBLIC_REPORT', targetId: id, targetName: req.number, details: { asset: asset.code } });
    return { number: req.number };
}
// ─── Point d'entrée ─────────────────────────────────────────────────────────
async function handleGmaoAction(ctx, action, p) {
    if (!PERMISSIONS[action])
        fail('invalid-argument', `Action inconnue : ${action}`);
    if (!canDo(ctx.actor.role, action))
        fail('permission-denied', 'Action non autorisée pour votre profil.');
    p = p || {};
    const { store, actor, now } = ctx;
    const nowIso = now.toISOString();
    const isResp = actor.role === 'RESPONSABLE';
    const isTech = actor.role === 'TECHNICIEN';
    switch (action) {
        case 'USERS_LIST': {
            return (await usersOf(ctx)).map(u => ({ id: u.id, name: u.name, role: u.role, clientId: u.clientId || null }));
        }
        // ── Sites, typologies, clients ──
        case 'SITE_SAVE': {
            const name = str(p.name, 'nom du site', true, 120);
            const id = p.id || store.newId(model_1.COLL.sites);
            const existing = p.id ? await store.get(model_1.COLL.sites, p.id) : null;
            const site = { ...(existing || {}), id, name, address: str(p.address, 'adresse', false, 300), status: p.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE' };
            await store.set(model_1.COLL.sites, id, clean(site));
            return { id };
        }
        case 'TYPOLOGY_SAVE': {
            const name = str(p.name, 'nom de la typologie', true, 80);
            const all = await store.list(model_1.COLL.typologies);
            if (all.some(t => t.id !== p.id && !t.isArchived && t.name.toLowerCase() === name.toLowerCase()))
                fail('invalid-argument', `La typologie « ${name} » existe déjà.`);
            const existing = p.id ? all.find(t => t.id === p.id) : null;
            const id = existing?.id || store.newId(model_1.COLL.typologies);
            const t = {
                id, name,
                meterType: p.meterType === 'KM' || p.meterType === 'HEURES' ? p.meterType : null,
                defaultChecklistId: p.defaultChecklistId || null,
                isArchived: false, createdAt: existing?.createdAt || nowIso,
            };
            await store.set(model_1.COLL.typologies, id, clean(t));
            return { id };
        }
        case 'TYPOLOGY_ARCHIVE': {
            const t = await store.get(model_1.COLL.typologies, str(p.id, 'typologie'));
            if (!t)
                fail('not-found', 'Typologie introuvable.');
            await store.update(model_1.COLL.typologies, t.id, { isArchived: true });
            return { success: true };
        }
        case 'CLIENT_SAVE': {
            const name = str(p.name, 'nom du client', true, 120);
            const all = await store.list(model_1.COLL.clients);
            const existing = p.id ? all.find(c => c.id === p.id) : null;
            if (p.id && !existing)
                fail('not-found', 'Client introuvable.');
            if (all.some(c => c.id !== p.id && !c.isArchived && c.name.toLowerCase() === name.toLowerCase()))
                fail('invalid-argument', `Le client « ${name} » existe déjà.`);
            const restoring = existing?.isArchived && p.isArchived === false;
            if (!existing || restoring)
                await checkQuota(ctx, 'clients', 1);
            const id = existing?.id || store.newId(model_1.COLL.clients);
            const c = {
                id, name,
                contactName: str(p.contactName, 'contact', false, 120), email: str(p.email, 'e-mail', false, 160),
                phone: str(p.phone, 'téléphone', false, 40), address: str(p.address, 'adresse', false, 300), notes: str(p.notes, 'notes', false, 2000),
                isArchived: existing ? (restoring ? false : existing.isArchived) : false,
                createdAt: existing?.createdAt || nowIso,
            };
            await store.set(model_1.COLL.clients, id, clean(c));
            return { id };
        }
        case 'CLIENT_ARCHIVE': {
            const c = await store.get(model_1.COLL.clients, str(p.id, 'client'));
            if (!c)
                fail('not-found', 'Client introuvable.');
            const linked = (await store.list(model_1.COLL.assets)).filter(a => a.clientId === c.id && !a.isArchived && a.level === 'EQUIPEMENT');
            if (linked.length)
                fail('failed-precondition', `${linked.length} machine(s) active(s) sont rattachées à ce client : rattachez-les ailleurs ou archivez-les d'abord.`);
            await store.update(model_1.COLL.clients, c.id, { isArchived: true });
            return { success: true };
        }
        // ── Machines ──
        case 'ASSET_CREATE': {
            const assets = await store.list(model_1.COLL.assets);
            const asset = await createAsset(ctx, p, assets);
            const attached = p.applyTypologyPlans === false ? [] : await attachTypologyPlans(ctx, asset);
            if (attached.length) {
                await runPreventiveScan(ctx);
                await refreshNextPm(ctx, [asset.id]);
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_ASSET_CREATED', targetId: asset.id, targetName: `${asset.code} ${asset.name}` });
            return { id: asset.id, code: asset.code, attachedPlans: attached };
        }
        case 'ASSET_IMPORT': {
            const rows = Array.isArray(p.rows) ? p.rows.slice(0, 500) : [];
            if (!rows.length)
                fail('invalid-argument', 'Aucune ligne à importer.');
            const settings = await settingsOf(ctx);
            const assets = await store.list(model_1.COLL.assets);
            const sites = await store.list(model_1.COLL.sites);
            const typologies = (await store.list(model_1.COLL.typologies)).filter(t => !t.isArchived);
            const clients = (await store.list(model_1.COLL.clients)).filter(c => !c.isArchived);
            const key = (s) => String(s || '').trim().toLowerCase();
            const errors = [];
            const codes = new Set(assets.filter(a => !a.isArchived).map(a => a.code.toUpperCase()));
            rows.forEach((r, i) => {
                const line = `Ligne ${i + 2}`;
                if (!String(r.name || '').trim())
                    errors.push(`${line} : désignation manquante.`);
                if (!String(r.site || '').trim() && !sites.length)
                    errors.push(`${line} : site manquant.`);
                const code = String(r.code || '').trim().toUpperCase();
                if (!code && settings.assetCodeMode === 'MANUAL')
                    errors.push(`${line} : code manquant.`);
                if (code && codes.has(code))
                    errors.push(`${line} : le code ${code} existe déjà.`);
                if (code)
                    codes.add(code);
                if (r.client && !clients.some(c => key(c.name) === key(r.client)))
                    errors.push(`${line} : client « ${r.client} » inconnu (créez-le d'abord dans Réglages).`);
            });
            if (errors.length)
                return { created: 0, errors: errors.slice(0, 30) };
            await checkQuota(ctx, 'assets', rows.length);
            let created = 0;
            for (const r of rows) {
                let site = sites.find(s => key(s.name) === key(r.site)) || (!r.site ? sites[0] : undefined);
                if (!site) {
                    const id = store.newId(model_1.COLL.sites);
                    site = { id, name: String(r.site).trim(), status: 'ACTIVE' };
                    await store.set(model_1.COLL.sites, id, clean(site));
                    sites.push(site);
                }
                let typology = r.typology ? typologies.find(t => key(t.name) === key(r.typology)) : undefined;
                if (r.typology && !typology) {
                    const id = store.newId(model_1.COLL.typologies);
                    typology = { id, name: String(r.typology).trim(), meterType: r.meterValue ? 'KM' : null, isArchived: false, createdAt: nowIso };
                    await store.set(model_1.COLL.typologies, id, clean(typology));
                    typologies.push(typology);
                }
                const client = r.client ? clients.find(c => key(c.name) === key(r.client)) : undefined;
                const asset = await createAsset(ctx, {
                    code: r.code, name: r.name, siteId: site.id, typologyId: typology?.id || null, clientId: client?.id || null,
                    brand: r.brand, model: r.model, serialNumber: r.serialNumber, registration: r.registration, location: r.location,
                    contactName: r.contactName, contactPhone: r.contactPhone, meterValue: r.meterValue, technicianIds: p.technicianIds,
                    ...(typology ? {} : { meterType: null }),
                }, assets);
                if (p.applyTypologyPlans !== false)
                    await attachTypologyPlans(ctx, asset);
                created++;
            }
            await runPreventiveScan(ctx);
            await refreshNextPm(ctx);
            ctx.effects.push({ type: 'audit', action: 'GMAO_ASSETS_IMPORTED', details: { count: created } });
            return { created, errors: [] };
        }
        case 'ASSET_UPDATE': {
            const asset = await getAsset(ctx, p.id);
            const u = p.updates || {};
            const allowed = ['name', 'location', 'brand', 'model', 'serialNumber', 'registration', 'commissioningDate', 'notes', 'meterType', 'siteId', 'contactName', 'contactPhone'];
            const updates = {};
            for (const k of allowed)
                if (k in u)
                    updates[k] = typeof u[k] === 'string' ? u[k].trim() : u[k];
            if ('meterType' in updates && !['KM', 'HEURES'].includes(updates.meterType))
                updates.meterType = null;
            if ('code' in u) {
                const code = str(u.code, 'code machine', true, 40).toUpperCase();
                const assets = await store.list(model_1.COLL.assets);
                if (assets.some(a => a.id !== asset.id && a.code.toUpperCase() === code && !a.isArchived))
                    fail('invalid-argument', `Le code ${code} existe déjà.`);
                updates.code = code;
            }
            if ('typologyId' in u)
                updates.typologyId = (await validTypology(ctx, u.typologyId))?.id || null;
            if ('clientId' in u)
                updates.clientId = await validClientId(ctx, u.clientId);
            if ('technicianIds' in u)
                updates.technicianIds = await validTechnicians(ctx, u.technicianIds);
            if ('name' in updates && !updates.name)
                fail('invalid-argument', 'La désignation est obligatoire.');
            if (asset.parentId) {
                delete updates.siteId;
                delete updates.clientId;
                delete updates.technicianIds;
            }
            await store.update(model_1.COLL.assets, asset.id, clean(updates));
            if (!asset.parentId && (updates.siteId || 'clientId' in updates || 'technicianIds' in updates))
                await propagateScope(ctx, asset, updates);
            if (updates.code || updates.name) {
                for (const w of await store.list(model_1.COLL.workOrders))
                    if (w.assetId === asset.id && model_1.OPEN_WORK_ORDER_STATUSES.includes(w.status))
                        await store.update(model_1.COLL.workOrders, w.id, clean({ assetCode: updates.code, assetName: updates.name }));
            }
            return { success: true };
        }
        case 'ASSET_ARCHIVE':
        case 'ASSET_RESTORE': {
            const asset = await getAsset(ctx, p.id);
            const archive = action === 'ASSET_ARCHIVE';
            if (archive) {
                const wos = await store.list(model_1.COLL.workOrders);
                if (wos.some(w => w.assetId === asset.id && model_1.OPEN_WORK_ORDER_STATUSES.includes(w.status))) {
                    fail('failed-precondition', 'Des interventions sont encore ouvertes sur cette machine.');
                }
                const all = await store.list(model_1.COLL.assets);
                if (all.some(a => a.parentId === asset.id && !a.isArchived))
                    fail('failed-precondition', 'Archivez d’abord les sous-ensembles et composants.');
            }
            else if (asset.level === 'EQUIPEMENT') {
                await checkQuota(ctx, 'assets', 1);
                const all = await store.list(model_1.COLL.assets);
                if (all.some(a => a.id !== asset.id && !a.isArchived && a.code.toUpperCase() === asset.code.toUpperCase()))
                    fail('failed-precondition', `Le code ${asset.code} est déjà utilisé par une machine active.`);
            }
            await store.update(model_1.COLL.assets, asset.id, { isArchived: archive });
            ctx.effects.push({ type: 'audit', action: archive ? 'GMAO_ASSET_ARCHIVED' : 'GMAO_ASSET_RESTORED', targetId: asset.id, targetName: asset.code });
            return { success: true };
        }
        case 'ASSET_ADD_DOCUMENT': {
            const asset = await getAsset(ctx, p.id);
            const doc = {
                id: store.newId(model_1.COLL.assets), name: str(p.name, 'nom du document', true, 200), url: str(p.url, 'fichier', true, 4000000),
                uploadedAt: nowIso, uploadedByName: actor.name,
            };
            await store.update(model_1.COLL.assets, asset.id, { documents: [...(asset.documents || []), doc] });
            return { id: doc.id };
        }
        case 'ASSET_REMOVE_DOCUMENT': {
            const asset = await getAsset(ctx, p.id);
            await store.update(model_1.COLL.assets, asset.id, { documents: (asset.documents || []).filter(d => d.id !== p.documentId) });
            return { success: true };
        }
        case 'ASSET_SET_STATE': {
            const asset = await getAsset(ctx, p.id);
            requirePerimeter(ctx, asset);
            const state = p.state;
            if (!isState(state))
                fail('invalid-argument', 'État invalide.');
            const reason = str(p.reason, 'motif', false, 300);
            if (state !== 'OPERATIONNEL' && !reason)
                fail('invalid-argument', "Le motif est obligatoire quand la machine n'est pas opérationnelle.");
            await setAssetState(ctx, asset, state, reason || null);
            if (state === 'INDISPONIBLE') {
                ctx.effects.push({ type: 'notifyManagers', level: 'WARNING', title: `${asset.code} à l'arrêt`, message: `${actor.name} : ${reason}` });
            }
            return { success: true };
        }
        case 'METER_ADD': {
            const asset = await getAsset(ctx, p.id);
            requirePerimeter(ctx, asset);
            const value = num(p.value);
            if (value == null || value < 0)
                fail('invalid-argument', 'Relevé invalide.');
            await addMeterReading(ctx, asset, value);
            const created = await runPreventiveScan(ctx);
            await refreshNextPm(ctx, [asset.id]);
            return { success: true, generatedWorkOrders: created.map(w => `${w.number} (${w.title})`) };
        }
        // ── Signalements ──
        case 'REQUEST_CREATE': {
            const asset = await getAsset(ctx, p.assetId);
            if (asset.isArchived)
                fail('failed-precondition', 'Machine archivée.');
            if (actor.role === 'CLIENT')
                requirePerimeter(ctx, asset);
            const settings = await settingsOf(ctx);
            const kind = p.kind === 'REMARQUE' ? 'REMARQUE' : 'PROBLEME';
            const description = str(p.description, 'description', true, 2000);
            const safety = kind === 'PROBLEME' && !!p.safety;
            const declaredState = kind === 'PROBLEME' && isState(p.declaredState) ? p.declaredState : 'OPERATIONNEL';
            const suggested = (0, rules_1.suggestPriority)({ safety, declaredState, remark: kind === 'REMARQUE' });
            const priority = isResp && isPriority(p.priority) ? p.priority : suggested;
            const id = store.newId(model_1.COLL.requests);
            const req = {
                id, number: await counterNumber(ctx, 'SIG'), kind, source: 'APP',
                assetId: asset.id, assetCode: asset.code, assetName: asset.name, siteId: asset.siteId, clientId: asset.clientId || null,
                description, photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string').slice(0, 6) : [],
                requesterId: actor.id, requesterName: actor.name, createdAt: nowIso,
                safety, declaredState, suggestedPriority: suggested, priority,
                dueDate: (0, rules_1.dueDateFor)(priority, now, settings.priorityDelays),
                status: 'A_TRAITER', workOrderId: null,
            };
            await store.set(model_1.COLL.requests, id, clean(req));
            if (declaredState !== 'OPERATIONNEL' && severity[declaredState] > severity[asset.state]) {
                await setAssetState(ctx, asset, declaredState, `${req.number} : ${description.slice(0, 80)}`);
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_CREATED', targetId: id, targetName: req.number, details: { asset: asset.code, priority, kind } });
            let wo = null;
            const direct = kind === 'PROBLEME' && (isResp ? p.autoApprove !== false : !settings.requireApproval);
            if (direct) {
                wo = await approveRequest(ctx, req, { priority, interventionType: p.interventionType, title: p.title, assigneeIds: p.assigneeIds, takeIt: isTech && p.takeIt });
            }
            const label = kind === 'REMARQUE' ? 'Remarque' : wo ? `Intervention ${wo.number}` : 'Signalement à traiter';
            await notifyTeam(ctx, asset, `${req.number} · ${asset.code} · ${label}`, `${actor.name} : ${description.slice(0, 120)}`, priority === 'P1' ? 'CRITICAL' : kind === 'REMARQUE' ? 'INFO' : 'WARNING', [actor.id]);
            return { id, number: req.number, workOrderId: wo?.id || null, workOrderNumber: wo?.number || null };
        }
        case 'REQUEST_APPROVE': {
            const req = await store.get(model_1.COLL.requests, p.id);
            if (!req)
                fail('not-found', 'Signalement introuvable.');
            if (isTech) {
                const settings = await settingsOf(ctx);
                if (settings.requireApproval)
                    fail('permission-denied', 'Les signalements sont validés par le responsable maintenance.');
                requirePerimeter(ctx, await getAsset(ctx, req.assetId));
            }
            const wo = await approveRequest(ctx, req, { ...p, takeIt: isTech && p.takeIt !== false });
            if (req.requesterId && req.requesterId !== actor.id) {
                ctx.effects.push({ type: 'notifyUser', userId: req.requesterId, level: 'INFO', title: `${req.number} pris en charge`, message: `Intervention ${wo.number} créée (${model_1.PRIORITY_WORD[wo.priority].toLowerCase()}).` });
            }
            return { workOrderId: wo.id, number: wo.number };
        }
        case 'REQUEST_CANCEL': {
            const req = await store.get(model_1.COLL.requests, p.id);
            if (!req)
                fail('not-found', 'Signalement introuvable.');
            if (req.status !== 'A_TRAITER')
                fail('failed-precondition', "Ce signalement est déjà pris en charge : annulez l'intervention si besoin.");
            if (isTech) {
                const settings = await settingsOf(ctx);
                if (settings.requireApproval)
                    fail('permission-denied', 'Les signalements sont validés par le responsable maintenance.');
                requirePerimeter(ctx, await getAsset(ctx, req.assetId));
            }
            const reason = str(p.reason, 'motif', true, 500);
            await store.update(model_1.COLL.requests, req.id, { status: 'ANNULEE', cancelReason: reason, falseReport: !!p.falseReport, decisionById: actor.id, decisionByName: actor.name, decisionAt: nowIso });
            if (p.restoreAssetState) {
                const asset = await getAsset(ctx, req.assetId);
                await setAssetState(ctx, asset, 'OPERATIONNEL', null);
            }
            if (req.requesterId && req.requesterId !== actor.id) {
                ctx.effects.push({ type: 'notifyUser', userId: req.requesterId, level: 'INFO', title: `${req.number} classé sans suite`, message: reason });
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_CANCELLED', targetId: req.id, targetName: req.number, details: { reason, falseReport: !!p.falseReport } });
            return { success: true };
        }
        case 'REQUEST_ACK': {
            const req = await store.get(model_1.COLL.requests, p.id);
            if (!req)
                fail('not-found', 'Signalement introuvable.');
            if (req.status !== 'A_TRAITER')
                fail('failed-precondition', 'Déjà traité.');
            if (isTech)
                requirePerimeter(ctx, await getAsset(ctx, req.assetId));
            await store.update(model_1.COLL.requests, req.id, { status: 'CLOTUREE', decisionById: actor.id, decisionByName: actor.name, decisionAt: nowIso, cancelReason: str(p.note, 'réponse', false, 500) || null });
            if (req.requesterId && req.requesterId !== actor.id) {
                ctx.effects.push({ type: 'notifyUser', userId: req.requesterId, level: 'INFO', title: `${req.number} lu par la maintenance`, message: p.note ? String(p.note).slice(0, 200) : `${actor.name} a pris connaissance de votre remarque.` });
            }
            return { success: true };
        }
        // ── Interventions ──
        case 'WO_CREATE':
        case 'WO_RECORD': {
            const asset = await getAsset(ctx, str(p.assetId, 'machine'));
            requirePerimeter(ctx, asset);
            const assignees = isResp ? await resolveAssignees(ctx, p.assigneeIds) : { ids: [actor.id], names: [actor.name] };
            const wo = await createWorkOrder(ctx, {
                kind: p.kind === 'PREVENTIF' ? 'PREVENTIF' : 'CORRECTIF',
                assetId: asset.id,
                title: str(p.title, 'intitulé', true, 200),
                description: str(p.description, 'description', false, 4000),
                priority: p.priority,
                interventionType: p.interventionType,
                procedure: str(p.procedure, 'mode opératoire', false, 8000),
                checklistId: p.checklistId || null,
                safetyCheckRequired: p.safetyCheckRequired,
                estimatedHours: num(p.estimatedHours),
                resourceType: p.resourceType === 'EXTERNE' ? 'EXTERNE' : 'INTERNE',
                externalProvider: p.externalProvider,
                dueDate: p.dueDate || undefined,
                ...(assignees.ids.length ? { assigneeIds: assignees.ids, assigneeNames: assignees.names } : {}),
            });
            ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CREATED', targetId: wo.id, targetName: wo.number });
            if (action === 'WO_RECORD') {
                await closeWorkOrder(ctx, wo, p);
            }
            else {
                for (const uid of wo.assigneeIds)
                    if (uid !== actor.id)
                        ctx.effects.push({ type: 'notifyUser', userId: uid, level: 'INFO', title: `${wo.number} · ${wo.assetCode}`, message: `Nouvelle intervention : ${wo.title}` });
            }
            return { id: wo.id, number: wo.number };
        }
        case 'WO_UPDATE': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!model_1.OPEN_WORK_ORDER_STATUSES.includes(wo.status))
                fail('failed-precondition', 'Intervention réalisée ou annulée.');
            const settings = await settingsOf(ctx);
            const u = p.updates || {};
            const allowed = ['title', 'description', 'interventionType', 'procedure', 'checklistId', 'safetyCheckRequired', 'resourceType', 'externalProvider', 'dueDate'];
            const updates = {};
            for (const k of allowed)
                if (k in u)
                    updates[k] = u[k];
            if ('estimatedHours' in u)
                updates.estimatedHours = num(u.estimatedHours);
            if ('priority' in u) {
                if (!isPriority(u.priority))
                    fail('invalid-argument', 'Priorité invalide.');
                updates.priority = u.priority;
                if (!('dueDate' in u) && !wo.pmPlanId)
                    updates.dueDate = (0, rules_1.dueDateFor)(u.priority, new Date(wo.createdAt), settings.priorityDelays);
            }
            if ('title' in updates && !String(updates.title).trim())
                fail('invalid-argument', "L'intitulé est obligatoire.");
            await store.update(model_1.COLL.workOrders, wo.id, clean(updates));
            return { success: true };
        }
        case 'WO_PLAN': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_ATTENTE'].includes(wo.status))
                fail('failed-precondition', 'Cette intervention ne peut plus être planifiée.');
            const settings = await settingsOf(ctx);
            const start = str(p.plannedStart, 'début prévu');
            const end = str(p.plannedEnd, 'fin prévue');
            if (new Date(end).getTime() <= new Date(start).getTime())
                fail('invalid-argument', 'La fin doit être après le début.');
            let resourceType = p.resourceType === 'EXTERNE' ? 'EXTERNE' : (p.resourceType === 'INTERNE' ? 'INTERNE' : wo.resourceType);
            let { ids, names } = await resolveAssignees(ctx, p.assigneeIds);
            if (isTech) {
                if (!settings.techniciansSelfPlan)
                    fail('permission-denied', 'Le planning est géré par le responsable maintenance.');
                if (wo.assigneeIds.some(x => x !== actor.id))
                    fail('permission-denied', 'Cette intervention est attribuée à un autre technicien.');
                requirePerimeter(ctx, await getAsset(ctx, wo.assetId));
                ids = [actor.id];
                names = [actor.name];
                resourceType = 'INTERNE';
            }
            if (resourceType === 'INTERNE' && !ids.length)
                fail('invalid-argument', 'Choisissez au moins un technicien.');
            const externalProvider = resourceType === 'EXTERNE' ? str(p.externalProvider ?? wo.externalProvider, 'prestataire externe', true, 120) : null;
            await store.update(model_1.COLL.workOrders, wo.id, clean({
                plannedStart: start, plannedEnd: end, assigneeIds: ids, assigneeNames: names,
                resourceType, externalProvider, status: 'PLANIFIE', holdReason: null,
            }));
            await syncRequestStatus(ctx, wo, 'PLANIFIEE');
            const when = new Date(start);
            const tz = 'Pacific/Noumea';
            for (const uid of ids) {
                if (uid === actor.id)
                    continue;
                if (!wo.assigneeIds.includes(uid) || wo.plannedStart !== start) {
                    ctx.effects.push({ type: 'notifyUser', userId: uid, level: wo.priority === 'P1' ? 'CRITICAL' : 'INFO', title: `${wo.number} · ${wo.assetCode}`, message: `${wo.title} — prévue le ${when.toLocaleDateString('fr-FR', { timeZone: tz })} à ${when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz })}` });
                }
            }
            return { success: true };
        }
        case 'WO_UNPLAN': {
            const wo = await getWorkOrder(ctx, p.id);
            if (wo.status !== 'PLANIFIE')
                fail('failed-precondition', 'Seule une intervention planifiée peut être retirée du planning.');
            if (isTech) {
                const settings = await settingsOf(ctx);
                if (!settings.techniciansSelfPlan || wo.assigneeIds.some(x => x !== actor.id))
                    fail('permission-denied', 'Le planning est géré par le responsable maintenance.');
            }
            await store.update(model_1.COLL.workOrders, wo.id, { plannedStart: null, plannedEnd: null, ...(isTech ? {} : { assigneeIds: [], assigneeNames: [] }), status: 'A_PLANIFIER' });
            await syncRequestStatus(ctx, wo, 'APPROUVEE');
            return { success: true };
        }
        case 'WO_HOLD': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_COURS'].includes(wo.status))
                fail('failed-precondition', 'Statut incompatible.');
            if (isTech && !wo.assigneeIds.includes(actor.id))
                fail('permission-denied', "Cette intervention ne vous est pas attribuée.");
            const reason = str(p.reason, 'raison de la mise en attente', true, 300);
            await store.update(model_1.COLL.workOrders, wo.id, { status: 'EN_ATTENTE', holdReason: reason });
            if (isTech)
                ctx.effects.push({ type: 'notifyManagers', level: 'INFO', title: `${wo.number} en attente`, message: `${actor.name} : ${reason}` });
            return { success: true };
        }
        case 'WO_CANCEL': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!model_1.OPEN_WORK_ORDER_STATUSES.includes(wo.status))
                fail('failed-precondition', 'Intervention déjà réalisée ou annulée.');
            const settings = await settingsOf(ctx);
            const reason = str(p.reason, "motif d'annulation", true, 300);
            await store.update(model_1.COLL.workOrders, wo.id, { status: 'ANNULE', cancelReason: reason, closedAt: nowIso, closedById: actor.id, closedByName: actor.name });
            await syncRequestStatus(ctx, wo, 'ANNULEE', reason);
            if (wo.pmPlanId) {
                const plan = await store.get(model_1.COLL.pmPlans, wo.pmPlanId);
                if (plan) {
                    const schedule = { ...(plan.schedule || {}) };
                    schedule[wo.assetId] = (0, rules_1.skipOccurrence)(plan, schedule[wo.assetId], settings.utcOffsetMinutes);
                    await store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
                    await refreshNextPm(ctx, [wo.assetId]);
                }
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CANCELLED', targetId: wo.id, targetName: wo.number, details: { reason } });
            return { success: true };
        }
        case 'WO_START': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_ATTENTE'].includes(wo.status))
                fail('failed-precondition', 'Cette intervention ne peut pas être démarrée.');
            const claim = await claimForExecution(ctx, wo);
            const safetyAnswers = await checkSafety(ctx, wo, p.safetyAnswers);
            await store.update(model_1.COLL.workOrders, wo.id, clean({ ...claim, status: 'EN_COURS', startedAt: nowIso, startedByName: actor.name, safetyAnswers, holdReason: null }));
            if (p.immobilize) {
                const asset = await getAsset(ctx, wo.assetId);
                await setAssetState(ctx, asset, 'INDISPONIBLE', `Intervention ${wo.number}`, wo.id);
            }
            return { success: true };
        }
        case 'WO_CLOSE': {
            const wo = await getWorkOrder(ctx, p.id);
            await closeWorkOrder(ctx, wo, p);
            return { success: true };
        }
        // ── Préventif ──
        case 'PM_SAVE': {
            const settings = await settingsOf(ctx);
            const name = str(p.name, 'nom de la gamme', true, 160);
            const trigger = p.trigger === 'COMPTEUR' ? 'COMPTEUR' : 'CALENDAIRE';
            const recurrence = trigger === 'CALENDAIRE' ? (0, recurrence_1.normalizeRecurrence)(p.recurrence) : null;
            const meterInterval = trigger === 'COMPTEUR' ? num(p.meterInterval) : null;
            if (trigger === 'COMPTEUR' && (!meterInterval || meterInterval <= 0))
                fail('invalid-argument', 'Intervalle compteur invalide.');
            const typology = await validTypology(ctx, p.typologyId);
            const assetIds = Array.isArray(p.assetIds) ? Array.from(new Set(p.assetIds)) : [];
            if (!assetIds.length && !typology)
                fail('invalid-argument', 'Associez au moins une machine, ou une typologie pour une gamme type.');
            const assets = await store.list(model_1.COLL.assets);
            for (const id of assetIds) {
                const a = assets.find(x => x.id === id);
                if (!a)
                    fail('invalid-argument', 'Machine introuvable.');
                if (trigger === 'COMPTEUR' && !a.meterType)
                    fail('invalid-argument', `${a.code} n'a pas de compteur : une gamme au compteur est impossible.`);
            }
            const existing = p.id ? await store.get(model_1.COLL.pmPlans, p.id) : null;
            const id = existing?.id || store.newId(model_1.COLL.pmPlans);
            const ruleChanged = !existing || existing.trigger !== trigger
                || JSON.stringify(existing.recurrence || null) !== JSON.stringify(recurrence)
                || (existing.meterInterval || null) !== (meterInterval || null)
                || (p.firstDate && trigger === 'CALENDAIRE');
            const base = { trigger, recurrence, meterInterval };
            const schedule = {};
            for (const aid of assetIds) {
                const prev = existing?.schedule?.[aid];
                if (prev && !ruleChanged)
                    schedule[aid] = prev;
                else
                    schedule[aid] = { ...(0, rules_1.initialScheduleEntry)(base, assets.find(a => a.id === aid), now, settings.utcOffsetMinutes, p.firstDate || null, num(p.firstMeter)), openWorkOrderId: prev?.openWorkOrderId || null };
            }
            const plan = {
                id, name,
                typologyId: typology?.id || null,
                assetIds, trigger, recurrence, meterInterval,
                meterAnchor: p.meterAnchor === 'FIXE' ? 'FIXE' : 'REALISATION',
                alertBefore: Math.max(0, num(p.alertBefore) ?? 0),
                interventionType: str(p.interventionType, "type d'intervention", false, 80) || settings.interventionTypes[0] || 'Autre',
                priority: isPriority(p.priority) ? p.priority : 'P3',
                procedure: str(p.procedure, 'mode opératoire', false, 8000),
                checklistId: p.checklistId || null,
                consumables: str(p.consumables, 'consommables', false, 500),
                estimatedHours: num(p.estimatedHours),
                safetyCheckRequired: !!p.safetyCheckRequired,
                isActive: existing ? existing.isActive : p.isActive !== false,
                isArchived: false,
                schedule,
                createdAt: existing?.createdAt || nowIso,
            };
            await store.set(model_1.COLL.pmPlans, id, clean(plan));
            ctx.effects.push({ type: 'audit', action: existing ? 'GMAO_PM_UPDATED' : 'GMAO_PM_CREATED', targetId: id, targetName: name });
            const created = plan.isActive ? await runPreventiveScan(ctx) : [];
            await refreshNextPm(ctx, Array.from(new Set([...assetIds, ...(existing?.assetIds || [])])));
            return { id, generatedWorkOrders: created.map(w => w.number) };
        }
        case 'PM_TOGGLE': {
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            await store.update(model_1.COLL.pmPlans, plan.id, { isActive: !!p.isActive });
            const created = p.isActive ? await runPreventiveScan(ctx) : [];
            await refreshNextPm(ctx, plan.assetIds);
            return { success: true, generatedWorkOrders: created.map(w => w.number) };
        }
        case 'PM_ARCHIVE': {
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            await store.update(model_1.COLL.pmPlans, plan.id, { isArchived: true, isActive: false });
            await refreshNextPm(ctx, plan.assetIds);
            return { success: true };
        }
        case 'PM_SET_NEXT': {
            const settings = await settingsOf(ctx);
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            const entry = plan.schedule?.[p.assetId];
            if (!entry)
                fail('invalid-argument', "Cette machine n'est pas dans la gamme.");
            const next = { ...entry, ended: false };
            if (plan.trigger === 'CALENDAIRE') {
                const d = str(p.nextDate, 'prochaine échéance');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
                    fail('invalid-argument', 'Date invalide.');
                next.nextDueAt = (0, recurrence_1.isoOf)(d, settings.utcOffsetMinutes);
                if (plan.recurrence?.anchor === 'CALENDRIER' && p.shiftSeries)
                    next.startDate = d;
            }
            else {
                const m = num(p.nextDueMeter);
                if (m == null)
                    fail('invalid-argument', 'Valeur compteur invalide.');
                next.nextDueMeter = m;
                if (p.shiftSeries)
                    next.startMeter = m;
            }
            await store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean({ ...plan.schedule, [p.assetId]: next }) });
            if (entry.openWorkOrderId && plan.trigger === 'CALENDAIRE') {
                const wo = await store.get(model_1.COLL.workOrders, entry.openWorkOrderId);
                if (wo && wo.status === 'A_PLANIFIER')
                    await store.update(model_1.COLL.workOrders, wo.id, { dueDate: next.nextDueAt });
            }
            await refreshNextPm(ctx, [p.assetId]);
            return { success: true };
        }
        case 'PM_SCAN': {
            const created = await runPreventiveScan(ctx);
            return { generatedWorkOrders: created.map(w => w.number) };
        }
        // ── Planning ──
        case 'TASK_SAVE': {
            const settings = await settingsOf(ctx);
            const title = str(p.title, 'intitulé', true, 200);
            const start = str(p.start, 'début');
            const end = str(p.end, 'fin');
            if (new Date(end).getTime() <= new Date(start).getTime())
                fail('invalid-argument', 'La fin doit être après le début.');
            const existing = p.id ? await store.get(model_1.COLL.tasks, p.id) : null;
            let { ids, names } = await resolveAssignees(ctx, p.assigneeIds);
            if (isTech) {
                if (!settings.techniciansSelfPlan)
                    fail('permission-denied', 'Le planning est géré par le responsable maintenance.');
                if (existing && existing.assigneeIds.some(x => x !== actor.id))
                    fail('permission-denied', 'Cette tâche concerne d’autres personnes.');
                ids = [actor.id];
                names = [actor.name];
            }
            if (!ids.length)
                fail('invalid-argument', 'Choisissez au moins une personne.');
            const id = existing?.id || store.newId(model_1.COLL.tasks);
            const task = {
                id, title,
                kind: ['TACHE', 'CONGE', 'FORMATION', 'ABSENCE', 'REUNION'].includes(p.kind) ? p.kind : 'TACHE',
                assigneeIds: ids, assigneeNames: names,
                siteId: p.siteId || null, assetId: p.assetId || null, start, end, notes: str(p.notes, 'notes', false, 2000),
                status: existing?.status || 'A_FAIRE', doneAt: existing?.doneAt || null,
                createdById: existing?.createdById || actor.id, createdByName: existing?.createdByName || actor.name,
                createdAt: existing?.createdAt || nowIso,
            };
            await store.set(model_1.COLL.tasks, id, clean(task));
            if (!existing && task.kind === 'TACHE') {
                for (const uid of ids)
                    if (uid !== actor.id) {
                        ctx.effects.push({ type: 'notifyUser', userId: uid, level: 'INFO', title: 'Nouvelle tâche', message: `${title} — ${new Date(start).toLocaleDateString('fr-FR', { timeZone: 'Pacific/Noumea' })}` });
                    }
            }
            return { id };
        }
        case 'TASK_DELETE': {
            const task = await store.get(model_1.COLL.tasks, str(p.id, 'tâche'));
            if (!task)
                fail('not-found', 'Tâche introuvable.');
            if (isTech) {
                const settings = await settingsOf(ctx);
                if (!settings.techniciansSelfPlan || task.assigneeIds.some(x => x !== actor.id))
                    fail('permission-denied', 'Le planning est géré par le responsable maintenance.');
            }
            await store.remove(model_1.COLL.tasks, task.id);
            return { success: true };
        }
        case 'TASK_TOGGLE_DONE': {
            const task = await store.get(model_1.COLL.tasks, p.id);
            if (!task)
                fail('not-found', 'Tâche introuvable.');
            if (isTech && !task.assigneeIds.includes(actor.id))
                fail('permission-denied', "Cette tâche ne vous est pas attribuée.");
            const done = !!p.done;
            await store.update(model_1.COLL.tasks, task.id, { status: done ? 'FAIT' : 'A_FAIRE', doneAt: done ? nowIso : null });
            return { success: true };
        }
        // ── Check-lists ──
        case 'CHECKLIST_SAVE': {
            const name = str(p.name, 'nom de la check-list', true, 160);
            const items = (Array.isArray(p.items) ? p.items : [])
                .map((it, i) => {
                const type = ['BOOLEAN', 'CHOICE', 'TEXT', 'NUMBER', 'PHOTO'].includes(it.type) ? it.type : 'BOOLEAN';
                const options = type === 'CHOICE' ? (Array.isArray(it.options) ? it.options : String(it.options || '').split(/[;\n]/)).map((o) => String(o).trim()).filter(Boolean).slice(0, 12) : undefined;
                return clean({
                    id: it.id || `item_${i}_${Math.random().toString(36).slice(2, 7)}`,
                    label: String(it.label || '').trim().slice(0, 200),
                    type, required: !!it.required, options,
                });
            })
                .filter((it) => it.label);
            if (!items.length)
                fail('invalid-argument', 'Ajoutez au moins un point de contrôle.');
            const bad = items.find((it) => it.type === 'CHOICE' && (!it.options || it.options.length < 2));
            if (bad)
                fail('invalid-argument', `« ${bad.label} » : indiquez au moins deux choix.`);
            const kind = p.kind === 'SECURITE' ? 'SECURITE' : 'MAINTENANCE';
            const id = p.id || store.newId(model_1.COLL.checklists);
            const chk = {
                id, name, kind, description: str(p.description, 'description', false, 1000), items, isArchived: false,
                triggerType: kind === 'SECURITE' ? 'SAFETY' : 'MAINTENANCE', targetContext: 'ALL',
            };
            await store.set(model_1.COLL.checklists, id, clean(chk));
            return { id };
        }
        case 'CHECKLIST_ARCHIVE': {
            await store.update(model_1.COLL.checklists, str(p.id, 'check-list'), { isArchived: true });
            const settings = await settingsOf(ctx);
            if (settings.safetyChecklistId === p.id)
                await store.saveSettings({ ...settings, safetyChecklistId: null });
            return { success: true };
        }
        // ── Réglages ──
        case 'SETTINGS_SAVE': {
            const next = { ...(await settingsOf(ctx)) };
            for (const k of ['requireApproval', 'techniciansSelfPlan', 'publicReports', 'assetHierarchy'])
                if (k in p)
                    next[k] = !!p[k];
            if ('safetyChecklistId' in p)
                next.safetyChecklistId = p.safetyChecklistId || null;
            if ('assetCodeMode' in p)
                next.assetCodeMode = p.assetCodeMode === 'MANUAL' ? 'MANUAL' : 'GENERATED';
            if ('assetCodePrefix' in p) {
                const prefix = String(p.assetCodePrefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                if (!prefix)
                    fail('invalid-argument', 'Préfixe invalide (lettres et chiffres, 6 maximum).');
                next.assetCodePrefix = prefix;
            }
            if ('priorityDelays' in p) {
                const d = {};
                for (const pr of model_1.PRIORITIES) {
                    const v = num(p.priorityDelays?.[pr]);
                    if (v == null || v < 0 || v > 365)
                        fail('invalid-argument', `Délai invalide pour la priorité ${model_1.PRIORITY_WORD[pr].toLowerCase()}.`);
                    d[pr] = Math.round(v);
                }
                next.priorityDelays = d;
            }
            if ('interventionTypes' in p) {
                const list = (Array.isArray(p.interventionTypes) ? p.interventionTypes : []).map((x) => String(x).trim()).filter(Boolean);
                const unique = Array.from(new Set(list)).slice(0, 30);
                if (!unique.length)
                    fail('invalid-argument', "Gardez au moins un type d'intervention.");
                next.interventionTypes = unique;
            }
            await store.saveSettings(next);
            ctx.memo.settings = next;
            return { success: true };
        }
        case 'KIT_APPLY': {
            const kit = (0, kits_1.kitById)(String(p.kitId || ''));
            if (!kit)
                fail('invalid-argument', 'Kit inconnu.');
            const key = (s) => s.trim().toLowerCase();
            const checklists = (await store.list(model_1.COLL.checklists)).filter(c => !c.isArchived);
            const typologies = (await store.list(model_1.COLL.typologies)).filter(t => !t.isArchived);
            const plans = (await store.list(model_1.COLL.pmPlans)).filter(x => !x.isArchived);
            const chkIds = {};
            const typIds = {};
            let added = 0;
            for (const c of kit.checklists) {
                const found = checklists.find(x => key(x.name) === key(c.name));
                chkIds[c.key] = found ? found.id : (await handleGmaoAction(ctx, 'CHECKLIST_SAVE', { name: c.name, kind: c.kind, items: c.items })).id;
                if (!found)
                    added++;
            }
            for (const t of kit.typologies) {
                const found = typologies.find(x => key(x.name) === key(t.name));
                typIds[t.key] = found ? found.id : (await handleGmaoAction(ctx, 'TYPOLOGY_SAVE', { name: t.name, meterType: t.meterType, defaultChecklistId: t.checklistKey ? chkIds[t.checklistKey] : null })).id;
                if (!found)
                    added++;
            }
            for (const pl of kit.plans) {
                const typologyId = typIds[pl.typologyKey];
                if (plans.some(x => key(x.name) === key(pl.name) && x.typologyId === typologyId))
                    continue;
                const assetIds = (await store.list(model_1.COLL.assets))
                    .filter(a => !a.isArchived && a.level === 'EQUIPEMENT' && a.typologyId === typologyId && (pl.trigger !== 'COMPTEUR' || a.meterType))
                    .map(a => a.id);
                await handleGmaoAction(ctx, 'PM_SAVE', {
                    name: pl.name, typologyId, assetIds, trigger: pl.trigger, recurrence: pl.recurrence, meterInterval: pl.meterInterval,
                    alertBefore: pl.alertBefore, interventionType: pl.interventionType, priority: pl.priority,
                    checklistId: pl.checklistKey ? chkIds[pl.checklistKey] : null, estimatedHours: pl.estimatedHours,
                    consumables: pl.consumables, procedure: pl.procedure,
                });
                added++;
            }
            return { added };
        }
    }
    return fail('invalid-argument', `Action non gérée : ${action}`);
}
//# sourceMappingURL=core.js.map