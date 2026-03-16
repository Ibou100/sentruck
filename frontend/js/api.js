/**
 * =========================================================================
 * SENTRUCK - api.js  (Client API & Utilitaires partagés)
 * =========================================================================
 * Ce fichier est inclus dans TOUTES les pages HTML.
 * Il contient :
 *   - La configuration de l'API (URL de base)
 *   - Les fonctions pour appeler le backend via fetch
 *   - La gestion du token JWT (stockage dans localStorage)
 *   - Les fonctions utilitaires (formatage, notifications…)
 * =========================================================================
 */

// -------------------------------------------------------------------------
// 1. CONFIGURATION
// -------------------------------------------------------------------------

/** URL du backend Flask. Changez si votre serveur tourne sur un autre port. */
const API_URL = "http://localhost:5000/api";

// -------------------------------------------------------------------------
// 2. GESTION DU TOKEN JWT (AUTHENTIFICATION)
// -------------------------------------------------------------------------
// Le token JWT est une chaîne de caractères que le serveur nous donne
// quand on se connecte. On le stocke dans localStorage pour le renvoyer
// dans chaque requête suivante, prouvant ainsi qu'on est connecté.

const Auth = {
  /**
   * Enregistre le token et les infos utilisateur après connexion.
   * @param {string} token  - Le token JWT reçu du serveur
   * @param {object} user   - L'objet utilisateur (id, nom, email…)
   */
  save(token, user) {
    localStorage.setItem("sentruck_token", token);
    localStorage.setItem("sentruck_user", JSON.stringify(user));
  },

  /** Retourne le token stocké, ou null si non connecté. */
  getToken() {
    return localStorage.getItem("sentruck_token");
  },

  /** Retourne l'objet utilisateur connecté, ou null. */
  getUser() {
    const raw = localStorage.getItem("sentruck_user");
    return raw ? JSON.parse(raw) : null;
  },

  /** Vérifie si un utilisateur est connecté. */
  isLoggedIn() {
    return !!this.getToken();
  },

  /** Déconnecte l'utilisateur en effaçant les données locales. */
  logout() {
    localStorage.removeItem("sentruck_token");
    localStorage.removeItem("sentruck_user");
    window.location.href = "auth.html";
  },

  /**
   * Redirige vers la page de connexion si pas connecté.
   * À appeler en haut des pages protégées (dashboard).
   */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = "auth.html";
      return false;
    }
    return true;
  },

  /**
   * Redirige vers le dashboard si déjà connecté.
   * À appeler sur la page de connexion/inscription.
   */
  redirectIfLoggedIn() {
    if (this.isLoggedIn()) {
      window.location.href = "dashboard.html";
    }
  }
};

// -------------------------------------------------------------------------
// 3. FONCTION PRINCIPALE FETCH (APPEL API)
// -------------------------------------------------------------------------

/**
 * Envoie une requête HTTP au backend et retourne le JSON.
 *
 * @param {string} endpoint   - Route API (ex: "/trucks", "/auth/connexion")
 * @param {string} method     - Méthode HTTP : GET, POST, PUT, DELETE
 * @param {object|null} body  - Données à envoyer (pour POST et PUT)
 * @param {boolean} auth      - true = ajouter le token JWT dans les headers
 * @returns {Promise<{ok: boolean, data: object}>}
 *
 * Exemples d'utilisation :
 *   const { ok, data } = await apiCall("/trucks", "GET");
 *   const { ok, data } = await apiCall("/trucks", "POST", { nom_camion: "..." });
 *   const { ok, data } = await apiCall("/trucks/5", "DELETE");
 */
async function apiCall(endpoint, method = "GET", body = null, auth = true) {
  // Construire les headers HTTP
  const headers = {
    "Content-Type": "application/json"
  };

  // Si auth=true, ajouter le token JWT dans le header Authorization
  // Format standard : "Authorization: Bearer <token>"
  if (auth) {
    const token = Auth.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  // Options de la requête fetch
  const options = { method, headers };

  // Ajouter le corps de la requête seulement pour POST et PUT
  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
    // JSON.stringify convertit l'objet JS en texte JSON
    // Ex: { nom: "Camion 1" } → '{"nom":"Camion 1"}'
  }

  try {
    // Envoyer la requête
    const response = await fetch(API_URL + endpoint, options);

    // Lire la réponse JSON
    const data = await response.json();

    // response.ok = true si le statut HTTP est entre 200-299
    return { ok: response.ok, data, status: response.status };

  } catch (error) {
    // Erreur réseau (serveur éteint, CORS, pas de connexion…)
    console.error(`[API] Erreur réseau sur ${method} ${endpoint}:`, error);
    return {
      ok: false,
      data: { erreur: "Impossible de joindre le serveur. Vérifiez que le backend est lancé." },
      status: 0
    };
  }
}

