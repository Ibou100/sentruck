/**
 * =========================================================================
 * SENTRUCK - dashboard.js
 * =========================================================================
 * Ce fichier gère toute la logique du tableau de bord :
 *   - Chargement initial (stats, camions, trajets)
 *   - Navigation entre les sections
 *   - CRUD Camions (Créer, Lire, Modifier, Supprimer)
 *   - CRUD Trajets
 *   - Gestion des modals (formulaires, confirmation)
 *   - Filtres et recherche
 *
 * Note: api.js est chargé avant ce fichier et fournit :
 *   - apiCall()    : pour appeler le backend
 *   - Auth         : pour gérer le token JWT
 *   - formatFCFA() : pour formater les montants
 *   - formatDate() : pour formater les dates
 *   - statusBadge(): pour les badges de statut colorés
 *   - showToast()  : pour les notifications
 * =========================================================================
 */

// -------------------------------------------------------------------------
// ÉTAT GLOBAL DE L'APPLICATION
// -------------------------------------------------------------------------
// On stocke les données récupérées du serveur pour ne pas recharger
// à chaque fois qu'on filtre ou qu'on recherche.

let allTrucks = [];   // Tous les camions de l'utilisateur
let allTrips  = [];   // Tous les trajets de l'utilisateur

// Pour la suppression (on garde en mémoire ce qu'on va supprimer)
let deleteTarget = { type: null, id: null };

// -------------------------------------------------------------------------
// INITIALISATION : S'exécute au chargement de la page
// -------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {

  // 1. Vérifier que l'utilisateur est connecté
  //    Si non connecté → redirige vers auth.html
  if (!Auth.requireAuth()) return;

  // 2. Remplir les infos utilisateur dans la topbar
  const user = Auth.getUser();
  if (user) {
    document.getElementById("user-nom").textContent = user.nom || "—";
    document.getElementById("user-entreprise").textContent = user.entreprise || user.email || "—";
    document.getElementById("user-avatar").textContent = getInitiale(user.nom);
  }

  // 3. Charger toutes les données depuis le backend
  await loadAllData();

  // 4. Cacher le loading overlay et afficher l'app
  document.getElementById("loading-overlay").style.display = "none";
  document.getElementById("app").style.display = "grid";
});

/**
 * Charge les statistiques, les camions et les trajets en parallèle.
 * Promise.all() envoie les 3 requêtes en même temps → plus rapide.
 */
async function loadAllData() {
  try {
    // Lancer les 3 requêtes simultanément
    await Promise.all([
      loadStats(),
      loadTrucks(),
      loadTrips()
    ]);
  } catch (err) {
    console.error("Erreur chargement données:", err);
    showToast("Erreur de chargement des données", "error");
  }
}

// -------------------------------------------------------------------------
// NAVIGATION ENTRE LES SECTIONS
// -------------------------------------------------------------------------

/**
 * Affiche la section demandée et cache les autres.
 * @param {string} section - "overview", "trucks" ou "trips"
 */
function showSection(section) {
  // Toutes les sections possibles
  const sections = ["overview", "trucks", "trips"];

  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    const navEl = document.getElementById(`nav-${s}`);
    if (el) el.classList.toggle("hidden", s !== section);
    if (navEl) navEl.classList.toggle("active", s === section);
  });

  // Mettre à jour l'indicateur dans la topbar
  const labels = { overview: "Vue d'ensemble", trucks: "Mes camions", trips: "Mes trajets" };
  document.getElementById("topbar-section").textContent = labels[section] || "";
}

// -------------------------------------------------------------------------
// CHARGEMENT DES STATISTIQUES
// -------------------------------------------------------------------------
async function loadStats() {
  const { ok, data } = await apiCall("/stats");
  if (!ok) return;

  const c = data.camions || {};
  const t = data.trajets  || {};

  // Mettre à jour les cartes KPI camions
  document.getElementById("stat-total-trucks").textContent = c.total        || 0;
  document.getElementById("stat-dispo").textContent        = c.disponibles  || 0;
  document.getElementById("stat-en-route").textContent     = c.en_route     || 0;
  document.getElementById("stat-maintenance").textContent  = c.en_maintenance|| 0;
  document.getElementById("stat-hors-service").textContent = c.hors_service  || 0;

  // Mettre à jour les cartes KPI trajets
  document.getElementById("stat-total-trips").textContent  = t.total     || 0;
  document.getElementById("stat-en-cours").textContent     = t.en_cours  || 0;
  document.getElementById("stat-termines").textContent     = t.termines  || 0;
  document.getElementById("stat-ca").textContent           = formatFCFA(t.ca_total || 0);

  // Mettre à jour les compteurs dans la sidebar
  document.getElementById("nav-trucks-count").textContent = c.total || 0;
  document.getElementById("nav-trips-count").textContent  = t.total || 0;
}

