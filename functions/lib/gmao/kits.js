"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kitById = exports.KITS = void 0;
const monthly = (interval, anchor = 'CALENDRIER') => ({ freq: 'MONTHLY', interval, monthlyMode: 'DAY', end: { type: 'NEVER' }, anchor });
const yearly = (interval = 1) => ({ freq: 'YEARLY', interval, end: { type: 'NEVER' }, anchor: 'CALENDRIER' });
exports.KITS = [
    {
        id: 'VEHICULES',
        name: 'Parc de véhicules',
        description: 'Véhicules légers et utilitaires : relevés kilométriques, vidanges au kilométrage, contrôle mensuel et contrôle technique.',
        typologies: [
            { key: 'vl', name: 'Véhicule léger', meterType: 'KM', checklistKey: 'ctrl-vehicule' },
            { key: 'utilitaire', name: 'Utilitaire', meterType: 'KM', checklistKey: 'ctrl-vehicule' },
        ],
        checklists: [
            {
                key: 'ctrl-vehicule', name: 'Contrôle mensuel véhicule', kind: 'MAINTENANCE', items: [
                    { label: 'Pneus : pression et usure', type: 'BOOLEAN', required: true },
                    { label: 'Niveaux (huile, refroidissement, lave-glace)', type: 'BOOLEAN', required: true },
                    { label: 'Éclairage et clignotants', type: 'BOOLEAN', required: true },
                    { label: 'Essuie-glaces', type: 'BOOLEAN', required: true },
                    { label: 'Carrosserie (chocs, rayures)', type: 'CHOICE', required: true, options: ['RAS', 'Dégât mineur', 'Dégât à réparer'] },
                    { label: 'Gilet, triangle, extincteur présents', type: 'BOOLEAN', required: true },
                    { label: 'Kilométrage relevé', type: 'NUMBER', required: true },
                    { label: 'Observations', type: 'TEXT', required: false },
                ],
            },
            {
                key: 'vidange', name: 'Vidange', kind: 'MAINTENANCE', items: [
                    { label: 'Huile moteur remplacée', type: 'BOOLEAN', required: true },
                    { label: 'Filtre à huile remplacé', type: 'BOOLEAN', required: true },
                    { label: 'Filtre à air contrôlé', type: 'BOOLEAN', required: true },
                    { label: 'Garage / prestataire', type: 'TEXT', required: false },
                    { label: 'Photo de la facture', type: 'PHOTO', required: false },
                ],
            },
        ],
        plans: [
            { name: 'Vidange tous les 10 000 km', typologyKey: 'vl', trigger: 'COMPTEUR', meterInterval: 10000, alertBefore: 1000, interventionType: 'Mécanique', priority: 'P3', checklistKey: 'vidange', estimatedHours: 1, consumables: 'Huile, filtre à huile', procedure: "À l'alerte, appeler le référent du véhicule pour fixer le rendez-vous au garage." },
            { name: 'Vidange tous les 15 000 km', typologyKey: 'utilitaire', trigger: 'COMPTEUR', meterInterval: 15000, alertBefore: 1500, interventionType: 'Mécanique', priority: 'P3', checklistKey: 'vidange', estimatedHours: 1, procedure: "À l'alerte, appeler le référent du véhicule pour fixer le rendez-vous au garage." },
            { name: 'Contrôle mensuel', typologyKey: 'vl', trigger: 'CALENDAIRE', recurrence: monthly(1), alertBefore: 5, interventionType: 'Contrôle', priority: 'P3', checklistKey: 'ctrl-vehicule', estimatedHours: 0.5 },
            { name: 'Contrôle mensuel', typologyKey: 'utilitaire', trigger: 'CALENDAIRE', recurrence: monthly(1), alertBefore: 5, interventionType: 'Contrôle', priority: 'P3', checklistKey: 'ctrl-vehicule', estimatedHours: 0.5 },
            { name: 'Contrôle technique', typologyKey: 'vl', trigger: 'CALENDAIRE', recurrence: yearly(1), alertBefore: 30, interventionType: 'Contrôle', priority: 'P2', estimatedHours: 2 },
        ],
    },
    {
        id: 'NETTOYAGE',
        name: 'Engins de nettoyage',
        description: 'Autolaveuses, monobrosses, injecteurs-extracteurs : entretien des consommables (bavettes, brosses, filtres, batteries).',
        typologies: [
            { key: 'autolaveuse', name: 'Autolaveuse', meterType: null, checklistKey: 'entretien-autolaveuse' },
            { key: 'monobrosse', name: 'Monobrosse', meterType: null, checklistKey: 'entretien-monobrosse' },
            { key: 'injecteur', name: 'Injecteur-extracteur', meterType: null },
        ],
        checklists: [
            {
                key: 'entretien-autolaveuse', name: 'Entretien autolaveuse', kind: 'MAINTENANCE', items: [
                    { label: 'Bavettes du suceur', type: 'CHOICE', required: true, options: ['Bon état', 'Inversées', 'Remplacées'] },
                    { label: 'Brosses / plateaux', type: 'CHOICE', required: true, options: ['Bon état', 'Nettoyés', 'Remplacés'] },
                    { label: 'Filtres et réservoirs nettoyés', type: 'BOOLEAN', required: true },
                    { label: 'Tuyaux et raccords sans fuite', type: 'BOOLEAN', required: true },
                    { label: 'Batteries : niveau et charge', type: 'BOOLEAN', required: true },
                    { label: 'Observations', type: 'TEXT', required: false },
                ],
            },
            {
                key: 'entretien-monobrosse', name: 'Entretien monobrosse', kind: 'MAINTENANCE', items: [
                    { label: 'Câble et prise en bon état', type: 'BOOLEAN', required: true },
                    { label: 'Brosse / plateau', type: 'CHOICE', required: true, options: ['Bon état', 'Nettoyé', 'Remplacé'] },
                    { label: 'Observations', type: 'TEXT', required: false },
                ],
            },
        ],
        plans: [
            { name: 'Inversion / remplacement des bavettes', typologyKey: 'autolaveuse', trigger: 'CALENDAIRE', recurrence: monthly(3), alertBefore: 7, interventionType: 'Nettoyage', priority: 'P3', checklistKey: 'entretien-autolaveuse', estimatedHours: 0.5, consumables: 'Jeu de bavettes' },
            { name: 'Entretien mensuel', typologyKey: 'monobrosse', trigger: 'CALENDAIRE', recurrence: monthly(1), alertBefore: 5, interventionType: 'Nettoyage', priority: 'P4', checklistKey: 'entretien-monobrosse', estimatedHours: 0.25 },
        ],
    },
    {
        id: 'CENTRALES',
        name: 'Centrales de dilution',
        description: 'Visites périodiques des centrales : état de la buse, de la crépine et de la ligne d’aspiration, contrôle du dosage.',
        typologies: [{ key: 'centrale', name: 'Centrale de dilution', meterType: null, checklistKey: 'visite-centrale' }],
        checklists: [
            {
                key: 'visite-centrale', name: 'Visite centrale de dilution', kind: 'MAINTENANCE', items: [
                    { label: 'Buse', type: 'CHOICE', required: true, options: ['OK', '1er remplacement', '2e remplacement'] },
                    { label: 'Crépine', type: 'CHOICE', required: true, options: ['OK', '1er remplacement', '2e remplacement'] },
                    { label: "Ligne d'aspiration", type: 'CHOICE', required: true, options: ['OK', '1er remplacement', '2e remplacement'] },
                    { label: 'Dosage contrôlé', type: 'BOOLEAN', required: true },
                    { label: 'Photo de la centrale', type: 'PHOTO', required: false },
                    { label: 'Remarques', type: 'TEXT', required: false },
                ],
            },
        ],
        plans: [
            { name: 'Visite périodique', typologyKey: 'centrale', trigger: 'CALENDAIRE', recurrence: monthly(6), alertBefore: 15, interventionType: 'Contrôle', priority: 'P3', checklistKey: 'visite-centrale', estimatedHours: 0.5 },
        ],
    },
    {
        id: 'GENERIQUE',
        name: 'Équipements divers',
        description: 'Une typologie générique et un contrôle annuel, à adapter librement.',
        typologies: [{ key: 'equipement', name: 'Équipement', meterType: null, checklistKey: 'ctrl-general' }],
        checklists: [
            {
                key: 'ctrl-general', name: 'Contrôle général', kind: 'MAINTENANCE', items: [
                    { label: 'Fonctionnement normal', type: 'BOOLEAN', required: true },
                    { label: 'Propreté', type: 'BOOLEAN', required: true },
                    { label: 'Sécurité (carters, câbles, arrêt d’urgence)', type: 'BOOLEAN', required: true },
                    { label: 'Observations', type: 'TEXT', required: false },
                ],
            },
        ],
        plans: [
            { name: 'Contrôle annuel', typologyKey: 'equipement', trigger: 'CALENDAIRE', recurrence: yearly(1), alertBefore: 15, interventionType: 'Contrôle', priority: 'P3', checklistKey: 'ctrl-general', estimatedHours: 1 },
        ],
    },
];
const kitById = (id) => exports.KITS.find(k => k.id === id);
exports.kitById = kitById;
//# sourceMappingURL=kits.js.map