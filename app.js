// ============================================
// PACIUCIU LEAGUE - logika aplikacji
// ============================================

const CFG = window.APP_CONFIG || {};
const EDIT_PASSWORD = CFG.EDIT_PASSWORD || "";
const LS_KEY = "pstragi-local-backup";
const UNLOCK_KEY = "pstragi-unlocked";
const THEME_KEY = "pstragi-theme";
const FIREBASE_COLLECTION = "flyfishing";
const FIREBASE_DOC = "season-data";
const IMGBB_API_KEY = CFG.imgbbApiKey && CFG.imgbbApiKey !== "WKLEJ_TU_IMGBB_KEY" ? CFG.imgbbApiKey : "";
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
const MAX_PHOTO_DIMENSION = 900;
const PHOTO_JPEG_QUALITY = 0.65;

const root = document.getElementById("root");

const state = {
  theme: getInitialTheme(),
  data: null,
  loading: true,
  saving: false,
  error: null,
  offlineMode: false,
  lastSyncTime: null,
  configOk:
    !!(CFG.firebaseConfig && CFG.firebaseConfig.apiKey && CFG.firebaseConfig.projectId) &&
    CFG.firebaseConfig.apiKey !== "WKLEJ_TU_API_KEY",
  unlocked: sessionStorage.getItem(UNLOCK_KEY) === "1",
  showPasswordModal: false,
  passwordError: "",
  pendingAction: null,
  selectedAngler: 0,
  lengthInput: "",
  showAddForm: false,
  editingTripDate: null,
  editingCatchId: null,
  speciesInput: "",
  customSpecies: false,
  customSpeciesInput: "",
  locationDraft: "",
  showSettings: false,
  showDateEdit: false,
  showResetConfirm: false,
  showEndSeasonConfirm: false,
  showRecalcConfirm: false,
  showManageTrips: false,
  expandedArchive: {},
  showImportConfirm: false,
  pendingImportData: null,
  dateDraft: todayISO(),
  expandedDates: {},
  editingPB: null,
  pendingPhoto: null,
  uploadingPhoto: false,
  uploadingGalleryPhoto: false,
  galleryVisibleCount: 9,
  lightboxUrl: null,
  confirmDeleteId: null,
  profileAnglerIdx: null,
  showAllAchievements: false,
};

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch (e) {}
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function saveLocalBackup(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, savedAt: new Date().toISOString() }));
  } catch (e) {
    // localStorage może być niedostępny (np. tryb prywatny) - ignorujemy, to tylko zabezpieczenie
  }
}

