-- ===========================================================================
-- SENTRUCK - Schéma Base de Données PostgreSQL
-- ===========================================================================
-- Ce fichier crée toutes les tables nécessaires à l'application.
-- Exécutez-le avec : psql -U postgres -d sentruck -f schema.sql
-- ===========================================================================

-- ----------------------------------------------------------------
-- 1. TABLE DES UTILISATEURS (users)
-- ----------------------------------------------------------------
-- Stocke les comptes des gestionnaires de flotte
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    nom             VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe    TEXT NOT NULL,              -- Toujours hashé, jamais en clair
    telephone       VARCHAR(20),               -- Numéro sénégalais (ex: +221 77 XXX XX XX)
    entreprise      VARCHAR(150),              -- Nom de la société de transport
    date_inscription TIMESTAMP DEFAULT NOW(),
    actif           BOOLEAN DEFAULT TRUE
);

-- ----------------------------------------------------------------
-- 2. TABLE DES CAMIONS (trucks)
-- ----------------------------------------------------------------
-- Chaque camion appartient à un utilisateur (propriétaire)
CREATE TABLE IF NOT EXISTS trucks (
    id              SERIAL PRIMARY KEY,
    nom_camion      VARCHAR(150) NOT NULL,      -- Ex: "Dakar Express 01"
    immatriculation VARCHAR(50) UNIQUE NOT NULL,-- Ex: "DK-4521-A" (plaque sénégalaise)
    marque          VARCHAR(100),              -- Ex: Renault, Mercedes, MAN
    modele          VARCHAR(100),              -- Ex: T480, Actros
    capacite_tonnes NUMERIC(6,2) NOT NULL DEFAULT 0, -- Capacité en tonnes
    statut          VARCHAR(30) DEFAULT 'disponible'
                    CHECK (statut IN ('disponible', 'en_route', 'maintenance', 'hors_service')),
    annee_fabrication INTEGER,
    chauffeur_nom   VARCHAR(150),              -- Nom du chauffeur assigné
    chauffeur_tel   VARCHAR(20),               -- Téléphone du chauffeur
    proprietaire_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date_creation   TIMESTAMP DEFAULT NOW(),
    date_modification TIMESTAMP DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 3. TABLE DES TRAJETS (trips)
-- ----------------------------------------------------------------
-- Chaque trajet est lié à un camion
CREATE TABLE IF NOT EXISTS trips (
    id              SERIAL PRIMARY KEY,
    truck_id        INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
    proprietaire_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Lieux de départ et destination (villes sénégalaises)
    depart          VARCHAR(200) NOT NULL,     -- Ex: "Dakar - Port Autonome"
    destination     VARCHAR(200) NOT NULL,     -- Ex: "Ziguinchor - Marché Central"
    distance_km     NUMERIC(8,2),              -- Distance estimée en km
    date_depart     TIMESTAMP NOT NULL,
    date_arrivee_prevue TIMESTAMP,
    date_arrivee_reelle TIMESTAMP,
    -- Données commerciales
    marchandise     VARCHAR(200),              -- Ex: "Riz 500 sacs", "Ciment 20 tonnes"
    poids_charge    NUMERIC(6,2),              -- Poids réel transporté (tonnes)
    montant_fcfa    NUMERIC(12,2) DEFAULT 0,   -- Prix du trajet en FCFA
    frais_carburant NUMERIC(10,2) DEFAULT 0,
    statut          VARCHAR(30) DEFAULT 'planifie'
                    CHECK (statut IN ('planifie', 'en_cours', 'termine', 'annule')),
    notes           TEXT,                      -- Remarques du chauffeur / gestionnaire
    date_creation   TIMESTAMP DEFAULT NOW(),
    date_modification TIMESTAMP DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 4. TRIGGER : Mise à jour automatique de date_modification
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_date_modification()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_modification = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur trucks
DROP TRIGGER IF EXISTS trigger_trucks_date ON trucks;
CREATE TRIGGER trigger_trucks_date
    BEFORE UPDATE ON trucks
    FOR EACH ROW EXECUTE FUNCTION update_date_modification();

-- Appliquer le trigger sur trips
DROP TRIGGER IF EXISTS trigger_trips_date ON trips;
CREATE TRIGGER trigger_trips_date
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION update_date_modification();

-- ----------------------------------------------------------------
-- 5. DONNÉES DE DÉMONSTRATION (contexte sénégalais)
-- ----------------------------------------------------------------
-- Compte démo : email = demo@sentruck.sn / mot de passe = Demo1234!
INSERT INTO users (nom, email, mot_de_passe, telephone, entreprise)
SELECT
    'Mamadou Ndiaye',
    'demo@sentruck.sn',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP3oiMRNwBzXe',
    '+221 77 123 45 67',
    'Transport Ndiaye & Frères SARL'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@sentruck.sn');

-- Camions de démonstration
INSERT INTO trucks (nom_camion, immatriculation, marque, modele, capacite_tonnes, statut, annee_fabrication, chauffeur_nom, chauffeur_tel, proprietaire_id)
SELECT 'Dakar Force 01', 'DK-4521-A', 'Renault', 'T480', 25.00, 'disponible', 2019,
       'Ibrahima Sarr', '+221 76 234 56 78',
       (SELECT id FROM users WHERE email='demo@sentruck.sn')
WHERE NOT EXISTS (SELECT 1 FROM trucks WHERE immatriculation='DK-4521-A');

INSERT INTO trucks (nom_camion, immatriculation, marque, modele, capacite_tonnes, statut, annee_fabrication, chauffeur_nom, chauffeur_tel, proprietaire_id)
SELECT 'Casamance Express', 'ZG-1102-B', 'Mercedes-Benz', 'Actros 1845', 32.00, 'en_route', 2021,
       'Ousmane Diatta', '+221 78 345 67 89',
       (SELECT id FROM users WHERE email='demo@sentruck.sn')
WHERE NOT EXISTS (SELECT 1 FROM trucks WHERE immatriculation='ZG-1102-B');

INSERT INTO trucks (nom_camion, immatriculation, marque, modele, capacite_tonnes, statut, annee_fabrication, chauffeur_nom, chauffeur_tel, proprietaire_id)
SELECT 'Sine Saloum Cargo', 'KF-0877-C', 'MAN', 'TGX 26.440', 20.00, 'maintenance', 2018,
       'Lamine Faye', '+221 70 456 78 90',
       (SELECT id FROM users WHERE email='demo@sentruck.sn')
WHERE NOT EXISTS (SELECT 1 FROM trucks WHERE immatriculation='KF-0877-C');

INSERT INTO trucks (nom_camion, immatriculation, marque, modele, capacite_tonnes, statut, annee_fabrication, chauffeur_nom, chauffeur_tel, proprietaire_id)
SELECT 'Saint-Louis Rapid', 'SL-3341-D', 'Volvo', 'FH16 750', 28.00, 'disponible', 2022,
       'Cheikh Mbaye', '+221 77 567 89 01',
       (SELECT id FROM users WHERE email='demo@sentruck.sn')
WHERE NOT EXISTS (SELECT 1 FROM trucks WHERE immatriculation='SL-3341-D');

-- Trajets de démonstration
INSERT INTO trips (truck_id, proprietaire_id, depart, destination, distance_km, date_depart, date_arrivee_prevue, marchandise, poids_charge, montant_fcfa, frais_carburant, statut)
SELECT
    (SELECT id FROM trucks WHERE immatriculation='DK-4521-A'),
    (SELECT id FROM users WHERE email='demo@sentruck.sn'),
    'Dakar - Port Autonome de Dakar',
    'Thiès - Zone Industrielle',
    70.00,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day 18 hours',
    'Conteneurs alimentaires (riz importé)', 22.50,
    180000, 45000, 'termine'
WHERE NOT EXISTS (SELECT 1 FROM trips WHERE depart='Dakar - Port Autonome de Dakar' AND destination='Thiès - Zone Industrielle');

INSERT INTO trips (truck_id, proprietaire_id, depart, destination, distance_km, date_depart, date_arrivee_prevue, marchandise, poids_charge, montant_fcfa, frais_carburant, statut)
SELECT
    (SELECT id FROM trucks WHERE immatriculation='ZG-1102-B'),
    (SELECT id FROM users WHERE email='demo@sentruck.sn'),
    'Dakar - Marché Sandaga',
    'Ziguinchor - Marché Central',
    470.00,
    NOW() - INTERVAL '5 hours',
    NOW() + INTERVAL '7 hours',
    'Marchandises diverses (tissus wax, électroménager)', 28.00,
    550000, 120000, 'en_cours'
WHERE NOT EXISTS (SELECT 1 FROM trips WHERE destination='Ziguinchor - Marché Central');

INSERT INTO trips (truck_id, proprietaire_id, depart, destination, distance_km, date_depart, date_arrivee_prevue, marchandise, poids_charge, montant_fcfa, frais_carburant, statut)
SELECT
    (SELECT id FROM trucks WHERE immatriculation='SL-3341-D'),
    (SELECT id FROM users WHERE email='demo@sentruck.sn'),
    'Saint-Louis - Entrepôt Nord',
    'Dakar - Zone de Captage',
    260.00,
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '1 day 8 hours',
    'Tomates fraîches - 800 cageots', 24.00,
    320000, 75000, 'planifie'
WHERE NOT EXISTS (SELECT 1 FROM trips WHERE depart='Saint-Louis - Entrepôt Nord');

SELECT '✅ Base de données SENTRUCK initialisée !' AS message;
SELECT COUNT(*) AS utilisateurs FROM users;
SELECT COUNT(*) AS camions FROM trucks;
SELECT COUNT(*) AS trajets FROM trips;