// -------------------------------------------------------------------------
// GESTION DES CAMIONS (TRUCKS)
// -------------------------------------------------------------------------

/** Charge la liste des camions et met à jour le tableau. */
async function loadTrucks() {
  const { ok, data } = await apiCall("/trucks");
  if (!ok) { showToast("Impossible de charger les camions", "error"); return; }

  allTrucks = data.camions || [];

  // Mettre à jour les options du select dans le modal "Nouveau trajet"
  updateTruckSelectOptions();
  renderTrucks(allTrucks);
}

/**
 * Affiche les camions dans le tableau HTML.
 * @param {Array} trucks - La liste des camions à afficher
 */
function renderTrucks(trucks) {
  const tbody = document.getElementById("trucks-tbody");
  const empty = document.getElementById("trucks-empty");
  const count = document.getElementById("trucks-count");

  count.textContent = `${trucks.length} camion(s)`;

  if (trucks.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  // Construire les lignes du tableau
  // On utilise map() pour transformer chaque camion en HTML
  tbody.innerHTML = trucks.map(t => `
    <tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(t.nom_camion)}</div>
        ${t.annee_fabrication ? `<div class="td-light">${t.annee_fabrication}</div>` : ""}
      </td>
      <td><span class="td-immat">${escapeHtml(t.immatriculation)}</span></td>
      <td>
        <div>${escapeHtml(t.marque || "—")}</div>
        <div class="td-light">${escapeHtml(t.modele || "")}</div>
      </td>
      <td>
        <strong style="color:var(--or);">${t.capacite_tonnes} t</strong>
      </td>
      <td>
        <div>${escapeHtml(t.chauffeur_nom || "—")}</div>
        ${t.chauffeur_tel ? `<div class="td-light">${escapeHtml(t.chauffeur_tel)}</div>` : ""}
      </td>
      <td>${statusBadge(t.statut)}</td>
      <td>
        <div class="td-actions">
          <!-- Bouton modifier : appelle openTruckModal avec les données du camion -->
          <button class="btn btn-ghost btn-sm" onclick='openTruckModal(${JSON.stringify(t)})'>
            ✏️ Modifier
          </button>
          <!-- Bouton supprimer : demande confirmation -->
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('truck', ${t.id}, '${escapeHtml(t.nom_camion)}')">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

/**
 * Filtre les camions selon la recherche et le statut sélectionné.
 * Cette fonction est appelée en temps réel (oninput / onchange).
 */
function filterTrucks() {
  const recherche = document.getElementById("trucks-search").value.toLowerCase();
  const statut    = document.getElementById("trucks-filter-statut").value;

  const filtered = allTrucks.filter(t => {
    // Filtre texte : cherche dans nom, immatriculation, chauffeur
    const matchTexte = !recherche || [
      t.nom_camion, t.immatriculation, t.chauffeur_nom, t.marque
    ].some(v => v && v.toLowerCase().includes(recherche));

    // Filtre statut : si statut vide → tout, sinon filtrer
    const matchStatut = !statut || t.statut === statut;

    return matchTexte && matchStatut;
  });

  renderTrucks(filtered);
}

// ── MODAL CAMION ────────────────────────────────────────────────────────

/**
 * Ouvre le modal pour créer ou modifier un camion.
 * @param {object|null} truck - Si fourni, pré-remplit le formulaire (modification)
 *                             Si null/undefined, ouvre un formulaire vide (création)
 */
function openTruckModal(truck = null) {
  const isEdit = !!truck;

  // Mettre à jour le titre du modal
  document.getElementById("modal-truck-title").textContent =
    isEdit ? "✏️ Modifier le camion" : "🚛 Nouveau camion";

  // Réinitialiser le formulaire
  document.getElementById("form-truck").reset();
  document.getElementById("truck-alert").classList.add("hidden");

  // Si modification, pré-remplir les champs avec les données du camion
  if (isEdit) {
    document.getElementById("truck-id").value            = truck.id;
    document.getElementById("truck-nom").value           = truck.nom_camion || "";
    document.getElementById("truck-immat").value         = truck.immatriculation || "";
    document.getElementById("truck-marque").value        = truck.marque || "";
    document.getElementById("truck-modele").value        = truck.modele || "";
    document.getElementById("truck-capacite").value      = truck.capacite_tonnes || "";
    document.getElementById("truck-annee").value         = truck.annee_fabrication || "";
    document.getElementById("truck-statut").value        = truck.statut || "disponible";
    document.getElementById("truck-chauffeur-nom").value = truck.chauffeur_nom || "";
    document.getElementById("truck-chauffeur-tel").value = truck.chauffeur_tel || "";
  }

  openModal("modal-truck");
}

/** Envoie le formulaire camion au serveur (création ou modification). */
async function saveTruck() {
  const id = document.getElementById("truck-id").value;
  const isEdit = !!id;

  // Récupérer les valeurs du formulaire
  const nom       = document.getElementById("truck-nom").value.trim();
  const immat     = document.getElementById("truck-immat").value.trim().toUpperCase();
  const capacite  = document.getElementById("truck-capacite").value;

  // Validation simple côté frontend
  if (!nom)     return showTruckAlert("Le nom du camion est obligatoire.");
  if (!immat)   return showTruckAlert("L'immatriculation est obligatoire.");
  if (!capacite || parseFloat(capacite) <= 0)
                return showTruckAlert("La capacité doit être un nombre positif.");

  // Construire l'objet à envoyer
  const payload = {
    nom_camion:        nom,
    immatriculation:   immat,
    marque:            document.getElementById("truck-marque").value.trim(),
    modele:            document.getElementById("truck-modele").value.trim(),
    capacite_tonnes:   parseFloat(capacite),
    annee_fabrication: parseInt(document.getElementById("truck-annee").value) || null,
    statut:            document.getElementById("truck-statut").value,
    chauffeur_nom:     document.getElementById("truck-chauffeur-nom").value.trim(),
    chauffeur_tel:     document.getElementById("truck-chauffeur-tel").value.trim()
  };

  const btn = document.getElementById("btn-save-truck");
  setLoading(btn, true);

  // Appel API :
  //   - POST /api/trucks        si création (pas d'ID)
  //   - PUT  /api/trucks/:id    si modification (avec ID)
  const { ok, data } = isEdit
    ? await apiCall(`/trucks/${id}`, "PUT", payload)
    : await apiCall("/trucks", "POST", payload);

  setLoading(btn, false);

  if (ok) {
    closeModal("modal-truck");
    showToast(data.message, "success");
    // Recharger toutes les données pour mettre à jour les stats + tableau
    await loadAllData();
  } else {
    showTruckAlert(data.erreur || "Erreur lors de l'enregistrement.");
  }
}

function showTruckAlert(msg) {
  const el = document.getElementById("truck-alert");
  el.className = "alert alert-error";
  el.textContent = "⚠ " + msg;
  el.classList.remove("hidden");
}

// -------------------------------------------------------------------------
// GESTION DES TRAJETS (TRIPS)
// -------------------------------------------------------------------------

/** Charge la liste des trajets et met à jour le tableau. */
async function loadTrips() {
  const { ok, data } = await apiCall("/trips");
  if (!ok) { showToast("Impossible de charger les trajets", "error"); return; }

  allTrips = data.trajets || [];
  renderTrips(allTrips);
}

/**
 * Affiche les trajets dans le tableau HTML.
 */
function renderTrips(trips) {
  const tbody = document.getElementById("trips-tbody");
  const empty = document.getElementById("trips-empty");
  const count = document.getElementById("trips-count");

  count.textContent = `${trips.length} trajet(s)`;

  if (trips.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  tbody.innerHTML = trips.map(trip => `
    <tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(trip.nom_camion || "—")}</div>
        <div class="td-immat">${escapeHtml(trip.immatriculation || "")}</div>
      </td>
      <td>
        <div style="font-weight:500;">
          📍 ${escapeHtml(trip.depart)}
        </div>
        <div class="td-light" style="margin-top:3px;">
          🏁 ${escapeHtml(trip.destination)}
        </div>
        ${trip.distance_km ? `<div class="td-light">${trip.distance_km} km</div>` : ""}
      </td>
      <td>
        <div>${formatDate(trip.date_depart)}</div>
        ${trip.date_arrivee_prevue
          ? `<div class="td-light">Prévue: ${formatDate(trip.date_arrivee_prevue)}</div>`
          : ""}
      </td>
      <td>
        <div>${escapeHtml(trip.marchandise || "—")}</div>
        ${trip.poids_charge ? `<div class="td-light">${trip.poids_charge} t</div>` : ""}
      </td>
      <td>
        <div class="td-price">${formatFCFA(trip.montant_fcfa)}</div>
        ${trip.frais_carburant
          ? `<div class="td-light" style="font-size:12px;">Carb: ${formatFCFA(trip.frais_carburant)}</div>`
          : ""}
      </td>
      <td>${statusBadge(trip.statut)}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick='openTripModal(${JSON.stringify(trip)})'>
            ✏️ Modifier
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('trip', ${trip.id}, '${escapeHtml(trip.depart)} → ${escapeHtml(trip.destination)}')">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

/** Filtre les trajets selon la recherche et le statut. */
function filterTrips() {
  const recherche = document.getElementById("trips-search").value.toLowerCase();
  const statut    = document.getElementById("trips-filter-statut").value;

  const filtered = allTrips.filter(t => {
    const matchTexte = !recherche || [
      t.depart, t.destination, t.marchandise, t.nom_camion, t.immatriculation
    ].some(v => v && v.toLowerCase().includes(recherche));

    const matchStatut = !statut || t.statut === statut;
    return matchTexte && matchStatut;
  });

  renderTrips(filtered);
}

// ── MODAL TRAJET ─────────────────────────────────────────────────────────

/**
 * Remplit le select "Camion" du modal trajet avec les camions disponibles.
 */
function updateTruckSelectOptions() {
  const select = document.getElementById("trip-truck");
  if (!select) return;

  // Garder la première option par défaut
  select.innerHTML = `<option value="">— Sélectionnez un camion —</option>`;

  allTrucks.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    // Afficher : NOM — IMMATRICULATION (capacité)
    opt.textContent = `${t.nom_camion} — ${t.immatriculation} (${t.capacite_tonnes}t)`;
    select.appendChild(opt);
  });
}

