"""
===========================================================================
SENTRUCK - Backend API REST (Flask + PostgreSQL)
===========================================================================

Ce fichier est le cerveau de l'application. Il gère :
  - Les connexions à la base de données PostgreSQL
  - L'authentification (inscription / connexion / token JWT)
  - Le CRUD des camions (trucks)
  - Le CRUD des trajets (trips)

Comment fonctionne une API REST :
  Le frontend envoie une requête HTTP → le backend la traite → retourne du JSON

  GET    → Récupérer des données
  POST   → Créer une nouvelle donnée
  PUT    → Modifier une donnée existante
  DELETE → Supprimer une donnée

Lancer le serveur :
  python app.py
  → Serveur disponible sur http://localhost:5000
===========================================================================
"""

# -----------------------------------------------------------------------
# IMPORTS
# -----------------------------------------------------------------------
import os
import jwt                          # Tokens JWT pour authentifier les utilisateurs
import bcrypt                       # Hashage sécurisé des mots de passe
import psycopg2                     # Connexion à PostgreSQL
import psycopg2.extras              # Pour avoir les résultats en dictionnaires
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS

# -----------------------------------------------------------------------
# CRÉATION DE L'APPLICATION FLASK
# -----------------------------------------------------------------------
app = Flask(__name__)

# CORS : autorise le fichier HTML ouvert en local (file://) à appeler l'API
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://127.0.0.1:3000",
                    "http://localhost:5500", "http://127.0.0.1:5500",
                    "http://localhost:8080", "null", "*"]
    }
})

# Clé secrète pour signer les tokens (changez-la en production !)
SECRET_KEY = os.getenv("SECRET_KEY", "sentruck_senegal_2024_cle_secrete_longue")
TOKEN_DUREE_HEURES = 24

# -----------------------------------------------------------------------
# CONNEXION À POSTGRESQL
# -----------------------------------------------------------------------

def get_db():
    """
    Crée et retourne une nouvelle connexion PostgreSQL.

    psycopg2 est la bibliothèque standard Python pour PostgreSQL.
    RealDictCursor permet d'accéder aux colonnes par leur nom :
      row['nom_camion']  au lieu de  row[0]
    
    Les paramètres se lisent depuis les variables d'environnement.
    Si elles ne sont pas définies, on utilise les valeurs locales par défaut.
    """
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "sentruck"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )


def sql(query, params=None, fetch=False, fetch_one=False):
    """
    Fonction utilitaire pour exécuter n'importe quelle requête SQL.

    Arguments :
      query     : La requête SQL avec des %s à la place des valeurs
      params    : Tuple des valeurs à substituer aux %s
      fetch     : True → retourne plusieurs lignes (SELECT *)
      fetch_one : True → retourne une seule ligne (SELECT ... WHERE id=...)

    Pourquoi utiliser %s et non f-string ?
      ✅ sql("SELECT * FROM trucks WHERE id=%s", (truck_id,))
      ❌ f"SELECT * FROM trucks WHERE id={truck_id}"
      
      La deuxième forme expose à l'injection SQL (attaque classique).
      psycopg2 échappe automatiquement les valeurs avec %s.
    """
    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(query, params)

        if fetch:
            rows = cur.fetchall()
            return [dict(r) for r in rows]
        elif fetch_one:
            row = cur.fetchone()
            return dict(row) if row else None
        else:
            conn.commit()
            # Tenter de retourner la ligne nouvellement créée/modifiée
            try:
                row = cur.fetchone()
                return dict(row) if row else True
            except Exception:
                return True

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"[DB ERROR] {e}")
        raise e
    finally:
        if conn:
            conn.close()


# -----------------------------------------------------------------------
# UTILITAIRES : MOT DE PASSE & JWT
# -----------------------------------------------------------------------