function loadLocalBackup() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function formatDatePL(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const DEFAULT_SPECIES = "pstrąg potokowy";
const SIZE_BONUS_TIERS = [
  { min: 50, mult: 1.5 },
  { min: 40, mult: 1.4 },
  { min: 35, mult: 1.3 },
  { min: 30, mult: 1.2 },
  { min: 25, mult: 1.1 },
];

// Mnożnik za rozmiar: im większa ryba, tym większa premia (progi co 5 cm od 25 cm, patrz SIZE_BONUS_TIERS).
function getSizeMultiplier(lengthCm) {
  const tier = SIZE_BONUS_TIERS.find((t) => lengthCm >= t.min);
  return tier ? tier.mult : 1;
}

// Mnożnik za gatunek: pstrąg potokowy to gatunek "domyślny" (bez premii), każdy inny wpisany +10%.
function getSpeciesMultiplier(species) {
  if (!species) return 1;
  return species.trim().toLowerCase() === DEFAULT_SPECIES ? 1 : 1.1;
}

// Mnożniki się mnożą razem (np. duża ryba innego gatunku: 1.3 × 1.1 = 1.43).
function computeMultiplier(lengthCm, species) {
  const sizeMult = getSizeMultiplier(lengthCm);
  const speciesMult = getSpeciesMultiplier(species);
  return { sizeMult, speciesMult, totalMult: Math.round(sizeMult * speciesMult * 100) / 100 };
}

function getPointsDivisor(lengthCm, species) {
  const normalizedSpecies = (species || DEFAULT_SPECIES).trim().toLowerCase();
  return normalizedSpecies === DEFAULT_SPECIES && lengthCm < 25 ? 20 : 10;
}

function computePoints(lengthCm, species) {
  const { totalMult } = computeMultiplier(lengthCm, species || "");
  return Math.round((lengthCm / getPointsDivisor(lengthCm, species)) * totalMult * 10) / 10;
}

// Aktualizuje podgląd punktów (z rozbiciem mnożnika) bez pełnego re-renderu formularza,
// żeby nie tracić fokusu w polach tekstowych przy każdym wciśnięciu klawisza.
function refreshPointsPreviewDOM() {
  const lengthNum = parseFloat(String(state.lengthInput).replace(",", "."));
  const hasValidLength = state.lengthInput && !isNaN(lengthNum) && lengthNum > 0;
  const mult = hasValidLength ? computeMultiplier(lengthNum, selectedSpecies()) : null;
  const pointsVal = hasValidLength ? computePoints(lengthNum, selectedSpecies()).toFixed(1) : "0.0";
  const noteHtml =
    mult && mult.totalMult > 1
      ? ` <span class="points-multiplier">(baza ${(lengthNum / getPointsDivisor(lengthNum, selectedSpecies())).toFixed(1)} × ${mult.totalMult.toFixed(2)})</span>`
      : hasValidLength && getPointsDivisor(lengthNum, selectedSpecies()) === 20
      ? ` <span class="points-multiplier">(${lengthNum} cm ÷ 20)</span>`
      : "";
  const el = document.querySelector(".points-preview");
  if (el) el.innerHTML = `Punkty: <b>${pointsVal}</b>${noteHtml}`;
}

function plFish(n) {
  if (n === 1) return "ryba";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "ryby";
  return "ryb";
}

function plTrip(n) {
  if (n === 1) return "wyjazd";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "wyjazdy";
  return "wyjazdów";
}

const COMMON_SPECIES = ["Pstrąg potokowy", "Pstrąg tęczowy", "Lipień", "Głowacica", "Troć"];
const RIVER_SPECIES = {
  bystrzyca: ["Pstrąg potokowy", "Okoń", "Kleń"],
  skora: ["Pstrąg potokowy", "Okoń", "Kleń", "Lipień"],
  kaczawa: ["Pstrąg potokowy", "Okoń", "Kleń", "Lipień", "Szczupak", "Jaź"],
};

function getWorkingDate() {
  return state.editingTripDate || state.data.activeSessionDate || state.data.currentSessionDate;
}

function resetCatchForm() {
  state.editingCatchId = null;
  state.lengthInput = "";
  state.speciesInput = "";
  state.customSpecies = false;
  state.customSpeciesInput = "";
  state.pendingPhoto = null;
  state.showAddForm = false;
}

function endTrip() {
  if (!state.data.activeSessionDate) return;
  resetCatchForm();
  state.editingTripDate = null;
  state.showDateEdit = false;
  const date = state.data.activeSessionDate;
  const tripBonusRules = { ...(state.data.tripBonusRules || {}) };
  if (tripBonusRules[date]) tripBonusRules[date] = { ...tripBonusRules[date], ended: true };
  persist({ ...state.data, activeSessionDate: null, tripBonusRules });
}

function editTrip(date) {
  if (!(state.data.trips || []).includes(date) && !state.data.catches.some(c => c.date === date)) return;
  resetCatchForm();
  state.editingTripDate = date;
  state.dateDraft = date;
  state.locationDraft = getSessionLocation(date);
  state.showDateEdit = !state.locationDraft;
  state.showSettings = false;
  render();
  root.scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCatch(id) {
  const entry = state.data.catches.find(c => c.id === id);
  if (!entry) return;
  editTrip(entry.date);
  state.editingCatchId = id;
  state.selectedAngler = entry.angler;
  state.lengthInput = String(entry.length);
  state.speciesInput = entry.species || "Pstrąg potokowy";
  state.customSpecies = !getSessionSpecies().includes(state.speciesInput);
  state.customSpeciesInput = state.customSpecies ? state.speciesInput : "";
  state.showAddForm = true;
  render();
}

function getSessionLocation(date = getWorkingDate()) {
  return (state.data.tripLocations || {})[date] ||
    ((state.data.catches || []).find(c => c.date === date && c.location) || {}).location || "";
}

function getSessionSpecies() {
  return RIVER_SPECIES[getSessionLocation().trim().toLocaleLowerCase("pl-PL")] || COMMON_SPECIES;
}

function selectedSpecies() {
  if (state.customSpecies) return state.customSpeciesInput.trim();
  const available = getSessionSpecies();
  return available.includes(state.speciesInput) ? state.speciesInput : available[0];
}

const COMMON_LOCATIONS = ["Bystrzyca", "Skora", "Kaczawa"];

function getLocationSuggestions() {
  const set = new Set(COMMON_LOCATIONS);
  Object.values(state.data.tripLocations || {}).forEach((location) => set.add(location));
  (state.data.catches || []).forEach((c) => {
    if (c.location) set.add(c.location);
  });
  return [...set];
}

// ---------- ochrona hasłem ----------
function guardedAction(fn) {
  return function (...args) {
    if (!EDIT_PASSWORD || state.unlocked) {
      fn(...args);
      return;
    }
    state.pendingAction = () => fn(...args);
    state.showPasswordModal = true;
    state.passwordError = "";
    render();
  };
}

function submitPassword() {
  const el = document.getElementById("password-input");
  const val = el ? el.value : "";
  if (val === EDIT_PASSWORD) {
    state.unlocked = true;
    try {
      sessionStorage.setItem(UNLOCK_KEY, "1");
    } catch (e) {}
    const action = state.pendingAction;
    state.pendingAction = null;
    state.showPasswordModal = false;
    state.passwordError = "";
    render();
    if (action) action();
  } else {
    state.passwordError = "Błędne hasło, spróbuj ponownie.";
    render();
    const input = document.getElementById("password-input");
    if (input) input.focus();
  }
}

function cancelPassword() {
  state.pendingAction = null;
  state.showPasswordModal = false;
  state.passwordError = "";
  render();
}

function defaultData() {
  return {
    anglerNames: ["Kubulek", "Piotrunia"],
    personalBest: [0, 0],
    seasonYear: new Date().getFullYear(),
    currentSessionDate: todayISO(),
    activeSessionDate: null,
    trips: [],
    tripLocations: {},
    tripBonusRules: {},
    galleryPhotos: [],
    archivedSeasons: [],
    catches: [],
  };
}

// Liczy podsumowanie (punkty, liczba ryb, pula, zwycięzca) dla dowolnego zestawu danych sezonu -
// używane zarówno dla bieżącego sezonu, jak i przy zamykaniu/przeglądaniu archiwum.
// Bonusy wynikają z aktualnych połowów, więc edycja nigdy nie dodaje ich drugi raz.
// Wyłącznie wyjazd z zapisaną wersją zasad może otrzymać bonusy.
function computeTripBonuses(catches, rule) {
  const result = [0, 1].map(() => ({ biggest: 0, most: 0, total: 0 }));
  if (!rule || rule.version !== 1 || !rule.ended || !catches.length) return result;
  const largest = Math.max(...catches.map(c => c.length));
  const counts = [0, 1].map(idx => catches.filter(c => c.angler === idx).length);
  const most = Math.max(...counts);
  result.forEach((bonus, idx) => {
    bonus.biggest = catches.some(c => c.angler === idx && c.length === largest) ? 3 : 0;
    bonus.most = counts[idx] === most && most > 0 ? 1.3 : 0;
    bonus.total = Math.round((bonus.biggest + bonus.most) * 10) / 10;
  });
  return result;
}

function computeBonusTotals(catches, tripBonusRules = {}) {
  const totals = [0, 0];
  Object.entries(tripBonusRules).forEach(([date, rule]) => {
    computeTripBonuses(catches.filter(c => c.date === date), rule).forEach((bonus, idx) => {
      totals[idx] = Math.round((totals[idx] + bonus.total) * 10) / 10;
    });
  });
  return totals;
}

function tripBonusHtml(date) {
  const rule = (state.data.tripBonusRules || {})[date];
  if (!rule || rule.version !== 1) return "";
  if (!rule.ended) return `<p class="trip-bonus-note">Po zakończeniu: +3 pkt za największą rybę i +1,3 pkt za najwięcej ryb. Remis: bonus dla obu.</p>`;
  const bonuses = computeTripBonuses(state.data.catches.filter(c => c.date === date), rule);
  return `<div class="trip-bonus-note"><strong>Bonusy za wyjazd</strong>${bonuses.map((b, idx) => `<p>${esc(state.data.anglerNames[idx])}: +${b.total.toFixed(1)} pkt (największa ryba: +${b.biggest}, najwięcej ryb: +${b.most})</p>`).join("")}</div>`;
}

function computeSeasonTotals(anglerNames, catches, trips, tripBonusRules = {}) {
  const bonusTotals = computeBonusTotals(catches, tripBonusRules);
  const perAngler = [0, 1].map((idx) => {
    const list = catches.filter((c) => c.angler === idx);
    const totalPoints = Math.round((list.reduce((s, c) => s + c.points, 0) + bonusTotals[idx]) * 10) / 10;
    return { count: list.length, totalPoints, bonusPoints: bonusTotals[idx] };
  });
  const tripsCount = Array.isArray(trips) ? trips.length : 0;
  const potAmount = tripsCount * 10;
  const winner =
    perAngler[0].totalPoints === perAngler[1].totalPoints
      ? null
      : perAngler[0].totalPoints > perAngler[1].totalPoints
      ? 0
      : 1;
  return { perAngler, tripsCount, potAmount, winner };
}

// Statystyki "na całe życie" zawodnika - łączy bieżący sezon ze wszystkimi zarchiwizowanymi,
// niezależnie ile razy appka przeszła przez "Zakończ sezon".
function computeLifetimeStats(anglerIdx) {
  const d = state.data;
  const archivedSeasons = d.archivedSeasons || [];
  const archivedCatches = archivedSeasons.flatMap((s) => s.catches || []);
  const allCatches = [...(d.catches || []), ...archivedCatches];
  const list = allCatches.filter((c) => c.angler === anglerIdx);
  const bonusPoints = [d, ...archivedSeasons].reduce((sum, season) =>
    sum + computeBonusTotals(season.catches || [], season.tripBonusRules || {})[anglerIdx], 0);
  const totalPoints = Math.round((list.reduce((s, c) => s + c.points, 0) + bonusPoints) * 10) / 10;
  const best = list.reduce((m, c) => (!m || c.length > m.length ? c : m), null);
  const seasonsPlayed = archivedSeasons.length + 1; // +1 za bieżący sezon

  const speciesSet = new Set(list.filter((c) => c.species).map((c) => c.species.trim().toLowerCase()));
  const locationsSet = new Set(list.filter((c) => c.location).map((c) => c.location.trim().toLowerCase()));
  const photoCount = list.filter((c) => c.photoUrl).length;

  const archivedTripsCount = archivedSeasons.reduce((sum, s) => sum + (s.trips ? s.trips.length : 0), 0);
  const tripsLifetime = (d.trips ? d.trips.length : 0) + archivedTripsCount;

  return {
    count: list.length,
    totalPoints,
    best,
    seasonsPlayed,
    speciesCount: speciesSet.size,
    locationsCount: locationsSet.size,
    photoCount,
    tripsLifetime,
  };
}

// Lista osiągnięć - progi i nazwy można łatwo zmienić/rozszerzyć w jednym miejscu.
// "metric" wskazuje na pole z computeLifetimeStats (albo "bestLength" dla długości rekordu).
const ACHIEVEMENTS = [
  // Liczba złowionych ryb
  { id: "fish-1", icon: "🎣", name: "Pierwsza ryba", metric: "count", target: 1 },
  { id: "fish-10", icon: "🐟", name: "10 ryb", metric: "count", target: 10 },
  { id: "fish-50", icon: "🐠", name: "50 ryb", metric: "count", target: 50 },
  { id: "fish-100", icon: "🐡", name: "100 ryb", metric: "count", target: 100 },
  { id: "fish-250", icon: "🦈", name: "250 ryb", metric: "count", target: 250 },
  { id: "fish-500", icon: "🐋", name: "500 ryb", metric: "count", target: 500 },
  { id: "fish-1000", icon: "👑", name: "1000 ryb", metric: "count", target: 1000 },
  // Rozmiar rekordowej ryby
  { id: "size-25", icon: "📏", name: "Ryba 25 cm+", metric: "bestLength", target: 25 },
  { id: "size-30", icon: "🎯", name: "Ryba 30 cm+", metric: "bestLength", target: 30 },
  { id: "size-35", icon: "🏆", name: "Ryba 35 cm+", metric: "bestLength", target: 35 },
  { id: "size-40", icon: "💪", name: "Ryba 40 cm+", metric: "bestLength", target: 40 },
  { id: "size-45", icon: "🔱", name: "Ryba 45 cm+", metric: "bestLength", target: 45 },
  { id: "size-50", icon: "👹", name: "Potwór (50 cm+)", metric: "bestLength", target: 50 },
  // Punkty łącznie
  { id: "points-50", icon: "⭐", name: "50 punktów", metric: "totalPoints", target: 50 },
  { id: "points-100", icon: "💯", name: "100 punktów", metric: "totalPoints", target: 100 },
  { id: "points-250", icon: "🌟", name: "250 punktów", metric: "totalPoints", target: 250 },
  { id: "points-500", icon: "✨", name: "500 punktów", metric: "totalPoints", target: 500 },
  // Różnorodność gatunków
  { id: "species-3", icon: "🐾", name: "3 gatunki", metric: "speciesCount", target: 3 },
  { id: "species-5", icon: "🌈", name: "5 gatunków", metric: "speciesCount", target: 5 },
  // Różnorodność miejsc
  { id: "locations-3", icon: "🗺️", name: "3 rzeki", metric: "locationsCount", target: 3 },
  { id: "locations-5", icon: "🧭", name: "5 rzek", metric: "locationsCount", target: 5 },
  // Wyjazdy
  { id: "trips-10", icon: "👢", name: "10 wyjazdów", metric: "tripsLifetime", target: 10 },
  { id: "trips-25", icon: "🏕️", name: "25 wyjazdów", metric: "tripsLifetime", target: 25 },
  { id: "trips-50", icon: "⛺", name: "50 wyjazdów", metric: "tripsLifetime", target: 50 },
  // Sezony
  { id: "veteran", icon: "🎖️", name: "Weteran (2 sezony)", metric: "seasonsPlayed", target: 2 },
  { id: "legend", icon: "🏵️", name: "Legenda (5 sezonów)", metric: "seasonsPlayed", target: 5 },
  // Zdjęcia
  { id: "photos-10", icon: "📸", name: "10 zdjęć w galerii", metric: "photoCount", target: 10 },
];

function computeAchievements(anglerIdx) {
  const lt = computeLifetimeStats(anglerIdx);
  const values = {
    count: lt.count,
    totalPoints: lt.totalPoints,
    bestLength: lt.best ? lt.best.length : 0,
    seasonsPlayed: lt.seasonsPlayed,
    speciesCount: lt.speciesCount,
    locationsCount: lt.locationsCount,
    tripsLifetime: lt.tripsLifetime,
    photoCount: lt.photoCount,
  };
  return ACHIEVEMENTS.map((a) => {
    const current = values[a.metric] || 0;
    const unlocked = current >= a.target;
    return { ...a, current, unlocked };
  });
}

// ---------- Firebase Firestore ----------
let db = null;

function initFirebaseApp() {
  if (!window.firebase || !CFG.firebaseConfig) return null;
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(CFG.firebaseConfig);
    }
    return firebase.firestore();
  } catch (e) {
    return null;
  }
}