/**
 * Ouvre le modal pour créer ou modifier un trajet.
 */
function openTripModal(trip = null) {
  const isEdit = !!trip;

  document.getElementById("modal-trip-title").textContent =
    isEdit ? "✏️ Modifier le trajet" : "🗺️ Nouveau trajet";

  document.getElementById("form-trip").reset();
  document.getElementById("trip-alert").classList.add("hidden");

  if (isEdit) {
    document.getElementById("trip-id").value              = trip.id;
    document.getElementById("trip-truck").value           = trip.truck_id || "";
    document.getElementById("trip-depart").value          = trip.depart || "";
    document.getElementById("trip-destination").value     = trip.destination || "";
    document.getElementById("trip-distance").value        = trip.distance_km || "";
    document.getElementById("trip-date-depart").value     = formatDateInput(trip.date_depart);
    document.getElementById("trip-date-arrivee").value    = formatDateInput(trip.date_arrivee_prevue);
    document.getElementById("trip-marchandise").value     = trip.marchandise || "";
    document.getElementById("trip-poids").value           = trip.poids_charge || "";
    document.getElementById("trip-montant").value         = trip.montant_fcfa || "";
    document.getElementById("trip-carburant").value       = trip.frais_carburant || "";
    document.getElementById("trip-statut").value          = trip.statut || "planifie";
    document.getElementById("trip-notes").value           = trip.notes || "";
  }

  openModal("modal-trip");
}