def hash_password(password: str) -> str:
    """
    Transforme un mot de passe en clair en un hash bcrypt sécurisé.

    bcrypt génère automatiquement un "salt" (sel) aléatoire à chaque appel.
    Même mot de passe → hash différent à chaque fois.
    Impossible de retrouver le mot de passe à partir du hash.

    rounds=12 : niveau de sécurité (plus c'est haut, plus c'est lent → plus sécurisé)
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    """
    Vérifie si un mot de passe correspond au hash stocké en base.
    Retourne True si c'est correct, False sinon.
    """
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: int, email: str) -> str:
    """
    Crée un token JWT signé contenant l'identité de l'utilisateur.

    JWT = JSON Web Token
    Structure : HEADER.PAYLOAD.SIGNATURE (trois parties séparées par des points)

    Le payload contient :
      - user_id : pour identifier l'utilisateur sans requête DB
      - email   : info supplémentaire
      - exp     : date d'expiration (le token devient invalide après)

    Seul notre serveur peut créer et vérifier les tokens (grâce à SECRET_KEY).
    Si quelqu'un modifie le token, la signature sera invalide.
    """
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_DUREE_HEURES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str):
    """
    Décode et valide un token JWT.
    Retourne le payload si valide, None si expiré ou falsifié.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None   # Token expiré
    except jwt.InvalidTokenError:
        return None   # Token altéré ou faux


# -----------------------------------------------------------------------
# DÉCORATEUR D'AUTHENTIFICATION
# -----------------------------------------------------------------------

def auth_required(f):
    """
    Décorateur Python qui protège les routes privées.

    Comment l'utiliser sur une route :
        @app.route("/api/trucks", methods=["GET"])
        @auth_required
        def get_trucks(current_user):
            # current_user est automatiquement injecté
            ...

    Le client (frontend) doit envoyer le token dans chaque requête :
        Headers: { "Authorization": "Bearer eyJ0eXAiOiJKV1Q..." }

    Ce décorateur :
      1. Lit le header Authorization
      2. Extrait le token ("Bearer <token>")
      3. Vérifie le token
      4. Récupère l'utilisateur en base
      5. L'injecte dans la fonction de la route
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"erreur": "Authentification requise. Veuillez vous connecter."}), 401

        token = auth_header.split(" ")[1]
        payload = decode_token(token)

        if not payload:
            return jsonify({"erreur": "Token invalide ou expiré. Reconnectez-vous."}), 401

        user = sql(
            "SELECT id, nom, email, telephone, entreprise FROM users WHERE id=%s AND actif=TRUE",
            (payload["user_id"],), fetch_one=True
        )

        if not user:
            return jsonify({"erreur": "Utilisateur introuvable."}), 401

        return f(user, *args, **kwargs)
    return wrapper


# -----------------------------------------------------------------------
# FORMAT DES RÉPONSES
# -----------------------------------------------------------------------

def format_row(row: dict) -> dict:
    """
    Prépare un dictionnaire pour être sérialisé en JSON.
    Convertit les types Python non-compatibles JSON :
      - datetime → string ISO (ex: "2024-01-15T08:30:00")
      - Decimal  → float (pour les prix, poids, distances)
    """
    if not row:
        return row
    result = {}
    for key, value in row.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
        elif hasattr(value, '__float__'):   # Decimal
            result[key] = float(value)
        else:
            result[key] = value
    return result


# =======================================================================
# ROUTES AUTHENTIFICATION
# =======================================================================

@app.route("/api/auth/inscription", methods=["POST"])
def inscription():
    """
    POST /api/auth/inscription
    Crée un nouveau compte gestionnaire.

    Body JSON attendu :
    {
        "nom": "Fatou Diop",
        "email": "fatou@transport.sn",
        "mot_de_passe": "MotDePasse123!",
        "telephone": "+221 77 000 00 00",    (optionnel)
        "entreprise": "Transport Diop SARL"  (optionnel)
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"erreur": "Corps de la requête vide"}), 400

    nom = (data.get("nom") or "").strip()
    email = (data.get("email") or "").strip().lower()
    mdp = data.get("mot_de_passe") or ""
    tel = (data.get("telephone") or "").strip()
    entreprise = (data.get("entreprise") or "").strip()

    # --- Validations ---
    if not nom or not email or not mdp:
        return jsonify({"erreur": "Nom, email et mot de passe sont obligatoires"}), 400
    if "@" not in email or "." not in email:
        return jsonify({"erreur": "Format d'email invalide"}), 400
    if len(mdp) < 8:
        return jsonify({"erreur": "Le mot de passe doit contenir au moins 8 caractères"}), 400

    # Vérifier si l'email existe déjà
    existing = sql("SELECT id FROM users WHERE email=%s", (email,), fetch_one=True)
    if existing:
        return jsonify({"erreur": "Cet email est déjà enregistré"}), 409

    # Créer le compte avec mot de passe hashé
    hashed = hash_password(mdp)
    user = sql(
        """INSERT INTO users (nom, email, mot_de_passe, telephone, entreprise)
           VALUES (%s, %s, %s, %s, %s)
           RETURNING id, nom, email, telephone, entreprise""",
        (nom, email, hashed, tel or None, entreprise or None),
        fetch_one=True
    )

    if not user:
        return jsonify({"erreur": "Erreur lors de la création du compte"}), 500

    token = create_token(user["id"], user["email"])
    return jsonify({
        "message": f"Bienvenue sur SENTRUCK, {user['nom']} ! 🚛",
        "token": token,
        "utilisateur": {k: v for k, v in user.items() if k != "mot_de_passe"}
    }), 201


