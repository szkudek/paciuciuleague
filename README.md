# Wodery PACIUCIU i Pstrągi 🎣

Aplikacja do rywalizacji wędkarskiej. Wpisujecie długość złowionej ryby, aplikacja
liczy punkty (długość w cm ÷ 10) i zapisuje wynik. Dane są wspólne dla obu wędkarzy —
niezależnie od telefonu.

Poniżej pełna instrukcja, jak uruchomić to jako prawdziwą aplikację na telefonie
(GitHub Pages + instalacja na ekranie głównym). Zajmie to około 10-15 minut,
robicie to **raz**.

---

## Krok 1 — załóż darmowe konto na jsonbin.io (baza danych)

To tu będą się zapisywać Wasze wyniki (w chmurze, współdzielone).

1. Wejdź na **https://jsonbin.io** i kliknij "Sign Up" (możesz przez Google).
2. Po zalogowaniu kliknij **"Create Bin"**.
3. W polu z zawartością wpisz po prostu: `{}` i kliknij **Create**.
4. Na górze strony zobaczysz **Bin ID** (długi ciąg znaków) — skopiuj go.
5. Kliknij w swój profil (prawy górny róg) → **"API Keys"** → skopiuj klucz
   oznaczony jako **X-Master-Key**.

Zapisz sobie gdzieś te dwie wartości (Bin ID i X-Master-Key) — będą potrzebne za chwilę.

> Uwaga: to darmowy, prosty serwis do przechowywania małej ilości danych (idealny do
> tego typu apki dla dwóch osób). Klucz API będzie widoczny w publicznym kodzie na
> GitHub — to nie jest w pełni bezpieczne, ale ponieważ dane to tylko wyniki wędkarskie
> (nic wrażliwego), to akceptowalne ryzyko.

## Krok 2 — wpisz dane do pliku `config.js`

Otwórz plik `config.js` (z tego paczki plików) i zamień:

```js
window.APP_CONFIG = {
  JSONBIN_BIN_ID: "WKLEJ_TU_BIN_ID",
  JSONBIN_API_KEY: "WKLEJ_TU_X_MASTER_KEY",
};
```

na swoje wartości z kroku 1, np.:

```js
window.APP_CONFIG = {
  JSONBIN_BIN_ID: "65f1a2b3c4d5e6f7",
  JSONBIN_API_KEY: "$2a$10$abcdefghijklmnop...",
  EDIT_PASSWORD: "pstrag2026",
};
```

`EDIT_PASSWORD` to hasło, które będzie wymagane przy próbie dodania/usunięcia ryby,
zmiany imion lub resetu danych (samo **oglądanie** wyników nie wymaga hasła — możecie
np. pokazać wynik znajomym bez logowania). Ustawcie coś prostego do zapamiętania —
to zabezpieczenie przed przypadkowymi gośćmi, a nie przed kimś naprawdę
zdeterminowanym (kod strony jest publiczny na GitHub, więc to nie jest twierdza nie
do zdobycia — chodzi o odstraszenie przypadkowych osób, które trafią na link).

Zapisz plik.

## Krok 3 — załóż repozytorium na GitHub

1. Wejdź na **https://github.com** i załóż konto (jeśli nie masz).
2. Kliknij **"New repository"**.
3. Nazwa np. `wodery-paciuciu`, ustaw jako **Public**, kliknij **Create repository**.
4. Na stronie repozytorium kliknij **"uploading an existing file"** (albo
   "Add file" → "Upload files").
5. Wgraj **wszystkie pliki z tej paczki**:
   - `index.html`
   - `config.js` (już z Waszymi danymi z kroku 2!)
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `service-worker.js`
   - `icon-192.png`
   - `icon-512.png`
6. Kliknij **"Commit changes"**.

## Krok 4 — włącz GitHub Pages

1. W repozytorium wejdź w **Settings** (zakładka na górze).
2. W menu po lewej kliknij **Pages**.
3. Przy "Branch" wybierz **main** i folder **/(root)**, kliknij **Save**.
4. Poczekaj około minuty. Strona pojawi się pod adresem:
   ```
   https://TWOJA-NAZWA-UZYTKOWNIKA.github.io/wodery-paciuciu/
   ```
   (zobaczysz ten adres też w zakładce Pages, gdy będzie gotowy).

## Krok 5 — zainstaluj na telefonie

Wyślij ten link koledze (SMS/WhatsApp), niech każdy zrobi to samo na swoim telefonie:

**Android (Chrome):**
1. Otwórz link.
2. Menu (trzy kropki) → **"Dodaj do ekranu głównego"** / **"Zainstaluj aplikację"**.

**iPhone (Safari):**
1. Otwórz link.
2. Przycisk udostępniania (kwadrat ze strzałką) → **"Dodaj do ekranu początkowego"**.

Od teraz na ekranie głównym macie ikonkę z rybką — otwiera się jak normalna apka,
bez paska adresu przeglądarki.

---

## Jak to działa

- Każda złowiona ryba jest zapisywana z długością, punktami (długość ÷ 10) i datą dnia
  połowów.
- Dane synchronizują się automatycznie co ok. 15 sekund między Waszymi telefonami
  (i od razu po dodaniu/usunięciu ryby).
- Imiona zawodników i reset danych — ikona koła zębatego w prawym górnym rogu.
- Każda próba zapisu (dodanie ryby, usunięcie, zmiana imion, reset) poprosi o hasło
  ustawione w `config.js`. Wystarczy wpisać je raz na danym telefonie — aplikacja
  zapamięta odblokowanie do zamknięcia karty przeglądarki.

## Co się dzieje, gdy jsonbin.io nie odpowiada

Aplikacja ma dwie warstwy zabezpieczenia na wypadek awarii serwisu:

1. **Automatyczna lokalna kopia** — każdy zapis i odczyt trzyma się też lokalnie w
   przeglądarce telefonu. Jeśli jsonbin akurat nie odpowiada, zobaczysz baner
   "Tryb offline" i aplikację dalej działającą na ostatniej znanej wersji danych.
   Gdy połączenie wróci, aplikacja sama dośle zaległe zmiany.
2. **Ręczna kopia zapasowa (zalecane po każdym sezonie/wyjeździe)** — w ustawieniach
   (ikona koła zębatego) jest przycisk **"Pobierz kopię zapasową (.json)"**. Zapisuje
   plik na telefon/komputer. W razie totalnej utraty danych w jsonbin, przyciskiem
   **"Przywróć z pliku…"** wczytujecie ten plik z powrotem.

   Warto robić taki eksport raz na jakiś czas (np. po każdym wspólnym wyjeździe) i
   trzymać plik np. w mailu albo na dysku Google — to Wasza prawdziwa "polisa
   ubezpieczeniowa" na wypadek gdyby jsonbin.io zniknął na dobre.

## Aktualizacja aplikacji w przyszłości

Jeśli będziecie chcieli coś zmienić (np. inny wzór na punkty), wróć do mnie w Claude,
zmienię pliki, a Ty podmienisz je w tym samym repozytorium na GitHub (Add file →
Upload files → nadpisz istniejące). Strona zaktualizuje się automatycznie.
