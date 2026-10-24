"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmaoError = void 0;
exports.canDo = canDo;
exports.runPreventiveScan = runPreventiveScan;
exports.handleGmaoAction = handleGmaoAction;
// Cœur métier GMAO : toutes les mutations passent par handleGmaoAction.
// Exécuté côté serveur (Cloud Function `gmaoAction`) et, en mode démo, dans le navigateur.
const model_1 = require("./model");
const rules_1 = require("./rules");
class GmaoError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.GmaoError = GmaoError;
function fail(code, msg) { throw new GmaoError(code, msg); }
// ─── Permissions ────────────────────────────────────────────────────────────
const R = ['RESPONSABLE'];
const RT = ['RESPONSABLE', 'TECHNICIEN'];
const ALL = ['RESPONSABLE', 'TECHNICIEN', 'DEMANDEUR'];
const PERMISSIONS = {
    SITE_SAVE: R,
    ASSET_CREATE: R, ASSET_UPDATE: R, ASSET_ARCHIVE: R, ASSET_RESTORE: R,
    ASSET_ADD_DOCUMENT: R, ASSET_REMOVE_DOCUMENT: R,
    ASSET_SET_STATE: RT, METER_ADD: RT,
    REQUEST_CREATE: ALL, REQUEST_APPROVE: R, REQUEST_CANCEL: R,
    WO_CREATE: R, WO_UPDATE: R, WO_PLAN: R, WO_UNPLAN: R, WO_HOLD: R, WO_CANCEL: R,
    WO_START: RT, WO_CLOSE: RT,
    PM_SAVE: R, PM_TOGGLE: R, PM_ARCHIVE: R, PM_SET_NEXT: R, PM_SCAN: R,
    TASK_SAVE: R, TASK_DELETE: R, TASK_TOGGLE_DONE: RT,
    CHECKLIST_SAVE: R, CHECKLIST_ARCHIVE: R,
    SETTINGS_SAVE: R,
};
function canDo(role, action) {
    return (PERMISSIONS[action] || []).includes(role);
}
// ─── Utilitaires ────────────────────────────────────────────────────────────
const clean = (o) => JSON.parse(JSON.stringify(o));
const str = (v, field, required = true) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (required && !s)
        fail('invalid-argument', `Champ obligatoire manquant : ${field}.`);
    return s;
};
const num = (v) => {
    if (v === '' || v === null || v === undefined)
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const isPriority = (p) => model_1.PRIORITIES.includes(p);
async function counterNumber(ctx, prefix) {
    const year = ctx.now.getFullYear();
    const n = await ctx.store.nextNumber(`${prefix}-${year}`);
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}
async function getAsset(ctx, id) {
    const a = await ctx.store.get(model_1.COLL.assets, id);
    if (!a)
        fail('not-found', 'Équipement introuvable.');
    return a;
}
async function getWorkOrder(ctx, id) {
    const w = await ctx.store.get(model_1.COLL.workOrders, id);
    if (!w)
        fail('not-found', 'Bon de travail introuvable.');
    return w;
}
async function setAssetState(ctx, asset, toState, reason, workOrderId) {
    if (asset.state === toState && (asset.stateReason || null) === (reason || null))
        return;
    const at = ctx.now.toISOString();
    const ev = {
        id: ctx.store.newId(model_1.COLL.assetEvents), assetId: asset.id, type: 'STATE', at,
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
        fail('failed-precondition', "Cet équipement n'a pas de compteur.");
    if (asset.meterValue != null && value < asset.meterValue) {
        fail('invalid-argument', `Le relevé (${value}) est inférieur au dernier relevé (${asset.meterValue}).`);
    }
    const at = ctx.now.toISOString();
    const ev = {
        id: ctx.store.newId(model_1.COLL.assetEvents), assetId: asset.id, type: 'METER', at,
        byId: ctx.actor.id, byName: ctx.actor.name, value, workOrderId: workOrderId || null,
    };
    await ctx.store.set(model_1.COLL.assetEvents, ev.id, ev);
    await ctx.store.update(model_1.COLL.assets, asset.id, { meterValue: value, meterUpdatedAt: at });
    asset.meterValue = value;
}
async function resolveAssignees(ctx, ids) {
    const list = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
    if (!list.length)
        return { ids: [], names: [] };
    const users = await ctx.store.getUsers();
    const names = list.map(id => {
        const u = users.find(x => x.id === id);
        if (!u)
            fail('invalid-argument', 'Intervenant inconnu.');
        if (u.role === 'DEMANDEUR')
            fail('invalid-argument', `${u.name} n'est pas un intervenant maintenance.`);
        return u.name;
    });
    return { ids: list, names };
}
function validateAnswers(checklist, answers, safety) {
    for (const item of checklist.items) {
        const v = answers?.[item.id]?.value;
        const empty = v === undefined || v === null || v === '';
        if (item.required && empty)
            fail('invalid-argument', `Check-list « ${checklist.name} » : « ${item.label} » est obligatoire.`);
        if (safety && item.type === 'BOOLEAN' && item.required && v === false) {
            fail('failed-precondition', `Sécurité non validée : « ${item.label} ». L'intervention ne peut pas démarrer.`);
        }
    }
}
// ─── Créations de BT ────────────────────────────────────────────────────────
async function createWorkOrder(ctx, data) {
    const asset = await getAsset(ctx, data.assetId);
    const settings = await ctx.store.getSettings();
    const id = ctx.store.newId(model_1.COLL.workOrders);
    const priority = isPriority(data.priority) ? data.priority : 'P3';
    const wo = {
        id,
        number: await counterNumber(ctx, 'BT'),
        kind: data.kind,
        workRequestId: data.workRequestId || null,
        pmPlanId: data.pmPlanId || null,
        generatedAutomatically: !!data.generatedAutomatically,
        assetId: asset.id,
        assetCode: asset.code,
        assetName: asset.name,
        siteId: asset.siteId,
        title: data.title,
        description: data.description || '',
        priority,
        dueDate: data.dueDate || (0, rules_1.dueDateFor)(priority, ctx.now),
        interventionType: data.interventionType || 'MECANIQUE',
        procedure: data.procedure || '',
        checklistId: data.checklistId || null,
        safetyCheckRequired: data.safetyCheckRequired ?? !!settings.safetyChecklistId,
        estimatedHours: data.estimatedHours ?? null,
        resourceType: data.resourceType || 'INTERNE',
        assigneeIds: [],
        assigneeNames: [],
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
    if (req.status !== 'A_APPROUVER')
        fail('failed-precondition', 'Cette demande a déjà été traitée.');
    const priority = isPriority(opts.priority) ? opts.priority : req.priority;
    const wo = await createWorkOrder(ctx, {
        kind: 'CORRECTIF',
        assetId: req.assetId,
        title: (opts.title || '').trim() || req.description.slice(0, 80),
        description: req.description,
        priority,
        dueDate: (0, rules_1.dueDateFor)(priority, new Date(req.createdAt)),
        interventionType: opts.interventionType || 'MECANIQUE',
        checklistId: opts.checklistId || null,
        procedure: opts.procedure || '',
        workRequestId: req.id,
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
    ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_APPROVED', targetId: req.id, targetName: req.number, details: { bt: wo.number, priority } });
    return wo;
}
async function syncRequestStatus(ctx, wo, status, cancelReason) {
    if (!wo.workRequestId)
        return;
    await ctx.store.update(model_1.COLL.requests, wo.workRequestId, { status, ...(cancelReason ? { cancelReason } : {}) });
}
// ─── Préventif : génération des BT échus ────────────────────────────────────
async function runPreventiveScan(ctx) {
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
            const dueDate = plan.trigger === 'CALENDAIRE' && entry?.nextDueAt
                ? entry.nextDueAt
                : (0, rules_1.dueDateFor)(plan.priority, ctx.now);
            const wo = await createWorkOrder(ctx, {
                kind: 'PREVENTIF',
                assetId,
                title: plan.name,
                description: plan.consumables ? `Consommables : ${plan.consumables}` : '',
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
        }
        if (changed)
            await ctx.store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
    }
    if (created.length) {
        ctx.effects.push({
            type: 'notifyManagers', level: 'INFO',
            title: 'Préventif à planifier',
            message: `${created.length} bon(s) de travail préventif(s) généré(s) : ${created.slice(0, 3).map(w => `${w.assetCode} – ${w.title}`).join(', ')}${created.length > 3 ? '…' : ''}`,
        });
    }
    return created;
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
    switch (action) {
        // ── Sites ──
        case 'SITE_SAVE': {
            const name = str(p.name, 'nom du site');
            const id = p.id || store.newId(model_1.COLL.sites);
            const existing = p.id ? await store.get(model_1.COLL.sites, p.id) : null;
            const site = { ...(existing || {}), id, name, address: (p.address || '').trim(), status: p.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE' };
            await store.set(model_1.COLL.sites, id, clean(site));
            return { id };
        }
        // ── Équipements ──
        case 'ASSET_CREATE': {
            const code = str(p.code, 'code équipement').toUpperCase();
            const name = str(p.name, 'désignation');
            const assets = await store.list(model_1.COLL.assets);
            if (assets.some(a => a.code.toUpperCase() === code && !a.isArchived))
                fail('invalid-argument', `Le code ${code} existe déjà.`);
            let parent;
            if (p.parentId) {
                parent = assets.find(a => a.id === p.parentId);
                if (!parent)
                    fail('invalid-argument', 'Équipement parent introuvable.');
                if (parent.level === 'COMPOSANT')
                    fail('invalid-argument', 'Un composant ne peut pas avoir d’enfant.');
            }
            const level = parent ? (parent.level === 'EQUIPEMENT' ? (p.level === 'COMPOSANT' ? 'COMPOSANT' : 'SOUS_EQUIPEMENT') : 'COMPOSANT') : 'EQUIPEMENT';
            const siteId = parent ? parent.siteId : str(p.siteId, 'site');
            const id = store.newId(model_1.COLL.assets);
            const asset = {
                id, code, name, level,
                parentId: parent ? parent.id : null,
                family: parent ? parent.family : (p.family || 'EN'),
                componentCategory: level === 'EQUIPEMENT' ? null : (p.componentCategory || null),
                siteId,
                location: (p.location || '').trim(),
                company: parent ? parent.company : (p.company || 'CSP'),
                brand: (p.brand || '').trim(), model: (p.model || '').trim(),
                serialNumber: (p.serialNumber || '').trim(), registration: (p.registration || '').trim(),
                commissioningDate: p.commissioningDate || '',
                state: 'OPERATIONNEL', stateReason: null, stateSince: nowIso,
                meterType: p.meterType || null,
                meterValue: num(p.meterValue),
                meterUpdatedAt: num(p.meterValue) != null ? nowIso : null,
                documents: [],
                qrCode: `MIKI-A-${id}`,
                notes: (p.notes || '').trim(),
                isArchived: false,
                createdAt: nowIso,
            };
            await store.set(model_1.COLL.assets, id, clean(asset));
            ctx.effects.push({ type: 'audit', action: 'GMAO_ASSET_CREATED', targetId: id, targetName: `${code} ${name}` });
            return { id };
        }
        case 'ASSET_UPDATE': {
            const asset = await getAsset(ctx, p.id);
            const u = p.updates || {};
            const allowed = ['name', 'location', 'brand', 'model', 'serialNumber', 'registration', 'commissioningDate', 'notes', 'componentCategory', 'meterType', 'company', 'family', 'siteId'];
            const updates = {};
            for (const k of allowed)
                if (k in u)
                    updates[k] = typeof u[k] === 'string' ? u[k].trim() : u[k];
            if ('code' in u) {
                const code = str(u.code, 'code équipement').toUpperCase();
                const assets = await store.list(model_1.COLL.assets);
                if (assets.some(a => a.id !== asset.id && a.code.toUpperCase() === code && !a.isArchived))
                    fail('invalid-argument', `Le code ${code} existe déjà.`);
                updates.code = code;
            }
            if ('name' in updates && !updates.name)
                fail('invalid-argument', 'La désignation est obligatoire.');
            if (asset.parentId) {
                delete updates.siteId;
                delete updates.family;
                delete updates.company;
            }
            await store.update(model_1.COLL.assets, asset.id, clean(updates));
            // Les enfants suivent le site / la famille / la société du parent
            if (!asset.parentId && (updates.siteId || updates.family || updates.company)) {
                const all = await store.list(model_1.COLL.assets);
                const descendants = (pid) => all.filter(a => a.parentId === pid).flatMap(c => [c, ...descendants(c.id)]);
                for (const child of descendants(asset.id)) {
                    await store.update(model_1.COLL.assets, child.id, clean({ siteId: updates.siteId, family: updates.family, company: updates.company }));
                }
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
                    fail('failed-precondition', 'Des bons de travail sont encore ouverts sur cet équipement.');
                }
                const all = await store.list(model_1.COLL.assets);
                if (all.some(a => a.parentId === asset.id && !a.isArchived))
                    fail('failed-precondition', 'Archivez d’abord les sous-équipements et composants.');
            }
            await store.update(model_1.COLL.assets, asset.id, { isArchived: archive });
            ctx.effects.push({ type: 'audit', action: archive ? 'GMAO_ASSET_ARCHIVED' : 'GMAO_ASSET_RESTORED', targetId: asset.id, targetName: asset.code });
            return { success: true };
        }
        case 'ASSET_ADD_DOCUMENT': {
            const asset = await getAsset(ctx, p.id);
            const doc = {
                id: store.newId(model_1.COLL.assets), name: str(p.name, 'nom du document'), url: str(p.url, 'fichier'),
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
            const state = p.state;
            if (!['OPERATIONNEL', 'DEGRADE', 'INDISPONIBLE'].includes(state))
                fail('invalid-argument', 'État invalide.');
            const reason = (p.reason || '').trim();
            if (state !== 'OPERATIONNEL' && !reason)
                fail('invalid-argument', "Le motif est obligatoire quand l'équipement n'est pas opérationnel.");
            await setAssetState(ctx, asset, state, reason || null);
            if (state === 'INDISPONIBLE') {
                ctx.effects.push({ type: 'notifyManagers', level: 'WARNING', title: `${asset.code} indisponible`, message: `${actor.name} : ${reason}` });
            }
            return { success: true };
        }
        case 'METER_ADD': {
            const asset = await getAsset(ctx, p.id);
            const value = num(p.value);
            if (value == null || value < 0)
                fail('invalid-argument', 'Relevé invalide.');
            await addMeterReading(ctx, asset, value);
            const created = await runPreventiveScan(ctx);
            return { success: true, generatedWorkOrders: created.map(w => w.number) };
        }
        // ── Demandes d'intervention ──
        case 'REQUEST_CREATE': {
            const asset = await getAsset(ctx, p.assetId);
            if (asset.isArchived)
                fail('failed-precondition', 'Équipement archivé.');
            const description = str(p.description, 'description');
            const impact = {
                safety: !!p.impact?.safety,
                regulatory: !!p.impact?.regulatory,
                production: ['ARRET', 'DEGRADE', 'AUCUN', 'CONFORT'].includes(p.impact?.production) ? p.impact.production : 'AUCUN',
            };
            const suggested = (0, rules_1.suggestPriority)(impact);
            const priority = actor.role === 'RESPONSABLE' && isPriority(p.priority) ? p.priority : suggested;
            const declaredState = ['OPERATIONNEL', 'DEGRADE', 'INDISPONIBLE'].includes(p.declaredState) ? p.declaredState : 'OPERATIONNEL';
            const id = store.newId(model_1.COLL.requests);
            const req = {
                id, number: await counterNumber(ctx, 'DI'),
                assetId: asset.id, assetCode: asset.code, assetName: asset.name, siteId: asset.siteId,
                description, photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string') : [],
                requesterId: actor.id, requesterName: actor.name, createdAt: nowIso,
                impact, declaredState, suggestedPriority: suggested, priority,
                dueDate: (0, rules_1.dueDateFor)(priority, now),
                status: 'A_APPROUVER', workOrderId: null,
            };
            await store.set(model_1.COLL.requests, id, clean(req));
            if (declaredState !== 'OPERATIONNEL' && (declaredState !== asset.state)) {
                const severity = { OPERATIONNEL: 0, DEGRADE: 1, INDISPONIBLE: 2 };
                if (severity[declaredState] > severity[asset.state]) {
                    await setAssetState(ctx, asset, declaredState, `${req.number} : ${description.slice(0, 80)}`);
                }
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_CREATED', targetId: id, targetName: req.number, details: { asset: asset.code, priority } });
            let wo = null;
            if (actor.role === 'RESPONSABLE' && p.autoApprove) {
                wo = await approveRequest(ctx, req, { priority, interventionType: p.interventionType, title: p.title });
            }
            else {
                ctx.effects.push({
                    type: 'notifyManagers', level: priority === 'P1' ? 'CRITICAL' : 'WARNING',
                    title: `${req.number} · ${priority} · ${asset.code}`,
                    message: `${actor.name} : ${description.slice(0, 120)}`,
                });
            }
            return { id, number: req.number, workOrderId: wo?.id || null, workOrderNumber: wo?.number || null };
        }
        case 'REQUEST_APPROVE': {
            const req = await store.get(model_1.COLL.requests, p.id);
            if (!req)
                fail('not-found', 'Demande introuvable.');
            const wo = await approveRequest(ctx, req, p);
            if (req.requesterId !== actor.id) {
                ctx.effects.push({ type: 'notifyUser', userId: req.requesterId, level: 'INFO', title: `${req.number} approuvée`, message: `Bon de travail ${wo.number} créé (${wo.priority}).` });
            }
            return { workOrderId: wo.id, number: wo.number };
        }
        case 'REQUEST_CANCEL': {
            const req = await store.get(model_1.COLL.requests, p.id);
            if (!req)
                fail('not-found', 'Demande introuvable.');
            if (req.status !== 'A_APPROUVER')
                fail('failed-precondition', 'Seule une demande à approuver peut être annulée ici (annulez le bon de travail sinon).');
            const reason = str(p.reason, "motif d'annulation");
            await store.update(model_1.COLL.requests, req.id, { status: 'ANNULEE', cancelReason: reason, decisionById: actor.id, decisionByName: actor.name, decisionAt: nowIso });
            if (p.restoreAssetState) {
                const asset = await getAsset(ctx, req.assetId);
                await setAssetState(ctx, asset, 'OPERATIONNEL', null);
            }
            if (req.requesterId !== actor.id) {
                ctx.effects.push({ type: 'notifyUser', userId: req.requesterId, level: 'INFO', title: `${req.number} annulée`, message: reason });
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_REQUEST_CANCELLED', targetId: req.id, targetName: req.number, details: { reason } });
            return { success: true };
        }
        // ── Bons de travail ──
        case 'WO_CREATE': {
            const wo = await createWorkOrder(ctx, {
                kind: p.kind === 'PREVENTIF' ? 'PREVENTIF' : 'CORRECTIF',
                assetId: str(p.assetId, 'équipement'),
                title: str(p.title, 'intitulé'),
                description: p.description,
                priority: p.priority,
                interventionType: p.interventionType,
                procedure: p.procedure,
                checklistId: p.checklistId || null,
                safetyCheckRequired: p.safetyCheckRequired,
                estimatedHours: num(p.estimatedHours),
                resourceType: p.resourceType === 'EXTERNE' ? 'EXTERNE' : 'INTERNE',
                externalProvider: p.externalProvider,
                dueDate: p.dueDate || undefined,
            });
            ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CREATED', targetId: wo.id, targetName: wo.number });
            return { id: wo.id, number: wo.number };
        }
        case 'WO_UPDATE': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!model_1.OPEN_WORK_ORDER_STATUSES.includes(wo.status))
                fail('failed-precondition', 'Bon de travail clôturé ou annulé.');
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
                if (!('dueDate' in u))
                    updates.dueDate = (0, rules_1.dueDateFor)(u.priority, new Date(wo.createdAt));
            }
            if ('title' in updates && !String(updates.title).trim())
                fail('invalid-argument', "L'intitulé est obligatoire.");
            await store.update(model_1.COLL.workOrders, wo.id, clean(updates));
            return { success: true };
        }
        case 'WO_PLAN': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_ATTENTE'].includes(wo.status))
                fail('failed-precondition', 'Ce bon de travail ne peut plus être planifié.');
            const start = str(p.plannedStart, 'début prévu');
            const end = str(p.plannedEnd, 'fin prévue');
            if (new Date(end).getTime() <= new Date(start).getTime())
                fail('invalid-argument', 'La fin doit être après le début.');
            const resourceType = p.resourceType === 'EXTERNE' ? 'EXTERNE' : (p.resourceType === 'INTERNE' ? 'INTERNE' : wo.resourceType);
            const { ids, names } = await resolveAssignees(ctx, p.assigneeIds);
            if (resourceType === 'INTERNE' && !ids.length)
                fail('invalid-argument', 'Choisissez au moins un technicien.');
            const externalProvider = resourceType === 'EXTERNE' ? str(p.externalProvider ?? wo.externalProvider, 'prestataire externe') : null;
            await store.update(model_1.COLL.workOrders, wo.id, clean({
                plannedStart: start, plannedEnd: end, assigneeIds: ids, assigneeNames: names,
                resourceType, externalProvider, status: 'PLANIFIE', holdReason: null,
            }));
            await syncRequestStatus(ctx, wo, 'PLANIFIEE');
            const when = new Date(start);
            for (const uid of ids) {
                if (uid === actor.id)
                    continue;
                if (!wo.assigneeIds.includes(uid) || wo.plannedStart !== start) {
                    ctx.effects.push({ type: 'notifyUser', userId: uid, level: wo.priority === 'P1' ? 'CRITICAL' : 'INFO', title: `${wo.number} · ${wo.assetCode}`, message: `${wo.title} — prévu le ${when.toLocaleDateString('fr-FR', { timeZone: 'Pacific/Noumea' })} à ${when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Pacific/Noumea' })}` });
                }
            }
            return { success: true };
        }
        case 'WO_UNPLAN': {
            const wo = await getWorkOrder(ctx, p.id);
            if (wo.status !== 'PLANIFIE')
                fail('failed-precondition', 'Seul un bon planifié peut être retiré du planning.');
            await store.update(model_1.COLL.workOrders, wo.id, { plannedStart: null, plannedEnd: null, assigneeIds: [], assigneeNames: [], status: 'A_PLANIFIER' });
            await syncRequestStatus(ctx, wo, 'APPROUVEE');
            return { success: true };
        }
        case 'WO_HOLD': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_COURS'].includes(wo.status))
                fail('failed-precondition', 'Statut incompatible.');
            const reason = str(p.reason, 'raison de la mise en attente');
            await store.update(model_1.COLL.workOrders, wo.id, { status: 'EN_ATTENTE', holdReason: reason });
            return { success: true };
        }
        case 'WO_CANCEL': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!model_1.OPEN_WORK_ORDER_STATUSES.includes(wo.status))
                fail('failed-precondition', 'Bon déjà clôturé ou annulé.');
            const reason = str(p.reason, "motif d'annulation");
            await store.update(model_1.COLL.workOrders, wo.id, { status: 'ANNULE', cancelReason: reason, closedAt: nowIso, closedById: actor.id, closedByName: actor.name });
            await syncRequestStatus(ctx, wo, 'ANNULEE', reason);
            if (wo.pmPlanId) {
                const plan = await store.get(model_1.COLL.pmPlans, wo.pmPlanId);
                if (plan) {
                    const schedule = { ...(plan.schedule || {}) };
                    schedule[wo.assetId] = (0, rules_1.skipOccurrence)(plan, schedule[wo.assetId]);
                    await store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
                }
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CANCELLED', targetId: wo.id, targetName: wo.number, details: { reason } });
            return { success: true };
        }
        case 'WO_START': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['A_PLANIFIER', 'PLANIFIE', 'EN_ATTENTE'].includes(wo.status))
                fail('failed-precondition', 'Ce bon de travail ne peut pas être démarré.');
            if (actor.role === 'TECHNICIEN' && !wo.assigneeIds.includes(actor.id))
                fail('permission-denied', "Ce bon de travail ne vous est pas attribué.");
            let safetyAnswers = null;
            if (wo.safetyCheckRequired) {
                const settings = await store.getSettings();
                if (settings.safetyChecklistId) {
                    const chk = await store.get(model_1.COLL.checklists, settings.safetyChecklistId);
                    if (chk && !chk.isArchived) {
                        validateAnswers(chk, p.safetyAnswers, true);
                        safetyAnswers = p.safetyAnswers;
                    }
                }
            }
            const updates = { status: 'EN_COURS', startedAt: nowIso, startedByName: actor.name, safetyAnswers, holdReason: null };
            if (!wo.assigneeIds.length && actor.role === 'TECHNICIEN') {
                updates.assigneeIds = [actor.id];
                updates.assigneeNames = [actor.name];
            }
            await store.update(model_1.COLL.workOrders, wo.id, clean(updates));
            if (p.immobilize) {
                const asset = await getAsset(ctx, wo.assetId);
                await setAssetState(ctx, asset, 'INDISPONIBLE', `Intervention ${wo.number}`, wo.id);
            }
            return { success: true };
        }
        case 'WO_CLOSE': {
            const wo = await getWorkOrder(ctx, p.id);
            if (!['PLANIFIE', 'EN_COURS', 'EN_ATTENTE', 'A_PLANIFIER'].includes(wo.status))
                fail('failed-precondition', 'Ce bon de travail est déjà clôturé ou annulé.');
            if (actor.role === 'TECHNICIEN' && !wo.assigneeIds.includes(actor.id))
                fail('permission-denied', "Ce bon de travail ne vous est pas attribué.");
            const report = str(p.report, "rapport d'intervention");
            const actualStart = str(p.actualStart || wo.startedAt, 'début réel');
            const actualEnd = str(p.actualEnd, 'fin réelle');
            if (new Date(actualEnd).getTime() <= new Date(actualStart).getTime())
                fail('invalid-argument', 'La fin réelle doit être après le début.');
            if (new Date(actualEnd).getTime() > now.getTime() + 5 * 60000)
                fail('invalid-argument', 'La fin réelle ne peut pas être dans le futur.');
            if (wo.checklistId) {
                const chk = await store.get(model_1.COLL.checklists, wo.checklistId);
                if (chk && !chk.isArchived)
                    validateAnswers(chk, p.checklistAnswers, false);
            }
            const assetStateAfter = ['OPERATIONNEL', 'DEGRADE', 'INDISPONIBLE'].includes(p.assetStateAfter) ? p.assetStateAfter : 'OPERATIONNEL';
            const people = Math.max(1, wo.assigneeIds.length || 1);
            const laborHours = num(p.laborHours) ?? Math.round((0, rules_1.hoursBetween)(actualStart, actualEnd) * people * 100) / 100;
            const asset = await getAsset(ctx, wo.assetId);
            const meterAtClose = num(p.meterAtClose);
            if (meterAtClose != null && asset.meterType && (asset.meterValue == null || meterAtClose > asset.meterValue)) {
                await addMeterReading(ctx, asset, meterAtClose, wo.id);
            }
            await store.update(model_1.COLL.workOrders, wo.id, clean({
                status: 'CLOTURE', report, actualStart, actualEnd,
                startedAt: wo.startedAt || actualStart,
                checklistAnswers: p.checklistAnswers || null,
                photos: Array.isArray(p.photos) ? p.photos : (wo.photos || []),
                laborHours: wo.resourceType === 'INTERNE' ? laborHours : (num(p.laborHours) ?? 0),
                partsCost: num(p.partsCost) ?? 0,
                externalCost: num(p.externalCost) ?? 0,
                meterAtClose: meterAtClose ?? null,
                assetStateAfter,
                closedAt: nowIso, closedById: actor.id, closedByName: actor.name,
            }));
            const stateReason = assetStateAfter === 'OPERATIONNEL' ? null : ((p.assetStateReason || '').trim() || `Suite ${wo.number}`);
            await setAssetState(ctx, asset, assetStateAfter, stateReason, wo.id);
            await syncRequestStatus(ctx, wo, 'CLOTUREE');
            if (wo.pmPlanId) {
                const plan = await store.get(model_1.COLL.pmPlans, wo.pmPlanId);
                if (plan) {
                    const schedule = { ...(plan.schedule || {}) };
                    schedule[wo.assetId] = (0, rules_1.nextEntryAfterCompletion)(plan, schedule[wo.assetId], actualEnd, meterAtClose ?? asset.meterValue);
                    await store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean(schedule) });
                }
            }
            if (actor.role === 'TECHNICIEN') {
                ctx.effects.push({ type: 'notifyManagers', level: 'INFO', title: `${wo.number} clôturé`, message: `${actor.name} · ${wo.assetCode} : ${report.slice(0, 100)}` });
            }
            ctx.effects.push({ type: 'audit', action: 'GMAO_WO_CLOSED', targetId: wo.id, targetName: wo.number, details: { asset: wo.assetCode, state: assetStateAfter } });
            return { success: true };
        }
        // ── Préventif ──
        case 'PM_SAVE': {
            const name = str(p.name, 'nom de la gamme');
            const trigger = p.trigger === 'COMPTEUR' ? 'COMPTEUR' : 'CALENDAIRE';
            const intervalValue = num(p.intervalValue);
            if (!intervalValue || intervalValue <= 0)
                fail('invalid-argument', 'Intervalle invalide.');
            const assetIds = Array.isArray(p.assetIds) ? Array.from(new Set(p.assetIds)) : [];
            if (!assetIds.length)
                fail('invalid-argument', 'Associez au moins un équipement.');
            const assets = await store.list(model_1.COLL.assets);
            for (const id of assetIds) {
                const a = assets.find(x => x.id === id);
                if (!a)
                    fail('invalid-argument', 'Équipement introuvable.');
                if (trigger === 'COMPTEUR' && !a.meterType)
                    fail('invalid-argument', `${a.code} n'a pas de compteur : une gamme au compteur est impossible.`);
            }
            const existing = p.id ? await store.get(model_1.COLL.pmPlans, p.id) : null;
            const id = existing?.id || store.newId(model_1.COLL.pmPlans);
            const base = {
                name, trigger, intervalValue: intervalValue,
                intervalUnit: trigger === 'CALENDAIRE' ? (['JOURS', 'SEMAINES', 'MOIS'].includes(p.intervalUnit) ? p.intervalUnit : 'MOIS') : undefined,
                alertBefore: Math.max(0, num(p.alertBefore) ?? 0),
            };
            const triggerChanged = existing && (existing.trigger !== base.trigger || existing.intervalValue !== base.intervalValue || existing.intervalUnit !== base.intervalUnit);
            const schedule = {};
            for (const aid of assetIds) {
                const prev = existing?.schedule?.[aid];
                if (prev && !triggerChanged)
                    schedule[aid] = prev;
                else
                    schedule[aid] = { ...(0, rules_1.initialScheduleEntry)(base, assets.find(a => a.id === aid), now, p.firstDueAt || null, num(p.firstDueMeter)), openWorkOrderId: prev?.openWorkOrderId || null };
            }
            const plan = {
                id, ...base,
                assetIds,
                interventionType: p.interventionType || 'MECANIQUE',
                priority: isPriority(p.priority) ? p.priority : 'P3',
                procedure: (p.procedure || '').trim(),
                checklistId: p.checklistId || null,
                consumables: (p.consumables || '').trim(),
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
            return { id, generatedWorkOrders: created.map(w => w.number) };
        }
        case 'PM_TOGGLE': {
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            await store.update(model_1.COLL.pmPlans, plan.id, { isActive: !!p.isActive });
            const created = p.isActive ? await runPreventiveScan(ctx) : [];
            return { success: true, generatedWorkOrders: created.map(w => w.number) };
        }
        case 'PM_ARCHIVE': {
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            await store.update(model_1.COLL.pmPlans, plan.id, { isArchived: true, isActive: false });
            return { success: true };
        }
        case 'PM_SET_NEXT': {
            const plan = await store.get(model_1.COLL.pmPlans, p.id);
            if (!plan)
                fail('not-found', 'Gamme introuvable.');
            const entry = plan.schedule?.[p.assetId];
            if (!entry)
                fail('invalid-argument', "Cet équipement n'est pas dans la gamme.");
            const next = { ...entry };
            if (plan.trigger === 'CALENDAIRE')
                next.nextDueAt = str(p.nextDueAt, 'prochaine échéance');
            else {
                const m = num(p.nextDueMeter);
                if (m == null)
                    fail('invalid-argument', 'Valeur compteur invalide.');
                next.nextDueMeter = m;
            }
            await store.update(model_1.COLL.pmPlans, plan.id, { schedule: clean({ ...plan.schedule, [p.assetId]: next }) });
            if (entry.openWorkOrderId && plan.trigger === 'CALENDAIRE') {
                const wo = await store.get(model_1.COLL.workOrders, entry.openWorkOrderId);
                if (wo && wo.status === 'A_PLANIFIER')
                    await store.update(model_1.COLL.workOrders, wo.id, { dueDate: next.nextDueAt });
            }
            return { success: true };
        }
        case 'PM_SCAN': {
            const created = await runPreventiveScan(ctx);
            return { generatedWorkOrders: created.map(w => w.number) };
        }
        // ── Planning ──
        case 'TASK_SAVE': {
            const title = str(p.title, 'intitulé');
            const start = str(p.start, 'début');
            const end = str(p.end, 'fin');
            if (new Date(end).getTime() <= new Date(start).getTime())
                fail('invalid-argument', 'La fin doit être après le début.');
            const { ids, names } = await resolveAssignees(ctx, p.assigneeIds);
            if (!ids.length)
                fail('invalid-argument', 'Choisissez au moins une personne.');
            const existing = p.id ? await store.get(model_1.COLL.tasks, p.id) : null;
            const id = existing?.id || store.newId(model_1.COLL.tasks);
            const task = {
                id, title,
                kind: ['TACHE', 'CONGE', 'FORMATION', 'ABSENCE', 'REUNION'].includes(p.kind) ? p.kind : 'TACHE',
                assigneeIds: ids, assigneeNames: names,
                siteId: p.siteId || null, start, end, notes: (p.notes || '').trim(),
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
            await store.remove(model_1.COLL.tasks, str(p.id, 'tâche'));
            return { success: true };
        }
        case 'TASK_TOGGLE_DONE': {
            const task = await store.get(model_1.COLL.tasks, p.id);
            if (!task)
                fail('not-found', 'Tâche introuvable.');
            if (actor.role === 'TECHNICIEN' && !task.assigneeIds.includes(actor.id))
                fail('permission-denied', "Cette tâche ne vous est pas attribuée.");
            const done = !!p.done;
            await store.update(model_1.COLL.tasks, task.id, { status: done ? 'FAIT' : 'A_FAIRE', doneAt: done ? nowIso : null });
            return { success: true };
        }
        // ── Check-lists ──
        case 'CHECKLIST_SAVE': {
            const name = str(p.name, 'nom de la check-list');
            const items = (Array.isArray(p.items) ? p.items : [])
                .map((it, i) => ({
                id: it.id || `item_${i}_${Math.random().toString(36).slice(2, 7)}`,
                label: String(it.label || '').trim(),
                type: ['BOOLEAN', 'TEXT', 'NUMBER', 'PHOTO'].includes(it.type) ? it.type : 'BOOLEAN',
                required: !!it.required,
            }))
                .filter((it) => it.label);
            if (!items.length)
                fail('invalid-argument', 'Ajoutez au moins un point de contrôle.');
            const kind = p.kind === 'SECURITE' ? 'SECURITE' : 'MAINTENANCE';
            const id = p.id || store.newId(model_1.COLL.checklists);
            const chk = {
                id, name, kind, description: (p.description || '').trim(), items, isArchived: false,
                triggerType: kind === 'SECURITE' ? 'SAFETY' : 'MAINTENANCE', targetContext: 'ALL',
            };
            await store.set(model_1.COLL.checklists, id, clean(chk));
            return { id };
        }
        case 'CHECKLIST_ARCHIVE': {
            await store.update(model_1.COLL.checklists, str(p.id, 'check-list'), { isArchived: true });
            const settings = await store.getSettings();
            if (settings.safetyChecklistId === p.id)
                await store.saveSettings({ ...settings, safetyChecklistId: null });
            return { success: true };
        }
        // ── Réglages ──
        case 'SETTINGS_SAVE': {
            const current = await store.getSettings();
            const next = { ...model_1.DEFAULT_SETTINGS, ...current };
            if ('hourlyRate' in p) {
                const r = num(p.hourlyRate);
                if (r == null || r < 0)
                    fail('invalid-argument', 'Taux horaire invalide.');
                next.hourlyRate = r;
            }
            if ('safetyChecklistId' in p)
                next.safetyChecklistId = p.safetyChecklistId || null;
            await store.saveSettings(next);
            return { success: true };
        }
    }
    return fail('invalid-argument', `Action non gérée : ${action}`);
}
//# sourceMappingURL=core.js.map