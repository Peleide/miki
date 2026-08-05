
# MIKI — Gestion de Parc Matériel & Visites Techniques

Application web SaaS multi-tenant pour la gestion du parc matériel hospitalier : suivi des emprunts, tickets de maintenance, et visites techniques des équipements fixes (CDil).

---

## Stack Technique

| Couche | Technologie |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Vite 6 |
| Backend | Firebase Cloud Functions v1 (Node.js 18) |
| Base de données | Firestore (NoSQL temps réel) |
| Auth | Firebase Authentication (Email/Password) |
| Dev local | Firebase Emulator Suite |

---

## Architecture

### Multi-tenancy
Chaque organisation (tenant) est cloisonnée sous `tenants/{tenantId}/...`.  
Un utilisateur peut appartenir à plusieurs tenants avec des rôles différents (`tenantsAccess` map).

### Rôles
| Rôle | Description |
|---|---|
| **ADMIN** | Super Admin plateforme (`tenantId = platform`). Accès à tous les tenants, journal d'audit. |
| **MANAGER** | Admin local d'un tenant. Gestion équipements, utilisateurs, CDil, tickets. |
| **TECHNICIAN** | Technicien de maintenance. Gestion des tickets et visites CDil. |
| **AGENT** | Opérateur terrain. Scan QR, emprunts de matériel. |
| **CLIENT** | Lecture seule du tableau de bord. |

### Collections Firestore
```
users/{userId}
  └─ notifications/{notifId}

tenants/{tenantId}
  ├─ equipments/{equipmentId}       — parc matériel empruntable
  ├─ equipmentLogs/{logId}          — historique des mouvements
  ├─ sites/{siteId}                 — chantiers / lieux d'intervention
  ├─ checklists/{checklistId}       — formulaires de contrôle
  ├─ maintenanceLogs/{logId}        — comptes-rendus de maintenance
  ├─ incidentReports/{reportId}     — tickets de signalement
  ├─ cdilUnits/{unitId}             — Centrales de Dilution (installations fixes)
  └─ visitSessions/{sessionId}      — sessions de visite CDil

audit_logs/{logId}                  — journal d'audit (Admin uniquement)
```

---

## Démarrage local

```bash
# 1. Dépendances frontend
npm install

# 2. Dépendances et compilation Cloud Functions
cd functions && npm install && npm run build && cd ..

# 3. Émulateurs Firebase (Auth:9099, Functions:5001, Firestore:8080)
firebase emulators:start

# 4. Frontend (autre terminal)
npm run dev   # http://localhost:5173
```

> Pour alimenter l'émulateur avec des données de test, utiliser `scripts/seedEmulator.mjs`.

---

## Déploiement

```bash
# Cloud Functions
firebase deploy --only functions

# Règles Firestore
firebase deploy --only firestore:rules

# Tout
firebase deploy
```

---

## Modules principaux

### Gestion de parc (MANAGER)
- Création et archivage d'équipements (avec génération auto de noms et QR codes)
- Gestion en lot (batch) ou unitaire
- Kits d'équipements (groupes)
- Planification de maintenance préventive (par usage ou par délai)
- Impression PDF des QR codes

### Suivi terrain (AGENT)
- Scan QR Code via caméra mobile
- Emprunt / retour avec verrouillage côté serveur (évite les doublons)
- Checklists obligatoires à la prise / après maintenance
- Signalement d'incident (crée un ticket)
- Mode hors-ligne : bannière d'alerte, actions bloquées

### Tickets de maintenance (TECHNICIAN / MANAGER)
- File de tickets OPEN → IN_PROGRESS → RESOLVED → ARCHIVED
- Assignation de tickets à un technicien
- Résolution avec compte-rendu et checklist de maintenance

### Centrales de Dilution — CDil (TECHNICIAN / MANAGER)
- Référentiel des unités CDil (installations fixes, par service / localisation)
- Sessions de visite technique : saisie des états Buse / Crépine / Ligne d'aspiration
- États : `ok` (0 remplacement) / `1` / `2` remplacements effectués
- Export CSV des sessions clôturées (pour bilan externe)

### Tableau de bord (MANAGER / CLIENT)
- Activité en temps réel par équipement
- Historique de maintenance

### Console Admin (ADMIN)
- Création et configuration des tenants
- Gestion des quotas
- Journal d'audit complet

---

## Sécurité
- Toutes les mutations passent par des Cloud Functions avec vérification du rôle (`verifyAccess`)
- Firestore Rules : lecture contrôlée, écriture directe client interdite (`allow write: if false`)
- Journal d'audit persistant pour toutes les actions sensibles

---

## Licence
Propriétaire — usage interne uniquement.