function docRef() {
  return db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC);
}

async function fetchRemote() {
  const snap = await docRef().get();
  return snap.exists ? snap.data() : null;
}

async function saveRemote(payload) {
  await docRef().set(payload);
}

async function loadInitial() {
  if (!state.configOk) {
    state.loading = false;
    render();
    return;
  }
  db = initFirebaseApp();
  if (!db) {
    state.loading = false;
    const backup = loadLocalBackup();
    state.data = backup && backup.data ? { ...defaultData(), ...backup.data } : defaultData();
    state.error = "Nie udało się połączyć z Firebase. Sprawdź konfigurację w config.js.";
    render();
    return;
  }
  try {
    const record = await fetchRemote();
    if (record && record.anglerNames) {
      state.data = { ...defaultData(), ...record };
    } else {
      state.data = defaultData();
      await saveRemote(state.data);
    }
    state.offlineMode = false;
    state.lastSyncTime = new Date();
    saveLocalBackup(state.data);
  } catch (e) {
    // Firebase nie odpowiada - próbujemy lokalnej kopii zapasowej z tego telefonu
    const backup = loadLocalBackup();
    if (backup && backup.data) {
      state.data = { ...defaultData(), ...backup.data };
      state.offlineMode = true;
      state.lastSyncTime = backup.savedAt ? new Date(backup.savedAt) : null;
      state.error =
        "Nie można połączyć się z bazą danych online. Pokazuję ostatnią zapisaną wersję z tego telefonu (może nie zawierać najnowszych ryb kolegi).";
    } else {
      state.data = defaultData();
      state.error = "Nie udało się połączyć z bazą danych i brak lokalnej kopii zapasowej na tym telefonie.";
    }
  } finally {
    state.loading = false;
    render();
    startRealtimeSync();
  }
}

// Firestore synchronizuje się na żywo - bez odpytywania co kilkanaście sekund.
// Każda zmiana (u Ciebie lub kolegi) trafia do obu telefonów niemal natychmiast.
function startRealtimeSync() {
  if (!db) return;
  docRef().onSnapshot(
    (snap) => {
      state.offlineMode = false;
      state.lastSyncTime = new Date();
      if (snap.exists) {
        const record = snap.data();
        if (JSON.stringify(record) !== JSON.stringify(state.data)) {
          state.data = { ...defaultData(), ...record };
          saveLocalBackup(state.data);
          state.error = null;
          render();
        }
      }
    },
    () => {
      state.offlineMode = true;
      render();
    }
  );
}

async function persist(next) {
  state.data = next;
  state.saving = true;
  state.error = null;
  saveLocalBackup(next); // zapisujemy lokalnie natychmiast, niezależnie od tego czy uda się wysłać online
  render();

  // Firestore samo w tle dopina wysyłkę gdy wróci internet, więc nie odrzucamy tej obietnicy -
  // dajemy jej dokończyć się asynchronicznie, a tylko sygnalizujemy użytkownikowi jeśli trwa zbyt długo.
  const savePromise = saveRemote(next)
    .then(() => {
      state.offlineMode = false;
      state.lastSyncTime = new Date();
      state.error = null;
      render();
    })
    .catch(() => {
      state.offlineMode = true;
      render();
    });

  const timedOut = await Promise.race([
    savePromise.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), 8000)),
  ]);

  if (timedOut) {
    state.offlineMode = true;
    state.error =
      "Zapisano lokalnie na tym telefonie. Wysyłanie do wspólnej bazy trwa dłużej niż zwykle (być może brak internetu) - dokończy się automatycznie w tle.";
  }
  state.saving = false;
  render();
}

// ---------- akcje ----------
function startNewSession() {
  const location = state.locationDraft.trim();
  const date = state.editingTripDate || state.dateDraft;
  if (!date || !location) return;
  const trips = Array.isArray(state.data.trips) ? [...state.data.trips] : [];
  const tripBonusRules = { ...(state.data.tripBonusRules || {}) };
  const isNewTrip = !state.editingTripDate && !trips.includes(date) &&
    !state.data.catches.some(c => c.date === date) && !tripBonusRules[date];
  if (isNewTrip) tripBonusRules[date] = { version: 1, ended: false };
  if (!state.editingTripDate && !trips.includes(date)) trips.push(date);
  state.showDateEdit = false;
  resetCatchForm();
  const session = state.editingTripDate ? {} : { currentSessionDate: date, activeSessionDate: date };
  persist({ ...state.data, ...session, trips, tripBonusRules,
    catches: state.data.catches.map(c => c.date === date ? { ...c, location } : c),
    tripLocations: { ...(state.data.tripLocations || {}), [date]: location } });
}

function removeTrip(date) {
  const trips = (state.data.trips || []).filter((t) => t !== date);
  const tripLocations = { ...(state.data.tripLocations || {}) };
  delete tripLocations[date];
  persist({ ...state.data, trips, tripLocations, activeSessionDate: state.data.activeSessionDate === date ? null : state.data.activeSessionDate });
}

// ---------- zdjęcia ryb ----------
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Nie udało się wczytać obrazu"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_PHOTO_DIMENSION) {
          height = Math.round((height * MAX_PHOTO_DIMENSION) / width);
          width = MAX_PHOTO_DIMENSION;
        } else if (height > MAX_PHOTO_DIMENSION) {
          width = Math.round((width * MAX_PHOTO_DIMENSION) / height);
          height = MAX_PHOTO_DIMENSION;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoSelect(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    state.error = "Wybrany plik nie jest zdjęciem.";
    render();
    return;
  }
  try {
    const compressed = await compressImage(file);
    state.pendingPhoto = compressed;
    render();
  } catch (e) {
    state.error = "Nie udało się przetworzyć zdjęcia. Spróbuj innego pliku.";
    render();
  }
}

function removePendingPhoto() {
  state.pendingPhoto = null;
  render();
}

async function uploadToImgbb(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const form = new URLSearchParams();
  form.append("image", base64);
  const res = await fetch(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new Error("Błąd wysyłania zdjęcia (" + res.status + ")");
  const json = await res.json();
  if (!json.success) throw new Error("imgbb zwróciło błąd");
  // imgbb generuje osobną, małą miniaturkę - używamy jej w siatkach/listach,
  // a pełny obraz dopiero po kliknięciu (mniej danych do pobrania przy dużej liczbie zdjęć)
  return {
    url: json.data.url,
    thumbUrl: (json.data.thumb && json.data.thumb.url) || (json.data.medium && json.data.medium.url) || json.data.url,
  };
}

// ---------- galeria zdjęć znad wody ----------
async function handleGalleryPhotoSelect(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    state.error = "Wybrany plik nie jest zdjęciem.";
    render();
    return;
  }
  if (!IMGBB_API_KEY) {
    state.error = "Zdjęcia w galerii wymagają klucza imgbb w config.js (patrz README).";
    render();
    return;
  }
  try {
    const compressed = await compressImage(file);
    state.uploadingGalleryPhoto = true;
    render();

    let photoUrl = null;
    let photoThumbUrl = null;
    try {
      const uploaded = await uploadToImgbb(compressed);
      photoUrl = uploaded.url;
      photoThumbUrl = uploaded.thumbUrl;
    } catch (e) {
      state.error = "Nie udało się wysłać zdjęcia do galerii.";
    }

    state.uploadingGalleryPhoto = false;

    if (photoUrl) {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: photoUrl,
        thumbUrl: photoThumbUrl,
        date: todayISO(),
        time: new Date().toISOString(),
      };
      persist({ ...state.data, galleryPhotos: [...(state.data.galleryPhotos || []), entry] });
    } else {
      render();
    }
  } catch (e) {
    state.uploadingGalleryPhoto = false;
    state.error = "Nie udało się przetworzyć zdjęcia. Spróbuj innego pliku.";
    render();
  }
}

function deleteGalleryPhoto(id) {
  persist({ ...state.data, galleryPhotos: (state.data.galleryPhotos || []).filter((p) => p.id !== id) });
}

async function addCatch() {
  const len = parseFloat(String(state.lengthInput).replace(",", "."));
  if (!len || len <= 0 || len > 200) return;
  if (!state.editingTripDate && !state.data.activeSessionDate) return;
  const location = getSessionLocation();
  if (!location) {
    state.showDateEdit = true;
    state.dateDraft = getWorkingDate();
    render();
    return;
  }
  const species = selectedSpecies();
  if (!species) {
    const input = document.getElementById("custom-species-input");
    if (input) {
      input.setCustomValidity("Wpisz gatunek ryby.");
      input.reportValidity();
    }
    return;
  }
  const date = getWorkingDate();
  const existing = state.editingCatchId ? state.data.catches.find(c => c.id === state.editingCatchId) : null;
  if (state.editingCatchId && !existing) return;
  const angler = state.selectedAngler;

  let photoUrl = existing ? existing.photoUrl : null;
  let photoThumbUrl = existing ? existing.photoThumbUrl : null;
  if (state.pendingPhoto) {
    if (IMGBB_API_KEY) {
      state.uploadingPhoto = true;
      render();
      try {
        const uploaded = await uploadToImgbb(state.pendingPhoto);
        photoUrl = uploaded.url;
        photoThumbUrl = uploaded.thumbUrl;
      } catch (e) {
        state.error = "Nie udało się wysłać zdjęcia - ryba zostanie zapisana bez niego.";
      }
      state.uploadingPhoto = false;
    } else {
      // Brak klucza imgbb w config.js - NIE wrzucamy zdjęcia do wspólnej bazy jako base64
      // (szybko zapchałoby limit 1MB na dokument Firestore). Ryba zapisze się bez zdjęcia.
      state.error = "Zdjęcia wymagają klucza imgbb w config.js - ryba zapisana bez zdjęcia (patrz README).";
    }
  }

  const mult = computeMultiplier(len, species);
  const entry = {
    id: existing ? existing.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    angler,
    length: len,
    points: computePoints(len, species),
    multiplier: mult.totalMult,
    time: existing ? existing.time : new Date().toISOString(),
    photoUrl,
    photoThumbUrl,
    species,
    location,
  };
  const catches = existing
    ? state.data.catches.map(c => c.id === existing.id ? { ...c, ...entry } : c)
    : [...state.data.catches, entry];
  resetCatchForm();
  persist({ ...state.data, catches });
}

