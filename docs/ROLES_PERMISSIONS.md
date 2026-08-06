# MIKI — Rôles & Permissions

> Document de référence. À mettre à jour à chaque évolution du périmètre des droits.  
> Dernière révision : 2026-08-06

---

## Glossaire rapide

**Tenant** (ou *espace client*) : dans MIKI, chaque établissement client (hôpital, clinique, centre de soin…) dispose de son propre espace isolé, appelé "tenant". Toutes les données d'un établissement — équipements, utilisateurs, tickets, visites — sont cloisonnées dans cet espace et invisibles des autres. Le terme "tenant" est conservé dans ce document car il correspond au vocabulaire technique du code, mais il désigne simplement **l'espace d'un établissement**.

**Plateforme** : l'espace réservé à l'équipe MIKI/Clean&Tech elle-même, distinct de tous les espaces clients. L'ADMIN y opère.

**Cloud Function** : traitement côté serveur déclenché par l'application. Toutes les actions sensibles (créer un équipement, modifier un compte…) passent obligatoirement par ce mécanisme — jamais directement depuis le navigateur. C'est la couche qui applique les règles de sécurité.

---

## Hiérarchie des rôles

```
ADMIN       → équipe MIKI / Clean&Tech (accès global, tous les établissements)
  └── MANAGER     → responsable au sein d'un établissement client
        └── TECHNICIAN  → technicien de terrain Clean&Tech rattaché à un établissement
              └── AGENT       → utilisateur de terrain de l'établissement (soignant, logisticien…)
                    └── CLIENT      → observateur de l'établissement (direction, qualité…)
```

Un rôle hérite des droits des rôles inférieurs **sauf ADMIN → MANAGER** : l'ADMIN est global (il voit tous les établissements), le MANAGER est limité à son propre établissement.

---

## Description des rôles

---

### ADMIN

**Qui est-ce ?**
L'administrateur de la plateforme MIKI. Il n'appartient à aucun tenant (espace établissement) client — son espace est `platform`, réservé à l'équipe interne. En pratique, c'est l'équipe Clean&Tech qui opère MIKI.

**Ce qu'il peut faire**
L'ADMIN a un accès illimité à l'ensemble de la plateforme. Il crée et configure les tenants clients (hôpitaux, cliniques), peut suspendre un tenant, et consulte le journal d'audit complet de toutes les actions réalisées sur la plateforme. Il peut intervenir sur n'importe quel compte utilisateur, quel que soit son rôle ou son tenant.

**Ce qu'il ne peut pas faire**
Rien de bloqué côté système. L'ADMIN est le niveau d'accès maximum.

**Arbitrages**
- ✅ L'ADMIN a accès aux données métier des établissements (équipements, tickets, visites CDil) — nécessaire pour le support terrain. À documenter dans les conditions d'utilisation côté client.
- ✅ Un compte ADMIN par personne Clean&Tech — le journal d'audit devient inutile si plusieurs personnes partagent un seul login.
- ❓ Log d'audit séparé pour les actions ADMIN — en attente de confirmation, non prioritaire.

---

### MANAGER

**Qui est-ce ?**
Le responsable opérationnel côté client — typiquement un chef de service, un référent matériel ou un coordinateur logistique au sein de l'établissement. Il a la main sur tout ce qui concerne son établissement.

**Ce qu'il peut faire**
Le MANAGER administre l'intégralité de son espace établissement (tenant) : il crée et modifie les équipements, gère les comptes utilisateurs (création, désactivation, réinitialisation de mot de passe), configure les checklists, les chantiers et les paramètres de l'établissement (fuseau horaire, quotas, sécurité). Il suit les emprunts et les incidents via le dashboard, traite les tickets, peut clôturer et archiver. Il pilote aussi les centrales CDil : configuration des unités, consultation de l'historique des visites et export CSV.

**Ce qu'il ne peut pas faire**
Il ne peut pas modifier un compte ADMIN plateforme. Il n'a pas accès aux audit_logs complets (réservés à l'ADMIN). Il ne peut pas créer de nouveaux espaces établissement (tenants).

**Arbitrages**
- ✅ L'archivage suffit, pas de suppression définitive — l'historique d'un équipement (emprunts, maintenances, incidents) doit rester consultable pour la traçabilité.
- ✅ Un seul niveau MANAGER pour l'instant — le rôle CLIENT couvre déjà le besoin "lecture seule dashboard". Un second niveau MANAGER ne sera ajouté que si le besoin est formellement exprimé.
- ✅ Un MANAGER par établissement — le multi-sites est une évolution future, non prioritaire en v1.

---

### TECHNICIAN

**Qui est-ce ?**
Le technicien de terrain Clean&Tech rattaché à MIKI. Il intervient physiquement sur les équipements et les centrales CDil. Il peut être amené à se déplacer sur plusieurs établissements.