@app.route("/api/auth/connexion", methods=["POST"])
def connexion():
    """
    POST /api/auth/connexion
    Authentifie un utilisateur et retourne un token JWT.

    Body JSON :
    {
        "email": "demo@sentruck.sn",
        "mot_de_passe": "Demo1234!"
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"erreur": "Données manquantes"}), 400

    email = (data.get("email") or "").strip().lower()
    mdp = data.get("mot_de_passe") or ""

    if not email or not mdp:
        return jsonify({"erreur": "Email et mot de passe requis"}), 400

    # Récupérer l'utilisateur (on inclut le mot_de_passe pour le comparer)
    user = sql(
        "SELECT id, nom, email, mot_de_passe, telephone, entreprise FROM users WHERE email=%s AND actif=TRUE",
        (email,), fetch_one=True
    )

    # Message générique pour ne pas révéler si l'email existe ou non
    err_msg = "Email ou mot de passe incorrect"
    if not user or not check_password(mdp, user["mot_de_passe"]):
        return jsonify({"erreur": err_msg}), 401

    token = create_token(user["id"], user["email"])
    return jsonify({
        "message": f"Connexion réussie. Bonne journée, {user['nom']} !",
        "token": token,
        "utilisateur": {k: v for k, v in user.items() if k != "mot_de_passe"}
    }), 200


@app.route("/api/auth/me", methods=["GET"])
@auth_required
def get_me(current_user):
    """GET /api/auth/me — Retourne le profil de l'utilisateur connecté"""
    return jsonify({"utilisateur": current_user}), 200


# =======================================================================
# ROUTES CAMIONS (TRUCKS)
# =======================================================================

@app.route("/api/trucks", methods=["GET"])
@auth_required
def get_trucks(current_user):
    """
    GET /api/trucks
    Liste tous les camions de l'utilisateur connecté.

    Paramètres optionnels dans l'URL :
      ?statut=disponible   → filtrer par statut
      ?recherche=dakar     → rechercher par nom ou immatriculation
    """
    uid = current_user["id"]
    statut = (request.args.get("statut") or "").strip()
    recherche = (request.args.get("recherche") or "").strip()

    query = """
        SELECT id, nom_camion, immatriculation, marque, modele,
               capacite_tonnes, statut, annee_fabrication,
               chauffeur_nom, chauffeur_tel, date_creation, date_modification
        FROM trucks
        WHERE proprietaire_id = %s
    """
    params = [uid]

    if statut:
        query += " AND statut = %s"
        params.append(statut)

    if recherche:
        query += " AND (nom_camion ILIKE %s OR immatriculation ILIKE %s OR chauffeur_nom ILIKE %s)"
        mot = f"%{recherche}%"
        params.extend([mot, mot, mot])

    query += " ORDER BY date_creation DESC"
    trucks = sql(query, tuple(params), fetch=True)

    return jsonify({
        "camions": [format_row(t) for t in trucks],
        "total": len(trucks)
    }), 200


@app.route("/api/trucks/<int:truck_id>", methods=["GET"])
@auth_required
def get_truck(current_user, truck_id):
    """GET /api/trucks/5 — Retourne un camion spécifique"""
    truck = sql(
        """SELECT id, nom_camion, immatriculation, marque, modele,
                  capacite_tonnes, statut, annee_fabrication,
                  chauffeur_nom, chauffeur_tel, date_creation, date_modification
           FROM trucks WHERE id=%s AND proprietaire_id=%s""",
        (truck_id, current_user["id"]), fetch_one=True
    )
    if not truck:
        return jsonify({"erreur": "Camion introuvable"}), 404
    return jsonify({"camion": format_row(truck)}), 200