function deleteCatch(id) {
  persist({ ...state.data, catches: state.data.catches.filter((c) => c.id !== id) });
  state.confirmDeleteId = null;
}

function startEditPB(idx) {
  state.editingPB = idx;
  render();
}

function cancelEditPB() {
  state.editingPB = null;
  render();
}

function savePB(idx) {
  const el = document.getElementById("pb-edit-input");
  const val = parseFloat(String(el.value).replace(",", "."));
  if (!val || val <= 0 || val > 200) {
    state.editingPB = null;
    render();
    return;
  }
  const pb = [...(state.data.personalBest || [39, 39])];
  pb[idx] = Math.round(val * 10) / 10;
  persist({ ...state.data, personalBest: pb });
  state.editingPB = null;
}

function resetAllData() {
  persist(defaultData());
  state.showResetConfirm = false;
  state.showSettings = false;
}

function askEndSeason() {
  state.showEndSeasonConfirm = true;
  render();
}

function cancelEndSeason() {
  state.showEndSeasonConfirm = false;
  render();
}

// Liczy ile ryb (bieżący sezon + archiwum) jeszcze nie ma zapisanego mnożnika -
// czyli zostały dodane zanim wprowadziliśmy system premii za rozmiar/gatunek.
function countCatchesWithoutMultiplier() {
  const d = state.data;
  const current = (d.catches || []).filter((c) => c.multiplier === undefined).length;
  const archived = (d.archivedSeasons || []).reduce(
    (sum, s) => sum + (s.catches || []).filter((c) => c.multiplier === undefined).length,
    0
  );
  return current + archived;
}

function askRecalculatePoints() {
  state.showRecalcConfirm = true;
  render();
}

function cancelRecalculatePoints() {
  state.showRecalcConfirm = false;
  render();
}

function recalculatePoints() {
  const recalc = (c) => {
    if (c.multiplier !== undefined) return c; // już przeliczona - nie ruszamy
    const mult = computeMultiplier(c.length, c.species || "");
    return { ...c, points: computePoints(c.length, c.species || ""), multiplier: mult.totalMult };
  };
  const d = state.data;
  const nextData = {
    ...d,
    catches: (d.catches || []).map(recalc),
    archivedSeasons: (d.archivedSeasons || []).map((s) => ({ ...s, catches: (s.catches || []).map(recalc) })),
  };
  persist(nextData);
  state.showRecalcConfirm = false;
  state.showSettings = false;
}

function endSeason() {
  const d = state.data;
  const archived = {
    year: d.seasonYear || new Date().getFullYear(),
    endedAt: new Date().toISOString(),
    anglerNames: d.anglerNames,
    trips: d.trips || [],
    tripLocations: d.tripLocations || {},
    tripBonusRules: d.tripBonusRules || {},
    catches: d.catches,
  };
  const nextData = {
    ...d,
    seasonYear: (d.seasonYear || new Date().getFullYear()) + 1,
    currentSessionDate: todayISO(),
    activeSessionDate: null,
    trips: [],
    tripLocations: {},
    tripBonusRules: {},
    catches: [],
    archivedSeasons: [...(d.archivedSeasons || []), archived],
    // personalBest i anglerNames NIE resetujemy - to rekordy życiowe, niezależne od sezonu
  };
  persist(nextData);
  state.showEndSeasonConfirm = false;
  state.showSettings = false;
  state.expandedArchive = {};
}

