# Changelog

Toutes les évolutions notables du projet MIKI sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Non publié] — branche `vivian`

> Travaux en cours, non encore mergés sur `main`.

### Ajouté — Module CDil (Centrales de Dilution)
- Nouveau type d'objet : installations fixes avec 3 composants (Buse, Crépine, Ligne d'aspiration)
- État par composant : `ok` (0 remplacement) / `1` / `2`
- Types TypeScript : `ComponentState`, `CdilUnit`, `VisitEntry`, `VisitSession`
- Cloud Functions : `manageCdilUnit` (CREATE/UPDATE/DEACTIVATE) et `manageVisitSession` (CREATE/SAVE_ENTRIES/COMPLETE/DELETE_DRAFT)
- 10 nouvelles méthodes dans `services/db.ts`
- Règles Firestore pour `cdilUnits` et `visitSessions`
- **`CdilVisitPanel`** : nouveau composant de conduite de visite technique (créer session, saisir états, clôturer)
- Onglet **CENTRALES** dans `ManagementPanel` : gestion des unités + historique des visites
- Navigation TECHNICIAN : nouvel onglet **VISITES** (`cdil`)
- Export CSV natif des sessions clôturées (séparateur `;`, BOM UTF-8)

### Ajouté — Journal d'audit complet
- Helper `writeAuditLog` dans les Cloud Functions (fire-and-forget, résout `tenantName` automatiquement)
- Audit enregistré sur toutes les mutations : CREATE/UPDATE/DISABLE/ENABLE utilisateur, mot de passe, équipements, tenants, tickets
- Traductions françaises de toutes les actions d'audit dans `AdminPanel`
- Icône et couleur dédiées au type `USER` dans la vue journal

### Ajouté — Gestion utilisateurs (ManagementPanel)
- Bouton réinitialisation de mot de passe par le Manager (affichage du mot de passe provisoire)
- Bouton activation/désactivation de compte
- Badge "Désactivé" sur les cartes utilisateur

### Ajouté — AgentView
- Bannière hors-ligne orange fixe (top 20) quand `navigator.onLine === false`

### Ajouté — Documentation projet
- `CLAUDE.md` : documentation complète pour les sessions Claude Code
- Skill `/init` : initialisation de contexte de session
- Mémoires persistantes Claude (profil utilisateur, feedback, architecture, CDil)

### Corrigé — AdminPanel
- Label "Quota Équipements" (était "Quota Salles")
- Label "Équipements" dans la barre d'utilisation (était "Locaux")
- Bouton "Paramétrer" : message d'information au lieu d'un no-op silencieux

---

## [0.4.0] — 2026-07-07

### Sécurité
- Ajout de `.env*` au `.gitignore` pour ne plus exposer les clés API
- Ajout de `service-account.json` au `.gitignore`

---

## [0.3.0] — 2026-06-24

### Ajouté
- Historique des maintenances visible dans la vue équipement du Dashboard

### Corrigé
- Erreur de syntaxe dans `ManagementPanel`
- Suppression de l'onglet "Maintenances" du panneau de gestion (redondant)

---

## [0.2.0] — 2026-06-23

### Ajouté
- Méthode `createEquipmentBatch` pour la création en lot d'équipements

### Corrigé
- Maintien de la visibilité des tenants pour un Admin agissant en mode Manager

---

## [0.1.0] — 2026-05-19

### Corrigé
- Bug de switch tenant pour les Admins globaux (perte de contexte au changement)