@app.route("/api/trucks", methods=["POST"])
@auth_required
def create_truck(current_user):
    """
    POST /api/trucks — Crée un nouveau camion.

    Body JSON :
    {
        "nom_camion": "Louga Cargo 03",
        "immatriculation": "LG-2210-A",
        "marque": "Scania",
        "modele": "R450",
        "capacite_tonnes": 28.5,
        "statut": "disponible",
        "annee_fabrication": 2020,
        "chauffeur_nom": "Aliou Ba",
        "chauffeur_tel": "+221 77 888 99 00"
    }
    """
    d = request.get_json()
    if not d:
        return jsonify({"erreur": "Données manquantes"}), 400

    nom = (d.get("nom_camion") or "").strip()
    immat = (d.get("immatriculation") or "").strip().upper()
    capacite = d.get("capacite_tonnes")

    if not nom:
        return jsonify({"erreur": "Le nom du camion est obligatoire"}), 400
    if not immat:
        return jsonify({"erreur": "L'immatriculation est obligatoire"}), 400
    if capacite is None or float(capacite) <= 0:
        return jsonify({"erreur": "La capacité doit être un nombre positif (en tonnes)"}), 400

    # Vérifier l'unicité de l'immatriculation
    existing = sql("SELECT id FROM trucks WHERE immatriculation=%s", (immat,), fetch_one=True)
    if existing:
        return jsonify({"erreur": f"L'immatriculation {immat} est déjà enregistrée"}), 409

    statut_valides = ["disponible", "en_route", "maintenance", "hors_service"]
    statut = d.get("statut", "disponible")
    if statut not in statut_valides:
        statut = "disponible"

    truck = sql(
        """INSERT INTO trucks
               (nom_camion, immatriculation, marque, modele, capacite_tonnes,
                statut, annee_fabrication, chauffeur_nom, chauffeur_tel, proprietaire_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id, nom_camion, immatriculation, marque, modele,
                     capacite_tonnes, statut, annee_fabrication, chauffeur_nom, chauffeur_tel""",
        (nom, immat,
         (d.get("marque") or "").strip() or None,
         (d.get("modele") or "").strip() or None,
         float(capacite), statut,
         d.get("annee_fabrication") or None,
         (d.get("chauffeur_nom") or "").strip() or None,
         (d.get("chauffeur_tel") or "").strip() or None,
         current_user["id"]),
        fetch_one=True
    )

    return jsonify({
        "message": f"Camion '{nom}' ajouté avec succès ! 🚛",
        "camion": format_row(truck)
    }), 201


@app.route("/api/trucks/<int:truck_id>", methods=["PUT"])
@auth_required
def update_truck(current_user, truck_id):
    """PUT /api/trucks/5 — Modifie un camion existant"""
    # Vérifier que le camion appartient à l'utilisateur
    existing = sql(
        "SELECT id FROM trucks WHERE id=%s AND proprietaire_id=%s",
        (truck_id, current_user["id"]), fetch_one=True
    )
    if not existing:
        return jsonify({"erreur": "Camion introuvable ou accès refusé"}), 404

    d = request.get_json()
    if not d:
        return jsonify({"erreur": "Données manquantes"}), 400

    nom = (d.get("nom_camion") or "").strip()
    immat = (d.get("immatriculation") or "").strip().upper()
    capacite = d.get("capacite_tonnes")

    if not nom:
        return jsonify({"erreur": "Le nom du camion est obligatoire"}), 400
    if not immat:
        return jsonify({"erreur": "L'immatriculation est obligatoire"}), 400
    if capacite is None or float(capacite) <= 0:
        return jsonify({"erreur": "Capacité invalide"}), 400

    # Vérifier que la nouvelle immatriculation n'appartient pas à un autre camion
    conflict = sql(
        "SELECT id FROM trucks WHERE immatriculation=%s AND id!=%s",
        (immat, truck_id), fetch_one=True
    )
    if conflict:
        return jsonify({"erreur": f"L'immatriculation {immat} est déjà utilisée"}), 409

    statut_valides = ["disponible", "en_route", "maintenance", "hors_service"]
    statut = d.get("statut", "disponible")
    if statut not in statut_valides:
        statut = "disponible"

    truck = sql(
        """UPDATE trucks SET
               nom_camion=%s, immatriculation=%s, marque=%s, modele=%s,
               capacite_tonnes=%s, statut=%s, annee_fabrication=%s,
               chauffeur_nom=%s, chauffeur_tel=%s
           WHERE id=%s AND proprietaire_id=%s
           RETURNING id, nom_camion, immatriculation, marque, modele,
                     capacite_tonnes, statut, chauffeur_nom, chauffeur_tel""",
        (nom, immat,
         (d.get("marque") or "").strip() or None,
         (d.get("modele") or "").strip() or None,
         float(capacite), statut,
         d.get("annee_fabrication") or None,
         (d.get("chauffeur_nom") or "").strip() or None,
         (d.get("chauffeur_tel") or "").strip() or None,
         truck_id, current_user["id"]),
        fetch_one=True
    )

    return jsonify({
        "message": "Camion mis à jour avec succès ✅",
        "camion": format_row(truck)
    }), 200


