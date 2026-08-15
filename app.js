// ============================================
// Wodery PACIUCIU i Pstrągi - logika aplikacji
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
  speciesInput: "",
  locationInput: "",
  showSettings: false,
  showDateEdit: false,
  showResetConfirm: false,
  showImportConfirm: false,
  pendingImportData: null,
  dateDraft: todayISO(),
  expandedDates: {},
  editingPB: null,
  pendingPhoto: null,
  uploadingPhoto: false,
  lightboxUrl: null,
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

function computePoints(lengthCm) {
  return Math.round((lengthCm / 10) * 10) / 10;
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
const COMMON_LOCATIONS = ["Bystrzyca", "Skora", "Kaczawa"];

function getLocationSuggestions() {
  const set = new Set(COMMON_LOCATIONS);
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
    currentSessionDate: todayISO(),
    trips: [],
    catches: [],
  };
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
  if (!state.dateDraft) return;
  const trips = Array.isArray(state.data.trips) ? [...state.data.trips] : [];
  if (!trips.includes(state.dateDraft)) trips.push(state.dateDraft);
  persist({ ...state.data, currentSessionDate: state.dateDraft, trips });
  state.showDateEdit = false;
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
  return json.data.url;
}

async function addCatch() {
  const len = parseFloat(String(state.lengthInput).replace(",", "."));
  if (!len || len <= 0 || len > 200) return;

  let photoUrl = null;
  if (state.pendingPhoto) {
    if (IMGBB_API_KEY) {
      state.uploadingPhoto = true;
      render();
      try {
        photoUrl = await uploadToImgbb(state.pendingPhoto);
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

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: state.data.currentSessionDate,
    angler: state.selectedAngler,
    length: len,
    points: computePoints(len),
    time: new Date().toISOString(),
    photoUrl,
    species: state.speciesInput.trim() || null,
    location: state.locationInput.trim() || null,
  };
  persist({ ...state.data, catches: [...state.data.catches, entry] });
  state.lengthInput = "";
  state.speciesInput = "";
  state.locationInput = "";
  state.pendingPhoto = null;
}

function deleteCatch(id) {
  persist({ ...state.data, catches: state.data.catches.filter((c) => c.id !== id) });
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

function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Wodery PACIUCIU i Pstrągi",
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
  const perAngler = [0, 1].map((idx) => {
    const list = d.catches.filter((c) => c.angler === idx);
    const totalPoints = Math.round(list.reduce((s, c) => s + c.points, 0) * 10) / 10;
    const best = list.reduce((m, c) => (c.length > m ? c.length : m), 0);
    const bestCatch = list.reduce((m, c) => (!m || c.length > m.length ? c : m), null);
    return { count: list.length, totalPoints, best, bestCatch };
  });
  const todays = d.catches.filter((c) => c.date === d.currentSessionDate);
  const byDate = {};
  d.catches.forEach((c) => {
    byDate[c.date] = byDate[c.date] || [];
    byDate[c.date].push(c);
  });
  const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));
  const tripsCount = Array.isArray(d.trips) ? d.trips.length : 0;
  const potAmount = tripsCount * 10;
  return { perAngler, todays, byDate, dates, tripsCount, potAmount };
}