/** Envoie le formulaire trajet au serveur. */
async function saveTrip() {
  const id     = document.getElementById("trip-id").value;
  const isEdit = !!id;

  const truckId  = document.getElementById("trip-truck").value;
  const depart   = document.getElementById("trip-depart").value.trim();
  const dest     = document.getElementById("trip-destination").value.trim();
  const dateDep  = document.getElementById("trip-date-depart").value;

  if (!truckId) return showTripAlert("Veuillez sélectionner un camion.");
  if (!depart)  return showTripAlert("Le lieu de départ est obligatoire.");
  if (!dest)    return showTripAlert("La destination est obligatoire.");
  if (!dateDep) return showTripAlert("La date de départ est obligatoire.");

  const payload = {
    truck_id:           parseInt(truckId),
    depart,
    destination:        dest,
    distance_km:        parseFloat(document.getElementById("trip-distance").value) || null,
    date_depart:        dateDep,
    date_arrivee_prevue:document.getElementById("trip-date-arrivee").value || null,
    marchandise:        document.getElementById("trip-marchandise").value.trim(),
    poids_charge:       parseFloat(document.getElementById("trip-poids").value) || null,
    montant_fcfa:       parseFloat(document.getElementById("trip-montant").value) || 0,
    frais_carburant:    parseFloat(document.getElementById("trip-carburant").value) || 0,
    statut:             document.getElementById("trip-statut").value,
    notes:              document.getElementById("trip-notes").value.trim()
  };

  const btn = document.getElementById("btn-save-trip");
  setLoading(btn, true);

  const { ok, data } = isEdit
    ? await apiCall(`/trips/${id}`, "PUT", payload)
    : await apiCall("/trips", "POST", payload);

  setLoading(btn, false);

  if (ok) {
    closeModal("modal-trip");
    showToast(data.message, "success");
    await loadAllData();
  } else {
    showTripAlert(data.erreur || "Erreur lors de l'enregistrement.");
  }
}