@app.route("/api/trucks/<int:truck_id>", methods=["DELETE"])
@auth_required
def delete_truck(current_user, truck_id):
    """DELETE /api/trucks/5 — Supprime un camion et tous ses trajets associés"""
    truck = sql(
        "SELECT nom_camion FROM trucks WHERE id=%s AND proprietaire_id=%s",
        (truck_id, current_user["id"]), fetch_one=True
    )
    if not truck:
        return jsonify({"erreur": "Camion introuvable ou accès refusé"}), 404

    # ON DELETE CASCADE dans SQL supprime aussi les trajets du camion
    sql("DELETE FROM trucks WHERE id=%s AND proprietaire_id=%s",
        (truck_id, current_user["id"]))

    return jsonify({"message": f"Camion '{truck['nom_camion']}' supprimé."}), 200


# =======================================================================
# ROUTES TRAJETS (TRIPS)
# =======================================================================

@app.route("/api/trips", methods=["GET"])
@auth_required
def get_trips(current_user):
    """
    GET /api/trips — Liste tous les trajets de l'utilisateur.
    
    Filtres optionnels :
      ?statut=en_cours
      ?truck_id=3
      ?recherche=dakar
    """
    uid = current_user["id"]
    statut = (request.args.get("statut") or "").strip()
    truck_id = request.args.get("truck_id")
    recherche = (request.args.get("recherche") or "").strip()

    query = """
        SELECT t.id, t.depart, t.destination, t.distance_km,
               t.date_depart, t.date_arrivee_prevue, t.date_arrivee_reelle,
               t.marchandise, t.poids_charge, t.montant_fcfa, t.frais_carburant,
               t.statut, t.notes, t.date_creation,
               t.truck_id,
               tr.nom_camion, tr.immatriculation, tr.chauffeur_nom
        FROM trips t
        JOIN trucks tr ON tr.id = t.truck_id
        WHERE t.proprietaire_id = %s
    """
    params = [uid]

    if statut:
        query += " AND t.statut = %s"
        params.append(statut)

    if truck_id:
        query += " AND t.truck_id = %s"
        params.append(int(truck_id))

    if recherche:
        query += " AND (t.depart ILIKE %s OR t.destination ILIKE %s OR t.marchandise ILIKE %s)"
        mot = f"%{recherche}%"
        params.extend([mot, mot, mot])

    query += " ORDER BY t.date_depart DESC"
    trips = sql(query, tuple(params), fetch=True)

    return jsonify({
        "trajets": [format_row(trip) for trip in trips],
        "total": len(trips)
    }), 200


@app.route("/api/trips/<int:trip_id>", methods=["GET"])
@auth_required
def get_trip(current_user, trip_id):
    """GET /api/trips/7 — Retourne un trajet spécifique"""
    trip = sql(
        """SELECT t.*, tr.nom_camion, tr.immatriculation, tr.chauffeur_nom
           FROM trips t
           JOIN trucks tr ON tr.id = t.truck_id
           WHERE t.id=%s AND t.proprietaire_id=%s""",
        (trip_id, current_user["id"]), fetch_one=True
    )
    if not trip:
        return jsonify({"erreur": "Trajet introuvable"}), 404
    return jsonify({"trajet": format_row(trip)}), 200