// ---------- render helpers ----------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function catchRowHtml(c, name, isLast) {
  const extraBits = [c.species, c.location].filter(Boolean).join(" · ");
  return `
    <div class="catch-row" style="${isLast ? "border-bottom:none;" : ""}">
      <div class="catch-row-main">
        ${
          c.photoUrl
            ? `<img src="${c.photoUrl}" class="catch-thumb" onclick="App.openLightbox('${c.photoUrl}')" />`
            : ""
        }
        <div>
          <p class="catch-name">${esc(name)}</p>
          <p class="catch-meta">${c.length} cm · ${c.points.toFixed(1)} pkt</p>
          ${extraBits ? `<p class="catch-extra">${esc(extraBits)}</p>` : ""}
        </div>
      </div>
      <button class="del-btn" onclick="App.deleteCatch('${c.id}')" aria-label="Usuń">✕</button>
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
  const pointsPreview = state.lengthInput && !isNaN(lengthNum) ? computePoints(lengthNum).toFixed(1) : "0.0";

  root.innerHTML = `
    <div class="header">
      <div class="header-fish-bg">${fishSvg(140, "#fff")}</div>
      <div class="header-top">
        <div>
          <p class="eyebrow">Sezon ${new Date().getFullYear()} · Pstrągi</p>
          <h1 class="h1 font-display">Wodery PACIUCIU i Pstrągi</h1>
        </div>
        <div class="header-actions">
          <button class="icon-btn" onclick="App.toggleTheme()" aria-label="Zmień motyw">${state.theme === "dark" ? sunSvg() : moonSvg()}</button>
          <button class="icon-btn" onclick="App.toggleSettings()" aria-label="Ustawienia">${gearSvg()}</button>
        </div>
      </div>
      <div class="session-bar">
        <span>${calendarSvg()} Dzień połowów: ${formatDatePL(d.currentSessionDate)}</span>
        <button class="link-btn" onclick="App.toggleDateEdit()">zmień</button>
      </div>
      ${
        state.showDateEdit
          ? `<div class="date-edit">
              <input type="date" id="date-draft-input" value="${d.currentSessionDate}" />
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
      <div class="card">
        <p class="font-display" style="font-size:18px;margin:0;">Zapisz złowioną rybę</p>
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

        <div class="two-col-row">
          <div>
            <label class="length-label">Gatunek (opcjonalnie)</label>
            <input
              class="text-input"
              type="text"
              list="species-suggestions"
              placeholder="np. pstrąg potokowy"
              value="${esc(state.speciesInput)}"
              oninput="App.setSpecies(this.value)"
            />
            <datalist id="species-suggestions">
              ${COMMON_SPECIES.map((s) => `<option value="${esc(s)}"></option>`).join("")}
            </datalist>
          </div>
          <div>
            <label class="length-label">Miejsce (opcjonalnie)</label>
            <input
              class="text-input"
              type="text"
              list="location-suggestions"
              placeholder="np. Dunajec"
              value="${esc(state.locationInput)}"
              oninput="App.setLocation(this.value)"
            />
            <datalist id="location-suggestions">
              ${getLocationSuggestions().map((l) => `<option value="${esc(l)}"></option>`).join("")}
            </datalist>
          </div>
        </div>

        <label class="length-label">Zdjęcie (opcjonalnie)</label>
        ${
          state.pendingPhoto
            ? `<div class="photo-preview-row">
                <img src="${state.pendingPhoto}" class="photo-thumb" onclick="App.openLightbox('${state.pendingPhoto}')" />
                <button class="photo-remove-btn" onclick="App.removePendingPhoto()">${xSvgSmall()} Usuń zdjęcie</button>
              </div>`
            : `<label class="photo-picker-btn">
                ${cameraSvg()} Dodaj zdjęcie ryby
                <input type="file" accept="image/*" style="display:none;" onchange="App.handlePhotoSelect(this)" />
              </label>`
        }

        <div class="add-row">
          <p class="points-preview">Punkty: <b>${pointsPreview}</b></p>
          <button class="btn-add" ${!state.lengthInput || state.saving || state.uploadingPhoto ? "disabled" : ""} onclick="App.addCatch()">
            ${state.uploadingPhoto ? "Wysyłanie zdjęcia…" : `${plusSvg()} Dodaj rybę`}
          </button>
        </div>
      </div>

      ${
        stats.todays.length > 0
          ? `<p class="section-title">Dziś złowione (${formatDatePL(d.currentSessionDate)})</p>
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
            const isLeader = leader === idx;
            return `
              <div class="lb-card ${isLeader ? "leader" : "plain"}">
                ${isLeader ? `<div class="trophy-badge">${trophySvg(16, "#C97A3D")}</div>` : ""}
                <p class="lb-name">${esc(name)}</p>
                <p class="lb-points font-mono">${s.totalPoints.toFixed(1)}</p>
                <p class="lb-sub">${s.count} ${plFish(s.count)} · najw. ${s.best || 0} cm</p>
              </div>`;
          })
          .join("")}
      </div>

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
          ? `<p class="section-title">Historia połowów</p>
             ${stats.dates
               .map((date) => {
                 const list = stats.byDate[date];
                 const sum = Math.round(list.reduce((s, c) => s + c.points, 0) * 10) / 10;
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
                <p class="modal-danger-text">To usunie WSZYSTKIE zapisane ryby i wyniki obu zawodników. Tej operacji nie da się cofnąć. Rozważ wcześniej pobranie kopii zapasowej.</p>
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
                <button class="btn-secondary" style="margin-top:8px;color:var(--spruce);border-color:var(--line);" onclick="App.exportBackup()">⬇ Pobierz kopię zapasową (.json)</button>
                <label class="btn-secondary" style="margin-top:8px;display:block;text-align:center;color:var(--spruce);border-color:var(--line);cursor:pointer;">
                  ⬆ Przywróć z pliku…
                  <input type="file" accept="application/json" style="display:none;" onchange="App.importFile(this)" />
                </label>

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
function xSvgWhite() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}
function xSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

// ---------- API wystawione do onclick ----------
window.App = {
  selectAngler(idx) {
    state.selectedAngler = idx;
    render();
  },
  setLength(v) {
    state.lengthInput = v;
    const lengthNum = parseFloat(String(v).replace(",", "."));
    const preview = v && !isNaN(lengthNum) ? computePoints(lengthNum).toFixed(1) : "0.0";
    const previewEl = document.querySelector(".points-preview b");
    if (previewEl) previewEl.textContent = preview;
    const addBtn = document.querySelector(".btn-add");
    if (addBtn) addBtn.disabled = !v || state.saving;
  },
  setSpecies(v) {
    state.speciesInput = v; // bez render() - nic innego na ekranie od tego nie zależy na żywo
  },
  setLocation(v) {
    state.locationInput = v;
  },
  addCatch: guardedAction(addCatch),
  deleteCatch: guardedAction(deleteCatch),
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
    render();
  },
  closeSettingsBackdrop(e) {
    if (e.target.classList.contains("modal-backdrop")) {
      state.showSettings = false;
      state.showResetConfirm = false;
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
    state.dateDraft = state.data.currentSessionDate;
    render();
  },
  confirmDate() {
    // odczytujemy wartość PRZED ewentualnym pokazaniem hasła, żeby jej nie zgubić
    const el = document.getElementById("date-draft-input");
    const val = el ? el.value : state.dateDraft;
    guardedAction(() => {
      state.dateDraft = val;
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
  submitPassword,
  cancelPassword,
  passwordKeydown(e) {
    if (e.key === "Enter") submitPassword();
  },
};

loadInitial();
render();