function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "PACIUCIU LEAGUE",
    data: state.data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = todayISO();
  a.href = url;
  a.download = `pstragi-kopia-zapasowa-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImportFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const importedData = parsed.data && parsed.data.anglerNames ? parsed.data : parsed;
      if (!importedData || !Array.isArray(importedData.catches)) {
        throw new Error("bad format");
      }
      state.pendingImportData = { ...defaultData(), ...importedData };
      state.showImportConfirm = true;
      render();
    } catch (err) {
      state.error = "Nie udało się odczytać tego pliku - upewnij się, że to kopia zapasowa wyeksportowana z tej aplikacji.";
      render();
    }
  };
  reader.readAsText(file);
  input.value = "";
}

function confirmImport() {
  if (state.pendingImportData) {
    persist(state.pendingImportData);
  }
  state.pendingImportData = null;
  state.showImportConfirm = false;
  state.showSettings = false;
}

function cancelImport() {
  state.pendingImportData = null;
  state.showImportConfirm = false;
  render();
}

// ---------- stats ----------
function computeStats() {
  const d = state.data;
  const bonusTotals = computeBonusTotals(d.catches, d.tripBonusRules || {});
  const perAngler = [0, 1].map((idx) => {
    const list = d.catches.filter((c) => c.angler === idx);
    const totalPoints = Math.round((list.reduce((s, c) => s + c.points, 0) + bonusTotals[idx]) * 10) / 10;
    const best = list.reduce((m, c) => (c.length > m ? c.length : m), 0);
    const bestCatch = list.reduce((m, c) => (!m || c.length > m.length ? c : m), null);
    return { count: list.length, totalPoints, bonusPoints: bonusTotals[idx], best, bestCatch };
  });
  const todays = d.catches.filter((c) => c.date === getWorkingDate());
  const byDate = {};
  d.catches.forEach((c) => {
    byDate[c.date] = byDate[c.date] || [];
    byDate[c.date].push(c);
  });
  const dates = [...new Set([...Object.keys(byDate), ...(d.trips || [])])].sort((a, b) => (a < b ? 1 : -1));
  const tripsCount = Array.isArray(d.trips) ? d.trips.length : 0;
  const potAmount = tripsCount * 10;
  const biggestCatch = d.catches.reduce((m, c) => (!m || c.length > m.length ? c : m), null);
  return { perAngler, todays, byDate, dates, tripsCount, potAmount, biggestCatch };
}

// ---------- render helpers ----------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function catchRowHtml(c, name, isLast, readonly) {
  const extraBits = [c.species, c.location].filter(Boolean).join(" · ");
  const confirming = !readonly && state.confirmDeleteId === c.id;

  if (confirming) {
    return `
    <div class="catch-row confirm-row" style="${isLast ? "border-bottom:none;" : ""}">
      <p class="confirm-text">Usunąć ${c.length} cm (${esc(name)})?</p>
      <div class="confirm-actions">
        <button class="confirm-btn-yes" onclick="App.deleteCatch('${c.id}')">Usuń</button>
        <button class="confirm-btn-no" onclick="App.cancelDeleteCatch()">Anuluj</button>
      </div>
    </div>`;
  }

  return `
    <div class="catch-row" style="${isLast ? "border-bottom:none;" : ""}">
      <div class="catch-row-main">
        ${
          c.photoUrl
            ? `<img src="${c.photoThumbUrl || c.photoUrl}" loading="lazy" class="catch-thumb" onclick="App.openLightbox('${c.photoUrl}')" />`
            : ""
        }
        <div>
          <p class="catch-name">${esc(name)}</p>
          <p class="catch-meta">${c.length} cm · ${c.points.toFixed(1)} pkt${
            c.multiplier && c.multiplier > 1 ? ` <span class="catch-mult">×${c.multiplier.toFixed(2)}</span>` : ""
          }</p>
          ${extraBits ? `<p class="catch-extra">${esc(extraBits)}</p>` : ""}
        </div>
      </div>
      ${readonly ? "" : `<button class="link-btn" onclick="App.editCatch('${c.id}')">Edytuj</button><button class="del-btn" onclick="App.askDeleteCatch('${c.id}')" aria-label="Usuń">✕</button>`}
    </div>`;
}

function render() {
  document.body.setAttribute("data-theme", state.theme);
  if (!state.configOk) {
    root.innerHTML = `
      <div class="config-warning" style="margin-top:40px;">
        <p class="font-display" style="font-size:18px;margin-top:0;">Brakuje konfiguracji</p>
        <p>Otwórz plik <code>config.js</code> i wklej tam dane <code>firebaseConfig</code> z konsoli Firebase.
        Pełna instrukcja jest w pliku <code>README.md</code>.</p>
      </div>`;
    return;
  }

  if (state.loading) {
    root.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
    return;
  }

  const d = state.data;
  const stats = computeStats();
  const leader =
    stats.perAngler[0].totalPoints === stats.perAngler[1].totalPoints
      ? null
      : stats.perAngler[0].totalPoints > stats.perAngler[1].totalPoints
      ? 0
      : 1;

  const lengthNum = parseFloat(String(state.lengthInput).replace(",", "."));
  const hasValidLength = state.lengthInput && !isNaN(lengthNum) && lengthNum > 0;
  const previewMultiplier = hasValidLength ? computeMultiplier(lengthNum, selectedSpecies()) : null;
  const pointsPreview = hasValidLength ? computePoints(lengthNum, selectedSpecies()).toFixed(1) : "0.0";
  const multiplierNote =
    previewMultiplier && previewMultiplier.totalMult > 1
      ? ` <span class="points-multiplier">(baza ${(lengthNum / getPointsDivisor(lengthNum, selectedSpecies())).toFixed(1)} × ${previewMultiplier.totalMult.toFixed(2)})</span>`
      : hasValidLength && getPointsDivisor(lengthNum, selectedSpecies()) === 20
      ? ` <span class="points-multiplier">(${lengthNum} cm ÷ 20)</span>`
      : "";

  root.innerHTML = `
    <div class="header">
      ${d.activeSessionDate ? `<button class="btn-copper end-trip-btn" onclick="App.endTrip()" ${state.saving || state.uploadingPhoto ? "disabled" : ""}>Zakończ wyjazd · ${formatDatePL(d.activeSessionDate)}</button>` : ""}
      ${state.editingTripDate ? `<div class="trip-edit-banner">Edytujesz wyjazd: ${formatDatePL(state.editingTripDate)} <button class="btn-copper" onclick="App.closeTripEdit()">Gotowe — wróć</button></div>` : ""}
      <div class="header-top">
        <div>
          <p class="eyebrow">Sezon ${d.seasonYear || new Date().getFullYear()} · Pstrągi</p>
          <h1 class="h1 font-display">PACIUCIU LEAGUE</h1>
        </div>
        <div class="header-actions">
          <button class="icon-btn" onclick="App.toggleTheme()" aria-label="Zmień motyw">${state.theme === "dark" ? sunSvg() : moonSvg()}</button>
          <button class="icon-btn" onclick="App.toggleSettings()" aria-label="Ustawienia">${gearSvg()}</button>
        </div>
      </div>
      <div class="session-bar">
        <span>${calendarSvg()} ${state.editingTripDate ? "Edycja wyjazdu" : d.activeSessionDate ? "Dzień połowów" : "Brak aktywnego wyjazdu"}${state.editingTripDate || d.activeSessionDate ? ": " + formatDatePL(getWorkingDate()) : ""}${state.editingTripDate || d.activeSessionDate ? (getSessionLocation() ? " · " + esc(getSessionLocation()) : " · wybierz rzekę") : ""}</span>
        <button class="link-btn" onclick="App.toggleDateEdit()">${state.editingTripDate || d.activeSessionDate ? "zmień rzekę" : "Dodaj wyjazd"}</button>
      </div>
      ${
        state.showDateEdit
          ? `<div class="date-edit">
              <input type="date" id="date-draft-input" ${state.editingTripDate || d.activeSessionDate ? "disabled" : ""} value="${state.dateDraft}" onchange="App.setTripDate(this.value)" aria-label="Dzień połowów" />
              <input type="text" id="location-draft-input" list="trip-location-suggestions" value="${esc(state.locationDraft)}" placeholder="Wybierz lub wpisz rzekę" aria-label="Rzeka" />
              <datalist id="trip-location-suggestions">
                ${getLocationSuggestions().map((l) => `<option value="${esc(l)}"></option>`).join("")}
              </datalist>
              <button class="btn-copper" onclick="App.confirmDate()">Ustaw</button>
            </div>`
          : ""
      }
    </div>
    <div class="ripple"></div>

    ${state.error ? `<div class="error-box">${esc(state.error)}</div>` : ""}
    <div class="sync-note">
      ${
        state.saving
          ? "Zapisywanie…"
          : state.offlineMode
          ? `⚠️ Tryb offline — dane zapisane lokalnie na tym telefonie, spróbuję zsynchronizować automatycznie${
              state.lastSyncTime ? " (ostatnia synchronizacja: " + state.lastSyncTime.toLocaleString("pl-PL") + ")" : ""
            }`
          : "Wyniki są wspólne — synchronizują się automatycznie"
      }
    </div>

    <div class="container">
      ${state.editingTripDate || d.activeSessionDate ? tripBonusHtml(getWorkingDate()) : ""}
      <div class="pot-card">
        <div>
          <p class="pot-label">${coinsSvg()} Pula sezonu</p>
          <p class="pot-amount font-mono">${stats.potAmount} zł</p>
          <p class="pot-sub">${stats.tripsCount} ${plTrip(stats.tripsCount)} × 10 zł</p>
        </div>
        <div class="pot-winner">
          ${
            leader === null
              ? `<p class="pot-winner-label">Remis</p>`
              : `<p class="pot-winner-label">Aktualnie zgarnia</p><p class="pot-winner-name">${esc(d.anglerNames[leader])}</p>`
          }
        </div>
      </div>

      ${
        !state.showAddForm || (!state.editingTripDate && !d.activeSessionDate)
          ? `<button class="add-fish-trigger" onclick="App.toggleAddForm()">
              ${plusSvg()} Zapisz złowioną rybę
            </button>`
          : `<div class="card add-fish-card">
        <div class="add-fish-header">
          <p class="font-display" style="font-size:18px;margin:0;">${state.editingCatchId ? "Edytuj rybę" : "Zapisz złowioną rybę"}</p>
          <button class="collapse-btn" onclick="App.toggleAddForm()" aria-label="Zwiń">${chevronUpSvg()}</button>
        </div>
        <div class="angler-toggle">
          ${d.anglerNames
            .map(
              (name, idx) =>
                `<button class="${idx === state.selectedAngler ? "active" : ""}" onclick="App.selectAngler(${idx})">${esc(
                  name
                )}</button>`
            )
            .join("")}
        </div>
        <label class="length-label">Długość ryby (cm)</label>
        <input
          class="length-input"
          type="number"
          inputmode="decimal"
          step="0.5"
          min="1"
          max="200"
          placeholder="np. 27"
          id="length-input"
          value="${state.lengthInput}"
          oninput="App.setLength(this.value)"
        />

        <p class="session-location">Rzeka: <strong>${esc(getSessionLocation())}</strong></p>
        <label class="length-label">Gatunek ryby</label>
        <div class="species-toggle" role="group" aria-label="Gatunek ryby">
          ${getSessionSpecies().map((species, idx) => `<button class="${!state.customSpecies && species === selectedSpecies() ? "active" : ""}" aria-pressed="${!state.customSpecies && species === selectedSpecies()}" onclick="App.selectSpecies(${idx})">${esc(species)}</button>`).join("")}
          <button class="${state.customSpecies ? "active" : ""}" aria-pressed="${state.customSpecies}" onclick="App.selectOtherSpecies()">Inna</button>
        </div>
        ${state.customSpecies ? `<label class="length-label" for="custom-species-input">Wpisz gatunek ryby</label>
          <input class="text-input" id="custom-species-input" type="text" placeholder="np. brzana" value="${esc(state.customSpeciesInput)}" oninput="App.setCustomSpecies(this.value)" required />` : ""}

        <label class="length-label">Zdjęcie (opcjonalnie)</label>
        ${
          state.pendingPhoto
            ? `<div class="photo-preview-row">
                <img src="${state.pendingPhoto}" class="photo-thumb" onclick="App.openLightbox('${state.pendingPhoto}')" />
                <button class="photo-remove-btn" onclick="App.removePendingPhoto()">${xSvgSmall()} Usuń zdjęcie</button>
              </div>`
            : `<div class="photo-picker-row">
                <label class="photo-picker-btn">
                  ${cameraSvg()} Zrób zdjęcie
                  <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="App.handlePhotoSelect(this)" />
                </label>
                <label class="photo-picker-btn">
                  ${galleryImgSvg()} Z galerii
                  <input type="file" accept="image/*" style="display:none;" onchange="App.handlePhotoSelect(this)" />
                </label>
              </div>`
        }

        <div class="add-row">
          <p class="points-preview">Punkty: <b>${pointsPreview}</b>${multiplierNote}</p>
          <button class="btn-add" ${!state.lengthInput || state.saving || state.uploadingPhoto ? "disabled" : ""} onclick="App.addCatch()">
            ${state.uploadingPhoto ? "Wysyłanie zdjęcia…" : state.editingCatchId ? "Zapisz zmiany ryby" : `${plusSvg()} Dodaj rybę`}
          </button>
        </div>
      </div>`
      }

      ${
        stats.todays.length > 0
          ? `<p class="section-title">Wyjazd (${formatDatePL(getWorkingDate())})</p>
             <div class="catch-list">
               ${stats.todays
                 .slice()
                 .sort((a, b) => (a.time < b.time ? 1 : -1))
                 .map((c, i, arr) => catchRowHtml(c, d.anglerNames[c.angler], i === arr.length - 1))
                 .join("")}
             </div>`
          : ""
      }

      <p class="section-title">${trophySvg()} Wynik sezonu</p>
      <div class="leaderboard">
        ${d.anglerNames
          .map((name, idx) => {
            const s = stats.perAngler[idx];
            const other = stats.perAngler[idx === 0 ? 1 : 0];
            const diff = Math.round((s.totalPoints - other.totalPoints) * 10) / 10;
            const isLeader = leader === idx;
            const diffHtml =
              diff === 0
                ? `<span class="lb-diff lb-diff-tie">remis</span>`
                : diff > 0
                ? `<span class="lb-diff lb-diff-up">+${diff.toFixed(1)}</span>`
                : `<span class="lb-diff lb-diff-down">${diff.toFixed(1)}</span>`;
            return `
              <div class="lb-card ${isLeader ? "leader" : "plain"}">
                ${isLeader ? `<div class="trophy-badge">${trophySvg(16, "#C97A3D")}</div>` : ""}
                <button class="lb-name lb-name-btn" onclick="App.openProfile(${idx})">${esc(name)}</button>
                <p class="lb-points font-mono">${s.totalPoints.toFixed(1)}</p>
                <p class="lb-sub">${s.count} ${plFish(s.count)} · najw. ${s.best || 0} cm</p>
                ${s.bonusPoints ? `<p class="lb-sub">W tym bonusy za wyjazdy: +${s.bonusPoints.toFixed(1)} pkt</p>` : ""}
                ${diffHtml}
              </div>`;
          })
          .join("")}
      </div>

      ${
        stats.biggestCatch
          ? `<div class="big-fish-card">
              <p class="big-fish-label">${trophySvg(14, "#fff")} Największa ryba sezonu</p>
              <div class="big-fish-body">
                ${
                  stats.biggestCatch.photoUrl
                    ? `<img src="${stats.biggestCatch.photoThumbUrl || stats.biggestCatch.photoUrl}" loading="lazy" class="big-fish-photo" onclick="App.openLightbox('${stats.biggestCatch.photoUrl}')" />`
                    : `<div class="big-fish-photo big-fish-photo-placeholder">${fishSvg(36, "#fff")}</div>`
                }
                <div class="big-fish-info">
                  <p class="big-fish-length font-mono">${stats.biggestCatch.length} cm</p>
                  <p class="big-fish-angler">${esc(d.anglerNames[stats.biggestCatch.angler])}</p>
                  <p class="big-fish-meta">
                    ${[stats.biggestCatch.species, stats.biggestCatch.location].filter(Boolean).join(" · ") || "&nbsp;"}
                  </p>
                  <p class="big-fish-date">${formatDatePL(stats.biggestCatch.date)}</p>
                </div>
              </div>
            </div>`
          : ""
      }

      <p class="section-title">${rulerSvg()} Personal Best</p>
      <div class="pb-grid">
        ${d.anglerNames
          .map((name, idx) => {
            const pbValue = (d.personalBest && d.personalBest[idx]) ?? 0;
            const isEditing = state.editingPB === idx;
            return `
              <div class="pb-card">
                <p class="pb-name">${esc(name)}</p>
                ${
                  isEditing
                    ? `<div class="pb-edit-row">
                        <input id="pb-edit-input" type="number" inputmode="decimal" step="0.5" min="1" max="200" placeholder="np. 39" value="${pbValue || ""}" class="pb-edit-input" />
                        <div class="pb-edit-actions">
                          <button class="pb-edit-btn save" onclick="App.savePB(${idx})">${checkSvg()}</button>
                          <button class="pb-edit-btn cancel" onclick="App.cancelEditPB()">${xSvgSmall()}</button>
                        </div>
                      </div>`
                    : `<div class="pb-value-row">
                        <p class="pb-stat-value" style="font-size:26px;">${pbValue ? pbValue + " cm" : "—"}</p>
                        <button class="pb-edit-trigger" onclick="App.startEditPB(${idx})" aria-label="Edytuj rekord">${pencilSvg()}</button>
                      </div>`
                }
              </div>`;
          })
          .join("")}
      </div>

      ${
        stats.dates.length > 0
          ? `<p class="section-title">Historia wyjazdów i połowów</p>
             ${stats.dates
               .map((date) => {
                 const list = stats.byDate[date] || [];
                 const bonuses = computeTripBonuses(list, (d.tripBonusRules || {})[date]);
                 const sum = Math.round((list.reduce((s, c) => s + c.points, 0) + bonuses.reduce((sum, b) => sum + b.total, 0)) * 10) / 10;
                 const open = !!state.expandedDates[date];
                 return `
                   <div class="history-item">
                     <button class="history-head" onclick="App.toggleDate('${date}')">
                       <span class="history-date">${formatDatePL(date)}</span>
                       <span style="display:flex;align-items:center;gap:10px;">
                         <span class="history-summary">${list.length} ${plFish(list.length)} · ${sum.toFixed(1)} pkt</span>
                         ${open ? chevronUpSvg() : chevronDownSvg()}
                       </span>
                     </button>
                     ${
                       open
                         ? `<div class="history-body">
                             ${tripBonusHtml(date)}
                             <button class="btn-secondary" onclick="App.editTrip('${date}')">Edytuj wyjazd / dodaj rybę</button>
                             ${list
                               .slice()
                               .sort((a, b) => (a.time < b.time ? 1 : -1))
                               .map((c, i, arr) => catchRowHtml(c, d.anglerNames[c.angler], i === arr.length - 1))
                               .join("")}
                           </div>`
                         : ""
                     }
                   </div>`;
               })
               .join("")}`
          : `<div class="empty-state">${fishSvg(28, "#DDE6E2")}<p style="margin:8px 0 0;">Brak złowionych ryb. Zmierzcie pierwszą i dodajcie ją powyżej.</p></div>`
      }

      ${
        d.archivedSeasons && d.archivedSeasons.length > 0
          ? `<p class="section-title">${archiveSvg()} Poprzednie sezony</p>
             ${d.archivedSeasons
               .slice()
               .sort((a, b) => b.year - a.year)
               .map((season) => {
                 const summary = computeSeasonTotals(season.anglerNames, season.catches, season.trips, season.tripBonusRules);
                 const open = !!state.expandedArchive[season.year];
                 const seasonByDate = {};
                 season.catches.forEach((c) => {
                   seasonByDate[c.date] = seasonByDate[c.date] || [];
                   seasonByDate[c.date].push(c);
                 });
                 const seasonDates = Object.keys(seasonByDate).sort((a, b) => (a < b ? 1 : -1));
                 return `
                   <div class="history-item">
                     <button class="history-head" onclick="App.toggleArchive(${season.year})">
                       <span class="history-date">Sezon ${season.year}</span>
                       <span style="display:flex;align-items:center;gap:10px;">
                         <span class="history-summary">${
                           summary.winner === null
                             ? "remis"
                             : "🏆 " + esc(season.anglerNames[summary.winner])
                         } · ${summary.potAmount} zł</span>
                         ${open ? chevronUpSvg() : chevronDownSvg()}
                       </span>
                     </button>
                     ${
                       open
                         ? `<div class="history-body" style="padding:14px 16px;">
                             <div class="leaderboard" style="margin-bottom:14px;">
                               ${season.anglerNames
                                 .map((name, idx) => {
                                   const s = summary.perAngler[idx];
                                   const isW = summary.winner === idx;
                                   return `
                                     <div class="lb-card ${isW ? "leader" : "plain"}">
                                       ${isW ? `<div class="trophy-badge">${trophySvg(16, "#C97A3D")}</div>` : ""}
                                       <p class="lb-name">${esc(name)}</p>
                                       <p class="lb-points font-mono">${s.totalPoints.toFixed(1)}</p>
                                       <p class="lb-sub">${s.count} ${plFish(s.count)}</p>
                                     </div>`;
                                 })
                                 .join("")}
                             </div>
                             ${seasonDates
                               .map(
                                 (date) => `
                               <p style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${formatDatePL(date)}</p>
                               ${seasonByDate[date]
                                 .slice()
                                 .sort((a, b) => (a.time < b.time ? 1 : -1))
                                 .map((c, i, arr) => catchRowHtml(c, season.anglerNames[c.angler], i === arr.length - 1, true))
                                 .join("")}
                             `
                               )
                               .join("")}
                           </div>`
                         : ""
                     }
                   </div>`;
               })
               .join("")}`
          : ""
      }

      <p class="section-title">${imageSvg()} Galeria znad wody</p>
      <div class="gallery-add-row">
        <label class="photo-picker-btn">
          ${cameraSvg()} Zrób zdjęcie
          <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="App.handleGalleryPhotoSelect(this)" />
        </label>
        <label class="photo-picker-btn">
          ${galleryImgSvg()} Z galerii
          <input type="file" accept="image/*" style="display:none;" onchange="App.handleGalleryPhotoSelect(this)" />
        </label>
      </div>
      ${state.uploadingGalleryPhoto ? `<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0;">Wysyłanie zdjęcia…</p>` : ""}
      ${
        (d.galleryPhotos || []).length > 0
          ? (() => {
              const sorted = (d.galleryPhotos || [])
                .slice()
                .sort((a, b) => (a.time || a.date) < (b.time || b.date) ? 1 : -1);
              const visible = sorted.slice(0, state.galleryVisibleCount);
              const remaining = sorted.length - visible.length;
              return `<div class="gallery-grid">
                  ${visible
                    .map(
                      (p) => `
                    <div class="gallery-item">
                      <img src="${p.thumbUrl || p.url}" loading="lazy" class="gallery-thumb" onclick="App.openLightbox('${p.url}')" />
                      <button class="gallery-del-btn" onclick="App.deleteGalleryPhoto('${p.id}')" aria-label="Usuń">✕</button>
                    </div>`
                    )
                    .join("")}
                </div>
                <div class="gallery-buttons-row">
                  ${
                    remaining > 0
                      ? `<button class="btn-secondary gallery-more-btn" onclick="App.showMoreGalleryPhotos()">Pokaż więcej (jeszcze ${remaining})</button>`
                      : ""
                  }
                  ${
                    state.galleryVisibleCount > 9
                      ? `<button class="btn-secondary gallery-more-btn" onclick="App.hideGalleryPhotos()">Zwiń</button>`
                      : ""
                  }
                </div>`;
            })()
          : `<p style="font-size:13px;color:var(--text-muted);margin:10px 0 0;">Brak zdjęć - dodajcie pierwsze z Waszych wypraw.</p>`
      }

      <div class="footer-space"></div>
    </div>

    ${
      state.showSettings
        ? `<div class="modal-backdrop" onclick="App.closeSettingsBackdrop(event)">
            <div class="modal">
              ${
                state.showResetConfirm
                  ? `
                <div class="modal-head">
                  <p class="font-display modal-danger-title" style="font-size:18px;margin:0;">Na pewno wyczyścić dane?</p>
                </div>
                <p class="modal-danger-text">To usunie WSZYSTKIE zapisane ryby i wyniki obu zawodników, włącznie z archiwum poprzednich sezonów. Tej operacji nie da się cofnąć. Rozważ wcześniej pobranie kopii zapasowej.</p>
                <button class="btn-danger" onclick="App.resetData()">Tak, wyczyść wszystko</button>
                <button class="btn-secondary" onclick="App.cancelReset()">Anuluj</button>
              `
                  : state.showImportConfirm
                  ? `
                <div class="modal-head">
                  <p class="font-display modal-danger-title" style="font-size:18px;margin:0;">Zastąpić dane kopią zapasową?</p>
                </div>
                <p class="modal-danger-text">Wczytany plik zawiera ${state.pendingImportData ? state.pendingImportData.catches.length : 0} ${plFish(
                      state.pendingImportData ? state.pendingImportData.catches.length : 0
                    )}. To nadpisze obecne dane we wspólnej bazie (u obu zawodników).</p>
                <button class="btn-danger" onclick="App.confirmImport()">Tak, przywróć z pliku</button>
                <button class="btn-secondary" onclick="App.cancelImport()">Anuluj</button>
              `
                  : state.showEndSeasonConfirm
                  ? (() => {
                      const summary = computeSeasonTotals(d.anglerNames, d.catches, d.trips, d.tripBonusRules);
                      const totalFish = summary.perAngler[0].count + summary.perAngler[1].count;
                      return `
                <div class="modal-head">
                  <p class="font-display" style="font-size:18px;margin:0;">Zakończyć sezon ${d.seasonYear}?</p>
                </div>
                <p class="modal-danger-text" style="color:var(--text-muted);">
                  ${esc(d.anglerNames[0])}: ${summary.perAngler[0].totalPoints.toFixed(1)} pkt (${summary.perAngler[0].count} ${plFish(summary.perAngler[0].count)})<br/>
                  ${esc(d.anglerNames[1])}: ${summary.perAngler[1].totalPoints.toFixed(1)} pkt (${summary.perAngler[1].count} ${plFish(summary.perAngler[1].count)})<br/>
                  Pula: ${summary.potAmount} zł ${summary.winner === null ? "(remis)" : "→ zgarnia " + esc(d.anglerNames[summary.winner])}
                </p>
                <p class="modal-danger-text">Ten sezon trafi do archiwum (zostanie w historii), a wynik i pula wyzerują się na start sezonu ${d.seasonYear + 1}. Personal Best zostaje bez zmian - to rekord życiowy. ${totalFish === 0 ? "Uwaga: w tym sezonie nie ma jeszcze żadnych złowionych ryb." : ""}</p>
                <button class="btn-copper" style="width:100%;" onclick="App.endSeason()">Tak, zakończ sezon ${d.seasonYear}</button>
                <button class="btn-secondary" onclick="App.cancelEndSeason()">Anuluj</button>
              `;
                    })()
                  : state.showRecalcConfirm
                  ? (() => {
                      const affected = countCatchesWithoutMultiplier();
                      return `
                <div class="modal-head">
                  <p class="font-display" style="font-size:18px;margin:0;">Przeliczyć punkty za mnożniki?</p>
                </div>
                <p class="modal-danger-text">
                  ${
                    affected === 0
                      ? "Wszystkie ryby mają już przeliczone mnożniki - nie ma nic do zrobienia."
                      : `Znaleziono ${affected} ${plFish(affected)} złowionych przed wprowadzeniem premii za rozmiar/gatunek. Ich punkty zostaną przeliczone (mogą wzrosnąć), co wpłynie na wynik sezonu i archiwum. Ryby, które już mają zapisany mnożnik, zostaną pominięte.`
                  }
                </p>
                ${
                  affected > 0
                    ? `<button class="btn-copper" style="width:100%;" onclick="App.recalculatePoints()">Tak, przelicz ${affected} ${plFish(affected)}</button>`
                    : ""
                }
                <button class="btn-secondary" onclick="App.cancelRecalculatePoints()">${affected === 0 ? "Zamknij" : "Anuluj"}</button>
              `;
                    })()
                  : state.showManageTrips
                  ? `
                <div class="modal-head">
                  <p class="font-display" style="font-size:18px;margin:0;">Wyjazdy (pula ${d.seasonYear})</p>
                  <button onclick="App.closeManageTrips()" style="background:none;border:none;cursor:pointer;">${xSvg()}</button>
                </div>
                <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;">Każdy wyjazd to 10 zł do puli. Usunięcie wyjazdu nie kasuje złowionych tego dnia ryb - tylko odejmuje 10 zł z puli.</p>
                ${
                  (d.trips || []).length === 0
                    ? `<p style="font-size:13px;color:var(--text-muted);">Brak zapisanych wyjazdów w tym sezonie.</p>`
                    : `<div class="catch-list" style="margin-bottom:8px;">
                        ${(d.trips || [])
                          .slice()
                          .sort((a, b) => (a < b ? 1 : -1))
                          .map(
                            (date, i, arr) => `
                          <div class="catch-row" style="${i === arr.length - 1 ? "border-bottom:none;" : ""}">
                            <p class="catch-name" style="font-family:'JetBrains Mono',monospace;">${formatDatePL(date)}</p>
                            <button class="del-btn" onclick="App.removeTrip('${date}')" aria-label="Usuń wyjazd">✕</button>
                          </div>`
                          )
                          .join("")}
                      </div>`
                }
                <p style="font-size:13px;color:var(--text-muted);margin:8px 0 0;">Aktualna pula: <b style="color:var(--accent);">${stats.potAmount} zł</b> (${stats.tripsCount} ${plTrip(stats.tripsCount)})</p>
                <button class="btn-secondary" style="margin-top:12px;" onclick="App.closeManageTrips()">Zamknij</button>
              `
                  : `
                <div class="modal-head">
                  <p class="font-display" style="font-size:18px;margin:0;">Ustawienia</p>
                  <button onclick="App.toggleSettings()" style="background:none;border:none;cursor:pointer;">${xSvg()}</button>
                </div>
                <label class="length-label" style="margin-top:0;">Imiona zawodników</label>
                <input id="name-input-0" placeholder="${esc(d.anglerNames[0])}" style="margin-top:8px;" />
                <input id="name-input-1" placeholder="${esc(d.anglerNames[1])}" />
                <button class="btn-copper" style="width:100%;margin-top:4px;" onclick="App.saveNames()">Zapisz imiona</button>

                <label class="length-label">Kopia zapasowa</label>
                <button class="btn-secondary" style="margin-top:8px;color:var(--text);border-color:var(--border);" onclick="App.exportBackup()">⬇ Pobierz kopię zapasową (.json)</button>
                <label class="btn-secondary" style="margin-top:8px;display:block;text-align:center;color:var(--text);border-color:var(--border);cursor:pointer;">
                  ⬆ Przywróć z pliku…
                  <input type="file" accept="application/json" style="display:none;" onchange="App.importFile(this)" />
                </label>

                <label class="length-label">Sezon</label>
                <button class="btn-secondary" style="margin-top:8px;color:var(--text);border-color:var(--border);" onclick="App.openManageTrips()">💰 Zarządzaj wyjazdami (pula: ${stats.potAmount} zł)</button>
                <button class="btn-secondary" style="margin-top:8px;color:var(--text);border-color:var(--border);" onclick="App.askEndSeason()">🏁 Zakończ sezon ${d.seasonYear} i rozpocznij nowy</button>

                <label class="length-label">Punktacja</label>
                <button class="btn-secondary" style="margin-top:8px;color:var(--text);border-color:var(--border);" onclick="App.askRecalculatePoints()">🔄 Przelicz mnożniki dla starszych ryb</button>

                <button class="btn-secondary" style="border-color:#E8B9A6;color:#B14A2C;margin-top:20px;" onclick="App.askReset()">Wyczyść wszystkie dane</button>
              `
              }
            </div>
          </div>`
        : ""
    }

    ${
      state.showPasswordModal
        ? `<div class="modal-backdrop" onclick="App.passwordBackdropClick(event)">
            <div class="modal">
              <div class="modal-head">
                <p class="font-display" style="font-size:18px;margin:0;">Podaj hasło</p>
                <button onclick="App.cancelPassword()" style="background:none;border:none;cursor:pointer;">${xSvg()}</button>
              </div>
              <p style="font-size:13px;color:var(--slate);margin:0 0 12px;">Ta akcja zmienia wspólny wynik sezonu - wymaga hasła.</p>
              <input id="password-input" type="password" placeholder="Hasło" autocomplete="off" onkeydown="App.passwordKeydown(event)" />
              ${state.passwordError ? `<p style="color:#B14A2C;font-size:13px;margin:4px 0 12px;">${esc(state.passwordError)}</p>` : ""}
              <button class="btn-copper" style="width:100%;margin-top:4px;" onclick="App.submitPassword()">Zatwierdź</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.profileAnglerIdx !== null
        ? (() => {
            const idx = state.profileAnglerIdx;
            const name = d.anglerNames[idx];
            const lt = computeLifetimeStats(idx);
            const pbValue = (d.personalBest && d.personalBest[idx]) ?? 0;
            const achievements = computeAchievements(idx);
            const unlocked = achievements.filter((a) => a.unlocked);
            const showAll = state.showAllAchievements;
            return `
      <div class="modal-backdrop" onclick="App.closeProfileBackdrop(event)">
        <div class="modal profile-modal">
          <div class="modal-head">
            <p class="font-display" style="font-size:20px;margin:0;">${esc(name)}</p>
            <button onclick="App.closeProfile()" style="background:none;border:none;cursor:pointer;">${xSvg()}</button>
          </div>

          <div class="profile-stats-grid">
            <div class="profile-stat-box">
              <p class="profile-stat-value font-mono">${lt.count}</p>
              <p class="profile-stat-label">${plFish(lt.count)} złowionych</p>
            </div>
            <div class="profile-stat-box">
              <p class="profile-stat-value font-mono">${lt.totalPoints.toFixed(1)}</p>
              <p class="profile-stat-label">punktów łącznie</p>
            </div>
            <div class="profile-stat-box">
              <p class="profile-stat-value font-mono">${pbValue ? pbValue + " cm" : "—"}</p>
              <p class="profile-stat-label">Personal Best</p>
            </div>
            <div class="profile-stat-box">
              <p class="profile-stat-value font-mono">${lt.seasonsPlayed}</p>
              <p class="profile-stat-label">${lt.seasonsPlayed === 1 ? "sezon" : "sezony"} rozegrane</p>
            </div>
          </div>

          <p class="length-label" style="margin-top:18px;">🏆 Osiągnięcia (${unlocked.length}/${achievements.length})</p>

          ${
            unlocked.length > 0
              ? `<div class="badge-row">
                  ${unlocked
                    .map((a) => `<div class="badge-pill" title="${esc(a.name)}"><span>${a.icon}</span> ${esc(a.name)}</div>`)
                    .join("")}
                </div>`
              : `<p style="font-size:13px;color:var(--text-muted);margin:8px 0 0;">Brak zdobytych jeszcze - łapcie ryby!</p>`
          }

          <button class="btn-secondary achievements-toggle" onclick="App.toggleAllAchievements()">
            ${showAll ? "Zwiń" : "Pokaż wszystkie osiągnięcia"} ${showAll ? chevronUpSvg() : chevronDownSvg()}
          </button>

          ${
            showAll
              ? `<div class="achievements-grid">
                  ${achievements
                    .map((a) => {
                      const pct = Math.min(100, Math.round((a.current / a.target) * 100));
                      return `
                      <div class="achievement-item ${a.unlocked ? "unlocked" : "locked"}">
                        <div class="achievement-icon">${a.icon}</div>
                        <div class="achievement-info">
                          <p class="achievement-name">${esc(a.name)}</p>
                          ${
                            a.unlocked
                              ? `<p class="achievement-status">Zdobyte ✓</p>`
                              : `<div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%;"></div></div>
                                 <p class="achievement-status">${a.metric === "totalPoints" ? a.current.toFixed(1) : a.current} / ${a.target}</p>`
                          }
                        </div>
                      </div>`;
                    })
                    .join("")}
                </div>`
              : ""
          }
        </div>
      </div>`;
          })()
        : ""
    }

    ${
      state.lightboxUrl
        ? `<div class="lightbox-backdrop" onclick="App.closeLightbox()">
            <img src="${state.lightboxUrl}" class="lightbox-img" />
            <button class="lightbox-close" onclick="App.closeLightbox()">${xSvgWhite()}</button>
          </div>`
        : ""
    }
  `;

  if (state.showPasswordModal) {
    const pi = document.getElementById("password-input");
    if (pi) pi.focus();
  }
  if (state.editingPB !== null) {
    const pb = document.getElementById("pb-edit-input");
    if (pb) {
      pb.focus();
      pb.select();
    }
  }
}

