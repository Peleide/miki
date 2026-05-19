
# MIKI - Plateforme de Suivi de Pointage & Maintenance

MIKI est une application web **multi-tenant** (SaaS) destinée au suivi des interventions de nettoyage et de maintenance. Elle permet aux agents de scanner des QR Codes dans des salles, et aux managers de suivre l'activité en temps réel via un tableau de bord enrichi par l'IA.

---

## 🛠 Stack Technique

### Frontend
- **Framework** : React 19 (Architecture sans bundler via ES Modules / `esm.sh` pour la légèreté).
- **UI** : Tailwind CSS (via CDN), Lucide React (Icônes).
- **Scanner** : `html5-qrcode` pour la lecture QR via caméra.
- **IA** : SDK Google Gemini (`@google/genai`) pour l'analyse de données et le chat assistant.

### Backend (Firebase)
- **Authentication** : Gestion des utilisateurs (Email/Password).
- **Firestore** : Base de données NoSQL temps réel.
- **Cloud Functions** : Logique métier critique (Pointages, gestion utilisateurs, sécurité).
- **Hosting** : Hébergement des fichiers statiques.

---

## 🏗 Architecture & Concepts Clés

### 1. Multi-Tenancy (Cloisonnement)
L'application est conçue pour héberger plusieurs organisations (Clients) sur la même instance.
- **Tenant (Locataire)** : Représente une organisation (ex: "Clinique du Parc").
- **Données** : Toutes les données spécifiques sont stockées dans `tenants/{tenantId}/...`.
- **Utilisateur "Platform"** : Le Super Admin n'appartient à aucun tenant, il gère la collection racine `tenants`.

### 2. Modèle de Données (Firestore)
*   `users/{uid}` : Profil global de l'utilisateur. Contient la map `tenantsAccess` qui définit son rôle par tenant.
*   `tenants/{tenantId}` : Configuration de l'organisation.
    *   `rooms/{roomId}` : Salles et QR Codes.
    *   `checkins/{checkinId}` : Historique des passages (Entrées/Sorties).
    *   `reports/{reportId}` : Signalements d'anomalies.
*   `audit_logs/{logId}` : Trace des actions sensibles (suppression, modif droits).

### 3. Rôles et Permissions
La sécurité est gérée à deux niveaux : **Firestore Rules** (lecture) et **Cloud Functions** (écriture/logique).

| Rôle | Description | Portée |
| :--- | :--- | :--- |
| **ADMIN** (Platform) | Super Admin. Peut tout créer, voir tous les tenants. | Global |
| **MANAGER** | Admin local d'un Tenant. Gère ses agents, salles et stats. | Tenant uniquement |
| **AGENT** | Opérateur terrain. Peut scanner et signaler. | Tenant uniquement |
| **CLIENT** | Accès lecture seule au dashboard. | Tenant uniquement |

---

## 🚀 Installation & Développement

### Prérequis
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Un projet Firebase avec Firestore, Auth et Functions activés.

### Configuration Initiale

1.  **Cloner le projet**
2.  **Installer les dépendances Backend** :
    ```bash
    cd functions
    npm install
    ```
3.  **Configurer l'environnement** :
    *   Renommer/Créer `.env` si nécessaire pour stocker votre clé API Gemini.
    *   Mettre à jour `services/firebaseConfig.ts` avec vos identifiants Firebase.

### Lancer en local
L'application Frontend utilise une approche "No-Build" pour le dev rapide, mais les Cloud Functions doivent être émulées ou déployées.

**Option A : Développement Frontend (avec Backend Prod)**
Lancer simplement un serveur HTTP à la racine :
```bash
npx serve .
```

**Option B : Émulation complète**
```bash
firebase emulators:start
```

---

## 🛡️ Sécurité & Déploiement

### Déploiement des Cloud Functions
Toute la logique d'écriture critique passe par les fonctions pour garantir l'intégrité des données.
```bash
firebase deploy --only functions
```
*Note : Assurez-vous d'être dans le dossier racine et que `firebase.json` pointe bien vers le dossier `functions`.*

### Règles de Sécurité & Index
Ne jamais modifier manuellement les index en prod, utiliser le fichier local.
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Initialisation (Seeding)
Pour créer le tout premier compte **Super Admin**, une Cloud Function sécurisée existe : `seedSystem`.
1.  Déployez les fonctions.
2.  Appelez la fonction via la console Firebase ou un script admin temporaire (nécessite d'être authentifié, voir code pour bypass temporaire si premier déploiement).
3.  Login par défaut : `admin@miki.app` / `password123`.

---

## 🧩 Structure du Code

```
/
├── components/         # Composants React (Vues et UI)
│   ├── AdminPanel.tsx  # Console Super Admin
│   ├── AgentView.tsx   # Interface mobile de scan
│   ├── Dashboard.tsx   # Tableau de bord Manager/Client
│   └── ...
├── services/
│   ├── db.ts           # Wrapper Client pour Firestore & Functions
│   ├── geminiService.ts# Intégration IA
│   └── firebaseConfig.ts
├── functions/          # Backend (Node.js/TypeScript)
│   └── src/index.ts    # Points d'entrée API (addCheckIn, manageUser...)
├── types.ts            # Définitions TypeScript partagées
├── firestore.rules     # Règles de sécurité base de données
└── firestore.indexes.json # Index composites requis
```

## ⚠️ Points d'Attention (Maintenance)

1.  **Race Conditions (Scans)** : Le backend (`functions/src/index.ts`) gère un verrouillage via `activeSessionId`. Ne pas contourner cette logique côté client.
2.  **Index Manquants** : Si une requête échoue avec "Precondition Failed", vérifiez la console JS, cliquez sur le lien Firebase pour créer l'index, et ajoutez-le à `firestore.indexes.json`.
3.  **Gemini API** : La clé API est actuellement gérée côté client ou via env. Pour la prod, il est recommandé de passer les appels IA via une Cloud Function pour cacher la clé.

---

## 📝 Licence
Propriétaire. Usage interne uniquement.
