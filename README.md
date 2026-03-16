# 🚛 SENTRUCK — Guide de démarrage complet

> Plateforme de gestion de flotte pour transporteurs sénégalais  
> Backend : Python Flask + PostgreSQL | Frontend : HTML/CSS/JS pur

---

## 📁 Structure du projet

```
sentruck/
│
├── backend/                  ← Serveur Python Flask (API REST)
│   ├── app.py                ← Fichier principal du serveur
│   ├── requirements.txt      ← Dépendances Python à installer
│   └── .env.example          ← Modèle de configuration (à dupliquer en .env)
│
├── frontend/                 ← Interface utilisateur (HTML/CSS/JS)
│   ├── index.html            ← Page d'accueil
│   ├── auth.html             ← Connexion / Inscription
│   ├── dashboard.html        ← Tableau de bord principal
│   ├── css/
│   │   └── style.css         ← Tous les styles
│   └── js/
│       ├── api.js            ← Client API + utilitaires partagés
│       └── dashboard.js      ← Logique du dashboard (CRUD)
│
└── database/
    └── schema.sql            ← Création des tables + données de test
```

---

## ⚡ Démarrage rapide (étape par étape)

### ÉTAPE 1 — Installer PostgreSQL

**Windows :**  
Télécharger et installer depuis https://www.postgresql.org/download/windows/  
Retenez le mot de passe que vous choisissez pour l'utilisateur `postgres`.

**macOS :**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian :**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

---

### ÉTAPE 2 — Créer la base de données

Ouvrez un terminal et connectez-vous à PostgreSQL :

```bash
# Sur Windows (via pgAdmin ou psql)
psql -U postgres

# Sur Linux/macOS
sudo -u postgres psql
```

Dans le shell PostgreSQL, créez la base :

```sql
CREATE DATABASE sentruck;
\q
```

Ensuite, exécutez le schéma SQL (depuis le dossier du projet) :

```bash
psql -U postgres -d sentruck -f database/schema.sql
```

Vous devriez voir :
```
✅ Base de données SENTRUCK initialisée !
 utilisateurs 
--------------
            1
 camions 
---------
       4
 trajets 
---------
       3
```

---

### ÉTAPE 3 — Configurer le backend Python

```bash
# Aller dans le dossier backend
cd sentruck/backend

# (Recommandé) Créer un environnement virtuel Python
python -m venv venv

# Activer l'environnement virtuel
# Sur Windows :
venv\Scripts\activate
# Sur macOS/Linux :
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt
```

Créer le fichier de configuration `.env` :

```bash
# Copier le modèle
cp .env.example .env

# Éditer .env avec votre éditeur et ajustez :
# DB_PASSWORD=votre_mot_de_passe_postgres
```

Contenu du fichier `.env` :
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentruck
DB_USER=postgres
DB_PASSWORD=postgres        # ← Votre mot de passe PostgreSQL ici
SECRET_KEY=changez_cette_valeur_longue_et_unique
```

---

### ÉTAPE 4 — Lancer le serveur backend

```bash
# Depuis le dossier sentruck/backend/
python app.py
```

Vous devriez voir :
```
=======================================================
   🚛  SENTRUCK - Serveur API démarré
=======================================================
  URL     : http://localhost:5000
  Mode    : Développement (debug=True)

  ROUTES AUTH
  POST /api/auth/inscription
  POST /api/auth/connexion
  ...
=======================================================
```

Le serveur tourne maintenant sur **http://localhost:5000**

---

### ÉTAPE 5 — Ouvrir le frontend

Deux options :

**Option A — Ouvrir directement dans le navigateur :**
```
Ouvrir le fichier : sentruck/frontend/index.html
(Double-clic sur le fichier, ou glisser-déposer dans le navigateur)
```

**Option B — Serveur local (recommandé, évite les problèmes CORS) :**
```bash
# Depuis le dossier sentruck/frontend/
# Avec Python :
python -m http.server 3000