**Ce qu'il peut faire**
Le TECHNICIAN gère les tickets de maintenance : il change leur statut (En cours, Résolu), s'assigne des tickets et renseigne des notes de résolution. C'est lui qui réalise les visites techniques CDil : il crée les sessions (périodiques ou interventions inopinées), saisit l'état de chaque centrale au fil de la tournée, et clôture la session une fois terminée. Il peut aussi créer et modifier les unités CDil. En parallèle, il peut scanner des QR codes pour emprunter ou restituer des équipements, et soumettre des checklists.

**Ce qu'il ne peut pas faire**
Il ne peut pas archiver de tickets (action MANAGER). Il n'a pas accès à la gestion des comptes utilisateurs, des équipements (création/modification/archivage), ni aux paramètres du tenant.

**Arbitrages**
- ✅ Le TECH peut créer et modifier des unités CDil — c'est lui qui est physiquement sur le terrain lors des installations, il serait contre-productif de le bloquer.
- ✅ Le TECH clôture un ticket seul, sans validation MANAGER obligatoire — une validation systématique bloquerait les flux si le MANAGER est indisponible. Le MANAGER peut toujours rouvrir après coup.
- 🔄 Multi-établissements : un technicien Clean&Tech intervient sur plusieurs sites — le modèle cible est **un compte par technicien avec accès à plusieurs établissements**. La structure de données est prête (`accessibleTenantIds[]`) mais la logique applicative (sélecteur d'établissement à la connexion, gardes CF multi-tenant) reste à implémenter. Chantier prioritaire.

---

### AGENT

**Qui est-ce ?**
L'utilisateur de terrain au sein de l'établissement client — aide-soignant, agent de service, logisticien. Son usage de MIKI se résume à l'emprunt et la restitution de matériel via QR code.

**Ce qu'il peut faire**
L'AGENT scanne un QR code d'équipement et peut l'emprunter (TAKE), le restituer (RETURN) ou signaler un problème (REPORT qui déclenche un ticket). Il peut également soumettre des réponses à une checklist avant une prise d'équipement. C'est tout.

**Ce qu'il ne peut pas faire**
Il n'a accès à aucune vue de gestion. Il ne voit pas les tickets, ne consulte pas le dashboard, n'interagit pas avec les CDil. Il ne reçoit pas de notifications.

**Arbitrages**
- ✅ Pas de notification email après emprunt/restitution — le toast à l'écran suffit. Une notif par action serait du bruit pour un agent de terrain.
- ✅ Pas d'historique d'emprunts pour l'AGENT — le matériel est partagé entre collègues, la notion de "mes emprunts" est floue. Le MANAGER voit tout depuis le dashboard.
- ✅ Le signalement sans emprunt est conservé (REPORT sur un équipement AVAILABLE) — cas de sécurité important : un agent qui voit un équipement défaillant doit pouvoir le signaler immédiatement sans passer par un emprunt.
- 🔄 Restitution forcée par le MANAGER — chantier à implémenter : le MANAGER doit pouvoir forcer la remise à disposition d'un équipement depuis l'interface de gestion (sans scanner le QR ni contacter l'agent d'origine). Cas fréquent en fin de poste.

---

### CLIENT

**Qui est-ce ?**
Un décideur ou observateur côté établissement client — directeur, référent qualité, acheteur — qui a besoin de visibilité sur le parc sans intervenir dessus.

**Ce qu'il peut faire**
Le CLIENT accède uniquement au dashboard en lecture seule : il voit les métriques du parc (taux d'utilisation, équipements en service/maintenance), le flux des emprunts/restitutions, et l'état des équipements. Depuis la dernière évolution, il voit aussi le widget des centrales CDil si des unités sont actives.

**Ce qu'il ne peut pas faire**
Il ne peut exécuter aucune action — pas d'emprunt, pas de ticket, pas de signalement. Il n'a pas de barre de navigation. Il ne reçoit aucune notification.

**Arbitrages**
- ✅ Pas de signalement pour le CLIENT — si quelqu'un a besoin de signaler des problèmes, on lui attribue le rôle AGENT. CLIENT = lecture seule sans exception.
- ✅ Vue complète de l'établissement, pas de restriction par service — le filtrage par service/catégorie ajouterait une complexité disproportionnée par rapport au besoin. Si la demande est formellement exprimée, on l'adresse à ce moment-là.
- ✅ Pas d'alertes automatiques pour l'instant — le CLIENT qui veut suivre l'état du parc se connecte au dashboard.
- 🔄 Export du dashboard (PDF ou CSV mensuel) — besoin légitime pour des bilans ou réunions, à implémenter en évolution future.

---

## Navigation (vues accessibles)

| Vue | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|-----|:-----:|:-------:|:----:|:-----:|:------:|
| Console Admin (`admin`) | ✅ | — | — | — | — |
| Gestion (`management`) | — | ✅ | — | — | — |
| Dashboard (`dashboard`) | — | ✅ | — | — | ✅ |
| Tickets (`tickets`) | — | ✅ | ✅ | — | — |
| Visites CDil (`cdil`) | — | ✅ | ✅ | — | — |
| Scan QR (`agent`) | — | ✅ | ✅ | ✅ | — |

---

## Matrice Cloud Functions

### Équipements

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Scan — TAKE (emprunter) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — RETURN (restituer) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — REPORT (signaler) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — INTERVENTION (résoudre maintenance) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Créer équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Archiver équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Renouveler QR code | ✅ | ✅ | ❌ | ❌ | ❌ |
| Supprimer log d'équipement | ✅ | ✅ | ❌ | ❌ | ❌ |

### Utilisateurs

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer utilisateur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier utilisateur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Désactiver / réactiver | ✅ | ✅ | ❌ | ❌ | ❌ |
| Réinitialiser mot de passe | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier un ADMIN plateforme | ✅ | ❌ | ❌ | ❌ | ❌ |

### Structures (tenant, sites, types)

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer tenant | ✅ | ❌ | ❌ | ❌ | ❌ |
| Modifier paramètres tenant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer / modifier / archiver site | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer / archiver type d'équipement | ✅ | ✅ | ❌ | ❌ | ❌ |

### Tickets & Incidents

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer un ticket | ✅ | ✅ | ✅ | ✅ | ❌ |
| Changer statut ticket (En cours / Résolu) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assigner ticket / note de résolution | ✅ | ✅ | ✅ | ❌ | ❌ |
| Archiver ticket | ✅ | ✅ | ❌ | ❌ | ❌ |

### Checklists

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer / modifier / archiver checklist | ✅ | ✅ | ❌ | ❌ | ❌ |
| Soumettre réponses checklist | ✅ | ✅ | ✅ | ✅ | ❌ |

### Centrales CDil

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Désactiver unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Créer session de visite | ✅ | ✅ | ✅ | ❌ | ❌ |
| Enregistrer avancement (SAVE_ENTRIES) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clôturer session (COMPLETE) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Supprimer brouillon | ✅ | ✅ | ✅ | ❌ | ❌ |
| Exporter CSV session | ✅ | ✅ | ✅ | ❌ | ❌ |

### Audit & Observabilité

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Lire les audit_logs | ✅ | ❌ | ❌ | ❌ | ❌ |
| Être tracé dans les audit_logs | ✅ | ✅ | ✅ | ✅ | ❌ |
| Recevoir les notifications app | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Règles Firestore (résumé)

| Chemin | Lecture | Écriture |
|--------|---------|----------|
| `users/{userId}` | Authentifié + (soi-même OU Manager+) | ❌ CF uniquement |
| `users/{userId}/notifications/{id}` | Soi-même uniquement | ❌ CF uniquement |
| `tenants/{tenantId}` | Authentifié + accès tenant | ❌ CF uniquement |
| `tenants/{tenantId}/**` | Authentifié + accès tenant | ❌ CF uniquement |
| `audit_logs/{id}` | ADMIN plateforme uniquement | ❌ Serveur uniquement |

**Principe général** : aucune écriture directe client vers Firestore. Toutes les mutations passent par les Cloud Functions (fonctions serveur sécurisées).

---

## Comportements automatiques (effets de bord)

| Déclencheur | Effet automatique |
|-------------|-------------------|
| Scan RETURN + seuil d'usages atteint | Ticket de maintenance préventive créé, notifications MANAGER + TECH |
| Ticket créé | Notifications MANAGER + ADMIN + TECH |
| Ticket résolu | Mise à jour `lastVisiteTechniqueDate` ou `lastReparationDate` sur l'équipement |
| Checklist échouée | Incident créé automatiquement, notification CRITICAL |
| Session CDil COMPLETE | `currentState` + `lastVisitDate` mis à jour sur chaque unité visitée |
| Création utilisateur | `mustChangePassword = true`, mot de passe provisoire généré |

---

## Chantiers identifiés

> Légende : 🔴 Prioritaire · 🟡 Moyen terme · 🟢 Évolution future

- ✅ **Multi-tenant TECHNICIAN** : CF ADD/REMOVE_TENANT_ACCESS, panneau "Associer" dans ManagementPanel, badge multi-site, sélecteur d'établissement dans Layout.
- ✅ **Restitution forcée MANAGER** : CF FORCE_RETURN, bouton LogIn sur cartes IN_USE, confirmation avant exécution.
- 🟡 **Export dashboard CLIENT** : PDF ou CSV de synthèse mensuelle pour les décideurs (directeurs, référents qualité).
- 🟡 **Photos CDil** : upload Firebase Storage dans les entrées de visite — champ `photos[]` déjà prévu dans `VisitEntry`, implémentation Storage à faire.
- 🟡 **Patron visite autres équipements** : étendre le système CDil (sessions + export CSV) aux autres types d'équipements — colonnes métier à définir au cas par cas.
- 🟢 **Audit ADMIN séparé** : log dédié aux actions de l'ADMIN lui-même, distinct du journal des actions tenant.
- 🟢 **Rapport PDF structuré** : bilan enrichi (PDF ou Excel) pour les sessions CDil et l'historique de maintenance.
