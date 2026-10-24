"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyState = emptyState;
exports.memoryStore = memoryStore;
// Stockage en mémoire : mode démo du front et tests de la logique métier.
const model_1 = require("./model");
function emptyState(users = []) {
    return { collections: {}, counters: {}, settings: { ...model_1.DEFAULT_SETTINGS }, users };
}
const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function memoryStore(state, onChange) {
    const c = (name) => (state.collections[name] = state.collections[name] || {});
    let seq = 0;
    return {
        async get(coll, id) { return id && c(coll)[id] ? copy(c(coll)[id]) : null; },
        async list(coll) { return Object.values(c(coll)).map(v => copy(v)); },
        async set(coll, id, data) { c(coll)[id] = { ...copy(data), id }; onChange?.(coll); },
        async update(coll, id, data) {
            if (!c(coll)[id])
                throw new Error(`Document ${coll}/${id} introuvable`);
            c(coll)[id] = { ...c(coll)[id], ...copy(data) };
            onChange?.(coll);
        },
        async remove(coll, id) { delete c(coll)[id]; onChange?.(coll); },
        newId(coll) { seq++; return `${coll.replace('gmao', '').toLowerCase()}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`; },
        async nextNumber(key) { state.counters[key] = (state.counters[key] || 0) + 1; return state.counters[key]; },
        async getSettings() { return { ...model_1.DEFAULT_SETTINGS, ...state.settings }; },
        async saveSettings(s) { state.settings = copy(s); onChange?.('settings'); },
        async getUsers() { return copy(state.users); },
    };
}
//# sourceMappingURL=memoryStore.js.map