@app.route("/api/trips", methods=["POST"])
@auth_required
def create_trip(current_user):
    """
    POST /api/trips — Crée un nouveau trajet.

    Body JSON :
    {
        "truck_id": 1,
        "depart": "Dakar - Port Autonome",
        "destination": "Tambacounda - Marché",
        "distance_km": 465,
        "date_depart": "2024-07-15T06:00:00",
        "date_arrivee_prevue": "2024-07-15T20:00:00",
        "marchandise": "Ciment 500 sacs",
        "poids_charge": 25.0,
        "montant_fcfa": 450000,
        "frais_carburant": 95000
    }
    """
    d = request.get_json()
    if not d:
        return jsonify({"erreur": "Données manquantes"}), 400

    truck_id = d.get("truck_id")
    depart = (d.get("depart") or "").strip()
    dest = (d.get("destination") or "").strip()
    date_dep = d.get("date_depart")

    if not truck_id:
        return jsonify({"erreur": "Veuillez sélectionner un camion"}), 400
    if not depart:
        return jsonify({"erreur": "Le lieu de départ est obligatoire"}), 400
    if not dest:
        return jsonify({"erreur": "La destination est obligatoire"}), 400
    if not date_dep:
        return jsonify({"erreur": "La date de départ est obligatoire"}), 400

    # Vérifier que le camion appartient à l'utilisateur
    truck = sql(
        "SELECT id FROM trucks WHERE id=%s AND proprietaire_id=%s",
        (int(truck_id), current_user["id"]), fetch_one=True
    )
    if not truck:
        return jsonify({"erreur": "Camion introuvable ou accès refusé"}), 404

    statut_valides = ["planifie", "en_cours", "termine", "annule"]
    statut = d.get("statut", "planifie")
    if statut not in statut_valides:
        statut = "planifie"

    trip = sql(
        """INSERT INTO trips
               (truck_id, proprietaire_id, depart, destination, distance_km,
                date_depart, date_arrivee_prevue, marchandise, poids_charge,
                montant_fcfa, frais_carburant, statut, notes)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id, depart, destination, statut, date_depart, montant_fcfa""",
        (int(truck_id), current_user["id"], depart, dest,
         float(d["distance_km"]) if d.get("distance_km") else None,
         date_dep,
         d.get("date_arrivee_prevue") or None,
         (d.get("marchandise") or "").strip() or None,
         float(d["poids_charge"]) if d.get("poids_charge") else None,
         float(d.get("montant_fcfa") or 0),
         float(d.get("frais_carburant") or 0),
         statut,
         (d.get("notes") or "").strip() or None),
        fetch_one=True
    )

    return jsonify({
        "message": f"Trajet {depart} → {dest} créé avec succès ! 🗺️",
        "trajet": format_row(trip)
    }), 201


@app.route("/api/trips/<int:trip_id>", methods=["PUT"])
@auth_required
def update_trip(current_user, trip_id):
    """PUT /api/trips/7 — Modifie un trajet existant"""
    existing = sql(
        "SELECT id FROM trips WHERE id=%s AND proprietaire_id=%s",
        (trip_id, current_user["id"]), fetch_one=True
    )
    if not existing:
        return jsonify({"erreur": "Trajet introuvable ou accès refusé"}), 404

    d = request.get_json()
    if not d:
        return jsonify({"erreur": "Données manquantes"}), 400

    truck_id = d.get("truck_id")
    depart = (d.get("depart") or "").strip()
    dest = (d.get("destination") or "").strip()
    date_dep = d.get("date_depart")

    if not depart or not dest or not date_dep:
        return jsonify({"erreur": "Départ, destination et date sont obligatoires"}), 400

    if truck_id:
        truck = sql(
            "SELECT id FROM trucks WHERE id=%s AND proprietaire_id=%s",
            (int(truck_id), current_user["id"]), fetch_one=True
        )
        if not truck:
            return jsonify({"erreur": "Camion introuvable"}), 404

    statut_valides = ["planifie", "en_cours", "termine", "annule"]
    statut = d.get("statut", "planifie")
    if statut not in statut_valides:
        statut = "planifie"

    trip = sql(
        """UPDATE trips SET
               truck_id=%s, depart=%s, destination=%s, distance_km=%s,
               date_depart=%s, date_arrivee_prevue=%s, date_arrivee_reelle=%s,
               marchandise=%s, poids_charge=%s, montant_fcfa=%s,
               frais_carburant=%s, statut=%s, notes=%s
           WHERE id=%s AND proprietaire_id=%s
           RETURNING id, depart, destination, statut, date_depart, montant_fcfa""",
        (int(truck_id) if truck_id else existing["id"],
         depart, dest,
         float(d["distance_km"]) if d.get("distance_km") else None,
         date_dep,
         d.get("date_arrivee_prevue") or None,
         d.get("date_arrivee_reelle") or None,
         (d.get("marchandise") or "").strip() or None,
         float(d["poids_charge"]) if d.get("poids_charge") else None,
         float(d.get("montant_fcfa") or 0),
         float(d.get("frais_carburant") or 0),
         statut,
         (d.get("notes") or "").strip() or None,
         trip_id, current_user["id"]),
        fetch_one=True
    )

    return jsonify({
        "message": "Trajet mis à jour ✅",
        "trajet": format_row(trip)
    }), 200