function showTripAlert(msg) {
  const el = document.getElementById("trip-alert");
  el.className = "alert alert-error";
  el.textContent = "⚠ " + msg;
  el.classList.remove("hidden");
}

// -------------------------------------------------------------------------
// SUPPRESSION (AVEC CONFIRMATION)
// -------------------------------------------------------------------------

/**
 * Ouvre le modal de confirmation avant de supprimer.
 * @param {string} type - "truck" ou "trip"
 * @param {number} id   - L'ID de l'élément à supprimer
 * @param {string} nom  - Nom à afficher dans le message
 */
function confirmDelete(type, id, nom) {
  deleteTarget = { type, id };

  const labels = { truck: "camion", trip: "trajet" };
  document.getElementById("confirm-message").textContent =
    `Voulez-vous vraiment supprimer le ${labels[type] || type} "${nom}" ?\n` +
    `Cette action est irréversible.`;

  openModal("modal-confirm");
}

/** Exécute la suppression après confirmation. */
async function executeDelete() {
  const { type, id } = deleteTarget;
  if (!type || !id) return;

  const endpoint = type === "truck" ? `/trucks/${id}` : `/trips/${id}`;
  const btn = document.getElementById("btn-confirm-delete");
  setLoading(btn, true);

  const { ok, data } = await apiCall(endpoint, "DELETE");
  setLoading(btn, false);

  if (ok) {
    closeModal("modal-confirm");
    showToast(data.message, "success");
    await loadAllData();
  } else {
    showToast(data.erreur || "Erreur lors de la suppression.", "error");
  }
}

// -------------------------------------------------------------------------
// UTILITAIRES MODAUX
// -------------------------------------------------------------------------

/** Ouvre un modal en enlevant la classe "hidden". */
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  // Empêcher le scroll de la page derrière le modal
  document.body.style.overflow = "hidden";
}

/** Ferme un modal. */
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  document.body.style.overflow = "";
}

// Fermer le modal en cliquant sur l'overlay (fond sombre)
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    // Ne fermer que si on a cliqué directement sur l'overlay,
    // pas sur le contenu du modal
    if (e.target === overlay) {
      closeModal(overlay.id);
    }
  });
});

// Fermer les modals avec la touche Échap
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["modal-truck", "modal-trip", "modal-confirm"].forEach(id => {
      document.getElementById(id)?.classList.add("hidden");
    });
    document.body.style.overflow = "";
  }
});

// -------------------------------------------------------------------------
// SÉCURITÉ : ÉCHAPPEMENT HTML
// -------------------------------------------------------------------------
/**
 * Échappe les caractères spéciaux HTML pour éviter les injections XSS.
 * TOUJOURS utiliser cette fonction avant d'insérer du texte dans innerHTML.
 *
 * Ex: escapeHtml("<script>alert(1)</script>") → "&lt;script&gt;..."
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