# Puis ouvrez : http://localhost:3000
```

---

## 🔐 Compte de démonstration

| Champ | Valeur |
|-------|--------|
| Email | `demo@sentruck.sn` |
| Mot de passe | `Demo1234!` |

Ce compte est créé automatiquement par le fichier `schema.sql`.

---

## 🗺️ Fonctionnalités disponibles

### Authentification
- ✅ Inscription avec nom, email, téléphone, entreprise
- ✅ Connexion sécurisée (bcrypt + JWT)
- ✅ Déconnexion
- ✅ Pages protégées (redirect si non connecté)

### Gestion des camions
- ✅ Liste de tous les camions avec tableau filtrable
- ✅ Ajouter un camion (nom, immatriculation, marque, capacité, chauffeur…)
- ✅ Modifier un camion existant
- ✅ Supprimer un camion (avec confirmation)
- ✅ Filtrage par statut (disponible, en route, maintenance, hors service)
- ✅ Recherche par nom / immatriculation / chauffeur

### Gestion des trajets
- ✅ Liste de tous les trajets avec détails
- ✅ Créer un trajet (départ, destination, date, marchandise, montant FCFA…)
- ✅ Modifier un trajet
- ✅ Supprimer un trajet
- ✅ Filtrage par statut (planifié, en cours, terminé, annulé)
- ✅ Recherche par ville, marchandise, camion

### Tableau de bord
- ✅ KPIs : nombre de camions par statut
- ✅ KPIs : trajets en cours, terminés, chiffre d'affaires en FCFA
- ✅ Navigation entre sections

---

## 🌐 API REST — Documentation

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/inscription` | Créer un compte |
| POST | `/api/auth/connexion` | Se connecter, retourne un token JWT |
| GET  | `/api/auth/me` | Profil de l'utilisateur connecté |

### Camions

| Méthode | Route | Description |
|---------|-------|-------------|
| GET    | `/api/trucks` | Liste tous les camions de l'utilisateur |
| POST   | `/api/trucks` | Créer un nouveau camion |
| GET    | `/api/trucks/:id` | Détails d'un camion |
| PUT    | `/api/trucks/:id` | Modifier un camion |
| DELETE | `/api/trucks/:id` | Supprimer un camion |

### Trajets

| Méthode | Route | Description |
|---------|-------|-------------|
| GET    | `/api/trips` | Liste tous les trajets |
| POST   | `/api/trips` | Créer un trajet |
| GET    | `/api/trips/:id` | Détails d'un trajet |
| PUT    | `/api/trips/:id` | Modifier un trajet |
| DELETE | `/api/trips/:id` | Supprimer un trajet |

### Statistiques

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/stats` | Résumé pour le dashboard |

**Headers requis pour les routes protégées :**
```
Authorization: Bearer <votre_token_jwt>
```

---

## 🔒 Sécurité — Comment ça fonctionne

### Mots de passe (bcrypt)
Les mots de passe ne sont jamais stockés en clair. bcrypt les transforme en hash irréversible avec un sel aléatoire.
```
"Demo1234!" → "$2b$12$LQv3c1yqBWVHxkd0LHAkCO..."
```

### Tokens JWT
À la connexion, le serveur génère un token JWT signé (valide 24h). Le frontend le stocke dans `localStorage` et l'envoie dans chaque requête suivante.

### Protection SQL
Toutes les requêtes SQL utilisent des paramètres (`%s`) pour éviter les injections SQL.

### Protection XSS
La fonction `escapeHtml()` du frontend nettoie toutes les données avant insertion dans le DOM.

---

## 🛠️ Résolution des problèmes courants

**Erreur CORS (network error dans la console) :**
- Assurez-vous que le serveur Flask tourne sur le port 5000
- Ouvrez le frontend via un serveur local (option B) plutôt qu'en fichier direct

**Erreur "could not connect to server" :**
- Vérifiez que PostgreSQL est bien démarré
- Vérifiez les paramètres dans `.env` (DB_PASSWORD notamment)

**Erreur 401 Unauthorized :**
- Votre token JWT a peut-être expiré → reconnectez-vous

**Page blanche au dashboard :**
- Ouvrez la console du navigateur (F12) pour voir l'erreur
- Vérifiez que le serveur Flask est bien lancé

---

## 📱 Compatibilité

| Plateforme | Support |
|------------|---------|
| Chrome / Edge | ✅ Complet |
| Firefox | ✅ Complet |
| Safari (macOS/iOS) | ✅ Complet |
| Android (Chrome) | ✅ Responsive |
| Internet Explorer | ❌ Non supporté |

---

*SENTRUCK MVP v1.0 — Conçu pour les transporteurs sénégalais 🇸🇳*
"#sentruck"
