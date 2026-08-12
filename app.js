// ============================================
// PACIUCIU League - logika aplikacji
// ============================================

const CFG = window.APP_CONFIG || {};
const BIN_ID = CFG.JSONBIN_BIN_ID;
const API_KEY = CFG.JSONBIN_API_KEY;
const EDIT_PASSWORD = CFG.EDIT_PASSWORD || "";
const API_BASE = "https://api.jsonbin.io/v3/b";
const POLL_MS = 15000;
const LS_KEY = "pstragi-local-backup";
const UNLOCK_KEY = "pstragi-unlocked";

const root = document.getElementById("root");

const state = {
  data: null,
  loading: true,
  saving: false,
  error: null,
  offlineMode: false,
  lastSyncTime: null,
  configOk: BIN_ID && API_KEY && BIN_ID !== "WKLEJ_TU_BIN_ID" && API_KEY !== "WKLEJ_TU_X_MASTER_KEY",
  unlocked: sessionStorage.getItem(UNLOCK_KEY) === "1",
  showPasswordModal: false,
  passwordError: "",
  pendingAction: null,
  selectedAngler: 0,
  lengthInput: "",
  showSettings: false,
  showDateEdit: false,
  showResetConfirm: false,
  showImportConfirm: false,
  pendingImportData: null,
  dateDraft: todayISO(),
  expandedDates: {},
};

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
    currentSessionDate: todayISO(),
    catches: [],
  };
}

// ---------- jsonbin.io API ----------
async function fetchRemote() {
  const res = await fetch(`${API_BASE}/${BIN_ID}/latest`, {
    headers: { "X-Master-Key": API_KEY },
  });
  if (!res.ok) throw new Error("Błąd pobierania danych (" + res.status + ")");
  const json = await res.json();
  return json.record;
}

async function saveRemote(payload) {
  const res = await fetch(`${API_BASE}/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Błąd zapisu danych (" + res.status + ")");
  return res.json();
}

async function loadInitial() {
  if (!state.configOk) {
    state.loading = false;
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
    // jsonbin nie odpowiada - próbujemy lokalnej kopii zapasowej z tego telefonu
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
    startPolling();
  }
}

function startPolling() {
  setInterval(async () => {
    if (!state.configOk || state.saving) return;
    // jeśli byliśmy offline, najpierw spróbuj wysłać nasze lokalne dane (mogły powstać offline)
    if (state.offlineMode) {
      try {
        await saveRemote(state.data);
        state.offlineMode = false;
        state.lastSyncTime = new Date();
        state.error = null;
        render();
        return;
      } catch (e) {
        return; // dalej offline, spróbujemy przy kolejnym pollingu
      }
    }
    try {
      const record = await fetchRemote();
      state.offlineMode = false;
      state.lastSyncTime = new Date();
      if (record && JSON.stringify(record) !== JSON.stringify(state.data)) {
        state.data = { ...defaultData(), ...record };
        saveLocalBackup(state.data);
        state.error = null;
        render();
      }
    } catch (e) {
      state.offlineMode = true;
      // cichy fail przy pollingu - lokalna kopia i tak jest bezpieczna, nie przeszkadzamy użytkownikowi
    }
  }, POLL_MS);
}

async function persist(next) {
  state.data = next;
  state.saving = true;
  state.error = null;
  saveLocalBackup(next); // zapisujemy lokalnie natychmiast, niezależnie od tego czy uda się wysłać online
  render();
  try {
    await saveRemote(next);
    state.offlineMode = false;
    state.lastSyncTime = new Date();
  } catch (e) {
    state.offlineMode = true;
    state.error =
      "Zapisano lokalnie na tym telefonie, ale nie udało się wysłać do wspólnej bazy (brak internetu lub jsonbin nie odpowiada). Spróbuję ponownie automatycznie.";
  } finally {
    state.saving = false;
    render();
  }
}

// ---------- akcje ----------
function startNewSession() {
  if (!state.dateDraft) return;
  persist({ ...state.data, currentSessionDate: state.dateDraft });
  state.showDateEdit = false;
}

function addCatch() {
  const len = parseFloat(String(state.lengthInput).replace(",", "."));
  if (!len || len <= 0 || len > 200) return;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: state.data.currentSessionDate,
    angler: state.selectedAngler,
    length: len,
    points: computePoints(len),
    time: new Date().toISOString(),
  };
  persist({ ...state.data, catches: [...state.data.catches, entry] });
  state.lengthInput = "";
}

function deleteCatch(id) {
  persist({ ...state.data, catches: state.data.catches.filter((c) => c.id !== id) });
}

function resetAllData() {
  persist(defaultData());
  state.showResetConfirm = false;
  state.showSettings = false;
}

function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "PACIUCIU League",
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
    return { count: list.length, totalPoints, best };
  });
  const todays = d.catches.filter((c) => c.date === d.currentSessionDate);
  const byDate = {};
  d.catches.forEach((c) => {
    byDate[c.date] = byDate[c.date] || [];
    byDate[c.date].push(c);
  });
  const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));
  return { perAngler, todays, byDate, dates };
}

// ---------- render helpers ----------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function catchRowHtml(c, name, isLast) {
  return `
    <div class="catch-row" style="${isLast ? "border-bottom:none;" : ""}">
      <div>
        <p class="catch-name">${esc(name)}</p>
        <p class="catch-meta">${c.length} cm · ${c.points.toFixed(1)} pkt</p>
      </div>
      <button class="del-btn" onclick="App.deleteCatch('${c.id}')" aria-label="Usuń">✕</button>
    </div>`;
}

function render() {
  if (!state.configOk) {
    root.innerHTML = `
      <div class="config-warning" style="margin-top:40px;">
        <p class="font-display" style="font-size:18px;margin-top:0;">Brakuje konfiguracji</p>
        <p>Otwórz plik <code>config.js</code> i wklej tam <code>JSONBIN_BIN_ID</code> oraz <code>JSONBIN_API_KEY</code> z jsonbin.io.
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
          <h1 class="h1 font-display">PACIUCIU League/h1>
        </div>
        <button class="icon-btn" onclick="App.toggleSettings()" aria-label="Ustawienia">${gearSvg()}</button>
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
        <div class="add-row">
          <p class="points-preview">Punkty: <b>${pointsPreview}</b></p>
          <button class="btn-add" ${!state.lengthInput || state.saving ? "disabled" : ""} onclick="App.addCatch()">
            ${plusSvg()} Dodaj rybę
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
  `;

  if (state.showPasswordModal) {
    const pi = document.getElementById("password-input");
    if (pi) pi.focus();
  }
}

// ---------- ikony (inline SVG, bez zależności) ----------
function fishSvg(size = 24, color = "#1F3A34") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6-3.56 0-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3c1.9-.24 3.7.75 4.4 2.7"/></svg>`;
}
function gearSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
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
function chevronDownSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
}
function chevronUpSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
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
  addCatch: guardedAction(addCatch),
  deleteCatch: guardedAction(deleteCatch),
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