// ---------- ikony (inline SVG, bez zależności) ----------
function fishSvg(size = 24, color = "#1F3A34") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6-3.56 0-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3c1.9-.24 3.7.75 4.4 2.7"/></svg>`;
}
function gearSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
}
function sunSvg() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
}
function moonSvg() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`;
}
function calendarSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C97A3D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
}
function plusSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M12 5v14M5 12h14"/></svg>`;
}
function trophySvg(size = 18, color = "#C97A3D") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>`;
}
function archiveSvg(size = 17, color = "#C97A3D") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>`;
}
function coinsSvg(size = 15, color = "#C97A3D") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`;
}
function chevronDownSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
}
function chevronUpSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
}
function rulerSvg(size = 18, color = "#C97A3D") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/></svg>`;
}
function pencilSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
}
function checkSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
}
function xSvgSmall() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}
function cameraSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
}
function galleryImgSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`;
}
function imageSvg(size = 17, color = "#C97A3D") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`;
}
function xSvgWhite() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}
function xSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

// ---------- API wystawione do onclick ----------
window.App = {
  endTrip: guardedAction(endTrip),
  editTrip: guardedAction(editTrip),
  editCatch: guardedAction(editCatch),
  closeTripEdit() {
    resetCatchForm();
    state.editingTripDate = null;
    state.showDateEdit = false;
    render();
  },
  toggleAddForm() {
    if ((!state.editingTripDate && !state.data.activeSessionDate) || !getSessionLocation()) {
      state.showDateEdit = true;
      state.dateDraft = state.editingTripDate || state.data.activeSessionDate || todayISO();
      state.locationDraft = getSessionLocation(state.dateDraft);
    } else {
      state.showAddForm = !state.showAddForm;
    }
    render();
  },
  selectAngler(idx) {
    state.selectedAngler = idx;
    render();
  },
  setLength(v) {
    state.lengthInput = v;
    refreshPointsPreviewDOM();
    const addBtn = document.querySelector(".btn-add");
    if (addBtn) addBtn.disabled = !v || state.saving;
  },
  selectSpecies(idx) {
    state.customSpecies = false;
    state.speciesInput = getSessionSpecies()[idx] || "";
    render();
  },
  selectOtherSpecies() {
    state.customSpecies = true;
    render();
    const input = document.getElementById("custom-species-input");
    if (input) input.focus();
  },
  setCustomSpecies(value) {
    state.customSpeciesInput = value;
    const input = document.getElementById("custom-species-input");
    if (input) input.setCustomValidity("");
    refreshPointsPreviewDOM();
  },
  addCatch: guardedAction(addCatch),
  deleteCatch: guardedAction(deleteCatch),
  askDeleteCatch(id) {
    state.confirmDeleteId = id;
    render();
  },
  cancelDeleteCatch() {
    state.confirmDeleteId = null;
    render();
  },
  startEditPB(idx) {
    // odczyt wartości nie jest tu potrzebny - to tylko wejście w tryb edycji
    guardedAction(() => startEditPB(idx))();
  },
  savePB: guardedAction((idx) => savePB(idx)),
  cancelEditPB,
  handlePhotoSelect(input) {
    handlePhotoSelect(input);
  },
  removePendingPhoto,
  openLightbox(url) {
    state.lightboxUrl = url;
    render();
  },
  closeLightbox() {
    state.lightboxUrl = null;
    render();
  },
  openProfile(idx) {
    state.profileAnglerIdx = idx;
    state.showAllAchievements = false;
    render();
  },
  closeProfile() {
    state.profileAnglerIdx = null;
    render();
  },
  closeProfileBackdrop(e) {
    if (e.target.classList.contains("modal-backdrop")) {
      state.profileAnglerIdx = null;
      render();
    }
  },
  toggleAllAchievements() {
    state.showAllAchievements = !state.showAllAchievements;
    render();
  },
  handleGalleryPhotoSelect(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    guardedAction(() => handleGalleryPhotoSelect(file))();
  },
  deleteGalleryPhoto: guardedAction(deleteGalleryPhoto),
  showMoreGalleryPhotos() {
    state.galleryVisibleCount += 9;
    render();
  },
  hideGalleryPhotos() {
    state.galleryVisibleCount = 9;
    render();
  },
  toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, state.theme);
    } catch (e) {}
    render();
  },
  toggleSettings() {
    state.showSettings = !state.showSettings;
    state.showResetConfirm = false;
    state.showEndSeasonConfirm = false;
    state.showManageTrips = false;
    state.showRecalcConfirm = false;
    render();
  },
  closeSettingsBackdrop(e) {
    if (e.target.classList.contains("modal-backdrop")) {
      state.showSettings = false;
      state.showResetConfirm = false;
      state.showEndSeasonConfirm = false;
      state.showManageTrips = false;
      state.showRecalcConfirm = false;
      render();
    }
  },
  passwordBackdropClick(e) {
    if (e.target.classList.contains("modal-backdrop")) {
      cancelPassword();
    }
  },
  toggleDateEdit() {
    state.showDateEdit = !state.showDateEdit;
    state.dateDraft = state.editingTripDate || state.data.activeSessionDate || todayISO();
    state.locationDraft = state.editingTripDate || state.data.activeSessionDate ? getSessionLocation() : "";
    render();
  },
  setTripDate(date) {
    const locationInput = document.getElementById("location-draft-input");
    state.dateDraft = date;
    state.locationDraft = getSessionLocation(date) || (locationInput ? locationInput.value : state.locationDraft);
    render();
  },
  confirmDate() {
    // odczytujemy wartość PRZED ewentualnym pokazaniem hasła, żeby jej nie zgubić
    const el = document.getElementById("date-draft-input");
    const val = el ? el.value : state.dateDraft;
    const locationInput = document.getElementById("location-draft-input");
    const location = locationInput ? locationInput.value.trim() : state.locationDraft.trim();
    if (!val || !location) {
      if (locationInput) {
        locationInput.setCustomValidity("Wybierz lub wpisz rzekę.");
        locationInput.reportValidity();
        locationInput.oninput = () => locationInput.setCustomValidity("");
      }
      return;
    }
    guardedAction(() => {
      state.dateDraft = val;
      state.locationDraft = location;
      startNewSession();
    })();
  },
  toggleDate(date) {
    state.expandedDates[date] = !state.expandedDates[date];
    render();
  },
  saveNames() {
    // odczytujemy wartości PRZED ewentualnym pokazaniem hasła, żeby ich nie zgubić
    const n1 = document.getElementById("name-input-0").value.trim();
    const n2 = document.getElementById("name-input-1").value.trim();
    guardedAction(() => {
      const names = [n1 || state.data.anglerNames[0], n2 || state.data.anglerNames[1]];
      persist({ ...state.data, anglerNames: names });
      state.showSettings = false;
    })();
  },
  exportBackup,
  importFile(input) {
    handleImportFile(input);
  },
  confirmImport: guardedAction(confirmImport),
  cancelImport,
  askReset() {
    state.showResetConfirm = true;
    render();
  },
  cancelReset() {
    state.showResetConfirm = false;
    render();
  },
  resetData: guardedAction(resetAllData),
  askEndSeason,
  cancelEndSeason,
  endSeason: guardedAction(endSeason),
  askRecalculatePoints,
  cancelRecalculatePoints,
  recalculatePoints: guardedAction(recalculatePoints),
  toggleArchive(year) {
    state.expandedArchive[year] = !state.expandedArchive[year];
    render();
  },
  openManageTrips() {
    state.showManageTrips = true;
    render();
  },
  closeManageTrips() {
    state.showManageTrips = false;
    render();
  },
  removeTrip: guardedAction(removeTrip),
  submitPassword,
  cancelPassword,
  passwordKeydown(e) {
    if (e.key === "Enter") submitPassword();
  },
};

loadInitial();
render();