@app.route("/api/trips/<int:trip_id>", methods=["DELETE"])
@auth_required
def delete_trip(current_user, trip_id):
    """DELETE /api/trips/7 — Supprime un trajet"""
    trip = sql(
        "SELECT depart, destination FROM trips WHERE id=%s AND proprietaire_id=%s",
        (trip_id, current_user["id"]), fetch_one=True
    )
    if not trip:
        return jsonify({"erreur": "Trajet introuvable ou accès refusé"}), 404

    sql("DELETE FROM trips WHERE id=%s AND proprietaire_id=%s",
        (trip_id, current_user["id"]))

    return jsonify({
        "message": f"Trajet {trip['depart']} → {trip['destination']} supprimé."
    }), 200


# =======================================================================
# STATISTIQUES DASHBOARD
# =======================================================================

@app.route("/api/stats", methods=["GET"])
@auth_required
def get_stats(current_user):
    """
    GET /api/stats — Résumé chiffré pour le tableau de bord.
    Retourne :
      - Nombre total de camions / répartition par statut
      - Nombre de trajets / chiffre d'affaires total
    """
    uid = current_user["id"]

    truck_stats = sql(
        """SELECT
               COUNT(*) AS total,
               COUNT(CASE WHEN statut='disponible'   THEN 1 END) AS disponibles,
               COUNT(CASE WHEN statut='en_route'     THEN 1 END) AS en_route,
               COUNT(CASE WHEN statut='maintenance'  THEN 1 END) AS en_maintenance,
               COUNT(CASE WHEN statut='hors_service' THEN 1 END) AS hors_service
           FROM trucks WHERE proprietaire_id=%s""",
        (uid,), fetch_one=True
    )

    trip_stats = sql(
        """SELECT
               COUNT(*) AS total,
               COUNT(CASE WHEN statut='planifie' THEN 1 END) AS planifies,
               COUNT(CASE WHEN statut='en_cours' THEN 1 END) AS en_cours,
               COUNT(CASE WHEN statut='termine'  THEN 1 END) AS termines,
               COALESCE(SUM(CASE WHEN statut='termine' THEN montant_fcfa END), 0) AS ca_total,
               COALESCE(SUM(CASE WHEN statut='termine' THEN frais_carburant END), 0) AS carburant_total
           FROM trips WHERE proprietaire_id=%s""",
        (uid,), fetch_one=True
    )

    return jsonify({
        "camions": format_row(truck_stats),
        "trajets": format_row(trip_stats)
    }), 200


# =======================================================================
# GESTION DES ERREURS GLOBALES
# =======================================================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({"erreur": "Route introuvable"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"erreur": "Méthode HTTP non autorisée"}), 405

@app.errorhandler(500)
def server_error(e):
    return jsonify({"erreur": "Erreur interne du serveur"}), 500


# =======================================================================
# LANCEMENT DU SERVEUR
# =======================================================================

if __name__ == "__main__":
    print("=" * 55)
    print("   🚛  SENTRUCK - Serveur API démarré")
    print("=" * 55)
    print("  URL     : http://localhost:5000")
    print("  Mode    : Développement (debug=True)")
    print("")
    print("  ROUTES AUTH")
    print("  POST /api/auth/inscription")
    print("  POST /api/auth/connexion")
    print("  GET  /api/auth/me")
    print("")
    print("  ROUTES CAMIONS")
    print("  GET/POST   /api/trucks")
    print("  GET/PUT/DELETE /api/trucks/:id")
    print("")
    print("  ROUTES TRAJETS")
    print("  GET/POST   /api/trips")
    print("  GET/PUT/DELETE /api/trips/:id")
    print("")
    print("  GET /api/stats  (tableau de bord)")
    print("=" * 55)

    app.run(host="0.0.0.0", port=5000, debug=True)
