# MIKI — Audit UX & Améliorations interface

> Suivi des problèmes identifiés, des correctifs appliqués et des points restants.  
> Dernière révision : 2026-08-06

---

## Légende

- ✅ Corrigé
- 🔄 En cours / chantier identifié
- ❌ Non traité (priorité basse ou besoin à confirmer)

---

## Correctifs appliqués

### AgentView (Vue agent / scan QR)

| Problème | Correction | Statut |
|----------|------------|:------:|
| Filtre par marque seul — impossible de trouver rapidement un équipement | Remplacé par : champ de recherche textuelle (nom, marque, modèle, n° série, lieu) + filtre par type d'équipement | ✅ |
| "Chantier (Destination)" — label vague en contexte hospitalier | Renommé "Site de destination" | ✅ |
| Message d'erreur caméra non actionnable ("Vérifiez les autorisations") | Ajout d'instructions pas-à-pas pour autoriser la caméra dans les paramètres navigateur | ✅ |
| Bouton "Relancer Caméra" après erreur | Renommé "Réessayer" (plus naturel) | ✅ |

### Dashboard

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Objets & Suivi" — onglet au nom ambigu | Renommé "Équipements" | ✅ |
| "Historique Global" — "global" sans contexte | Renommé "Mouvements" | ✅ |
| "Visite Technique" — terme technique, valeur vide affichée "Non" | Renommé "Maintenance préventive" + sous-titre "Dernier passage technique" + valeur vide → "—" | ✅ |
| "Réparation" — pas de contexte sur quand c'est renseigné | Renommé "Dernière réparation" + sous-titre "Suite à incident ou ticket" + valeur vide → "—" | ✅ |

### ManagementPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "BLOQUANT (NON = TICKET)" dans checklists — incompréhensible | Renommé "NON → crée un incident" | ✅ |
| "Délai min. entre 2 scans (secondes)" — jargon technique | Renommé "Délai minimum entre 2 emprunts (secondes)" | ✅ |
| "Max scans par fenêtre" | Renommé "Nb max d'emprunts par période" | ✅ |
| "Fenêtre (secondes)" | Renommé "Durée de la période (secondes)" | ✅ |
| "Nom auto-généré" sans explication | Renommé "Identifiant généré automatiquement" + texte explicatif : "Cet identifiant est imprimé sur le QR code. Le numéro d'ordre final sera attribué à l'enregistrement." | ✅ |

### CdilVisitPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Brouillon" — terme technique | Renommé "En cours" | ✅ |
| "Clôturée" — terme juridique peu naturel | Renommé "Terminée" | ✅ |

### TicketPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Pris par un autre technicien" — bouton grisé sans guidance | Ajout d'un sous-texte : "Contactez votre responsable si nécessaire" | ✅ |

---

## Points restants

### Importants

| Problème | Composant | Notes |
|----------|-----------|-------|
| ~~"Catégorie" vs "Type" — deux mots pour le même concept~~ | ManagementPanel | ✅ Select renommé "Type d'équipement" |
| ~~"Créer plusieurs exemplaires (Unitaires)" vs "Gérer en lot" — distinction pas évidente~~ | ManagementPanel | ✅ Description ajoutée sous chaque option |
| ~~Passage vers checklist inattendu au clic "Marquer résolu"~~ | TicketPanel | ✅ Hint affiché sous le bouton quand une vérification est requise |
| ~~"Pris par un autre technicien" — pas de nom affiché~~ | TicketPanel | ✅ CF stocke `assignedToName`, affiché dans le panneau ticket |
| ~~Grille de saisie CDil non utilisable sur mobile (scroll horizontal)~~ | CdilVisitPanel | ✅ Double layout : table sur desktop (md+), cartes empilées sur mobile |

### Mineurs

| Problème | Composant | Notes |
|----------|-----------|-------|
| ~~Notifications non groupées par type~~ | Layout | ✅ Tri : non-lues en premier, puis CRITICAL > WARNING > INFO > date |
| ~~"SCAN" dans la navigation~~ | Layout | ✅ Renommé "MATÉRIEL" (toutes les occurrences) |
| ~~États `ok/1/2` CDil non expliqués dans le widget Dashboard~~ | Dashboard | ✅ Format `Buse ×1` + tooltip "1 remplacement(s) effectué(s)" |
| Badge "En cours d'utilisation" redondant avec bordure colorée | AgentView | Cosmétique, non prioritaire |
| ~~Priorités ticket sans définition~~ | TicketPanel | ✅ Tooltip au survol : définition de chaque niveau (Faible → Critique) |

---

## Chantiers liés (voir aussi ROLES_PERMISSIONS.md)

- ✅ **Restitution forcée MANAGER** — bouton LogIn (orange) sur cartes IN_USE + CF FORCE_RETURN + méthode db.forceReturnEquipment()
- ✅ **Multi-tenant TECHNICIAN** — CF ADD/REMOVE_TENANT_ACCESS + panneau "Associer" dans ManagementPanel + badge multi-site + bouton retrait
- ✅ **Responsive CDil mobile** — double layout : table desktop (md+), cartes empilées sur mobile