// -------------------------------------------------------------------------
// 4. FONCTIONS UTILITAIRES - FORMATAGE
// -------------------------------------------------------------------------

/**
 * Formate un nombre en FCFA (Franc CFA, monnaie sénégalaise).
 * Ex: 450000 → "450 000 FCFA"
 */
function formatFCFA(montant) {
  if (montant === null || montant === undefined) return "—";
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",       // Code ISO du Franc CFA Ouest-Africain
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(montant);
}

/**
 * Formate une date ISO en format lisible en français.
 * Ex: "2024-07-15T08:30:00" → "15 juil. 2024 à 08:30"
 */
function formatDate(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("fr-SN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

/**
 * Formate une date pour un input datetime-local (YYYY-MM-DDTHH:MM).
 * Utile pour pré-remplir les formulaires de modification.
 */
function formatDateInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  // Extraire chaque composant et les padder avec zéros si nécessaire
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0"); // Mois commence à 0
  const day   = String(d.getDate()).padStart(2, "0");
  const h     = String(d.getHours()).padStart(2, "0");
  const m     = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${h}:${m}`;
}

/**
 * Retourne le badge HTML pour un statut donné.
 * Ex: statut "disponible" → <span class="badge badge-disponible">Disponible</span>
 */
function statusBadge(statut) {
  // Dictionnaire : code statut → libellé français
  const labels = {
    disponible:  "Disponible",
    en_route:    "En route",
    maintenance: "Maintenance",
    hors_service:"Hors service",
    planifie:    "Planifié",
    en_cours:    "En cours",
    termine:     "Terminé",
    annule:      "Annulé"
  };
  const label = labels[statut] || statut;
  return `<span class="badge badge-${statut}">${label}</span>`;
}

/**
 * Extrait l'initiale d'un nom pour l'avatar.
 * Ex: "Mamadou Ndiaye" → "M"
 */
function getInitiale(nom) {
  return nom ? nom.charAt(0).toUpperCase() : "?";
}

// -------------------------------------------------------------------------
// 5. NOTIFICATIONS (TOASTS)
// -------------------------------------------------------------------------

/**
 * Affiche une notification flottante en bas à droite.
 * @param {string} message - Le texte à afficher
 * @param {string} type    - "success", "error" ou "info"
 * @param {number} duree   - Durée en millisecondes avant disparition
 */
function showToast(message, type = "success", duree = 3500) {
  // Créer le conteneur s'il n'existe pas encore
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  // Icônes selon le type
  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Supprimer automatiquement après la durée spécifiée
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duree);
}

// -------------------------------------------------------------------------
// 6. UTILITAIRES UI
// -------------------------------------------------------------------------

/**
 * Affiche un spinner dans un bouton et le désactive pendant un appel API.
 * @param {HTMLButtonElement} btn - Le bouton à transformer
 * @param {string} texteOriginal  - Texte à restaurer après
 */
function setLoading(btn, loading = true, texteOriginal = "") {
  if (loading) {
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Chargement...`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.original || texteOriginal;
    btn.disabled = false;
  }
}

/**
 * Affiche un message d'erreur sous un champ de formulaire.
 * @param {string} inputId - L'id de l'input
 * @param {string} message - Le message d'erreur
 */
function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.add("error");
  // Chercher ou créer l'élément d'erreur
  let errEl = input.parentElement.querySelector(".form-error");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "form-error";
    input.after(errEl);
  }
  errEl.textContent = "⚠ " + message;
}

/** Supprime toutes les erreurs de formulaire. */
function clearFormErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll(".form-input, .form-select, .form-textarea").forEach(el => {
    el.classList.remove("error");
  });
  form.querySelectorAll(".form-error").forEach(el => el.remove());
}

/**
 * Convertit un formulaire HTML en objet JavaScript.
 * Ex: <input name="nom" value="Camion 1"> → { nom: "Camion 1" }
 */
function formToObject(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const data = {};
  const formData = new FormData(form);
  formData.forEach((value, key) => {
    data[key] = value;
  });
  return data;
}
