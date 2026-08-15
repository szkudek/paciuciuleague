# Wodery PACIUCIU i Pstrągi 🎣

Aplikacja do rywalizacji wędkarskiej. Wpisujecie długość złowionej ryby, aplikacja
liczy punkty (długość w cm ÷ 10) i zapisuje wynik. Dane są wspólne dla obu wędkarzy —
niezależnie od telefonu, synchronizują się na żywo.

Poniżej pełna instrukcja, jak uruchomić to jako prawdziwą aplikację na telefonie
(GitHub Pages + instalacja na ekranie głównym). Zajmie to około 15-20 minut,
robicie to **raz**.

---

## Krok 1 — załóż darmowy projekt Firebase (baza danych)

To tu będą się zapisywać Wasze wyniki (w chmurze, współdzielone, synchronizacja na żywo).
Firebase to usługa Google, darmowa przy takiej skali użycia i limity odnawiają się
codziennie (w przeciwieństwie do wcześniej rozważanego jsonbin.io, gdzie pula
zapytań była jednorazowa).

1. Wejdź na **https://console.firebase.google.com** i zaloguj się kontem Google.
2. Kliknij **"Add project" / "Utwórz projekt"**. Nazwa dowolna, np. `wodery-paciuciu`.
3. Możesz wyłączyć Google Analytics dla tego projektu (niepotrzebne) — kliknij
   "Create project" / "Utwórz projekt".
4. Gdy projekt się utworzy, w menu po lewej wejdź w **Build → Firestore Database**.
5. Kliknij **"Create database"**. Wybierz lokalizację (najbliższa Wam, np. europe-west),
   kliknij dalej.
6. Przy wyborze reguł bezpieczeństwa wybierz **"Start in test mode"** — do tego i tak
   za chwilę wrócimy, żeby ustawić reguły na stałe (test mode wygasa po 30 dniach).
7. Wejdź w zakładkę **Rules** (reguły) w Firestore i zamień całą zawartość na:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   Kliknij **Publish**. (To ustawia bazę jako otwartą do odczytu/zapisu — tak jak
   przy jsonbin, konfiguracja jest w publicznym kodzie na GitHub, więc to nie jest
   pełne zabezpieczenie, ale przy wynikach wędkarskich to akceptowalne ryzyko —
   dodatkowo macie już hasło w aplikacji przy każdej zmianie danych.)

## Krok 2 — pobierz dane konfiguracyjne aplikacji webowej

1. W konsoli Firebase kliknij ikonę zębatki obok "Project Overview" → **"Project settings"**.
2. Zjedź do sekcji **"Your apps"**, kliknij ikonę **`</>`** (Web).
3. Nadaj nazwę aplikacji (dowolna, np. "Pstrągi"), **NIE** zaznaczaj Firebase Hosting
   (używamy GitHub Pages), kliknij **"Register app"**.
4. Zobaczysz blok kodu z obiektem `firebaseConfig` — będzie wyglądał mniej więcej tak:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "wodery-paciuciu.firebaseapp.com",
     projectId: "wodery-paciuciu",
     storageBucket: "wodery-paciuciu.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456",
   };
   ```
   Skopiuj sobie te wartości — będą potrzebne za chwilę.

## Krok 3 — wpisz dane do pliku `config.js`

Otwórz plik `config.js` (z tej paczki plików) i wklej swoje wartości z kroku 2 oraz
ustaw własne hasło:

```js
window.APP_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSy...",
    authDomain: "wodery-paciuciu.firebaseapp.com",
    projectId: "wodery-paciuciu",
    storageBucket: "wodery-paciuciu.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456",
  },
  EDIT_PASSWORD: "pstrag2026",
};
```

`EDIT_PASSWORD` to hasło, które będzie wymagane przy próbie dodania/usunięcia ryby,
zmiany imion lub resetu danych (samo **oglądanie** wyników nie wymaga hasła — możecie
np. pokazać wynik znajomym bez logowania). Ustawcie coś prostego do zapamiętania —
to zabezpieczenie przed przypadkowymi gośćmi, a nie przed kimś naprawdę
zdeterminowanym.

Zapisz plik.

## Krok 4 — załóż repozytorium na GitHub

1. Wejdź na **https://github.com** i załóż konto (jeśli nie masz).
2. Kliknij **"New repository"**.
3. Nazwa np. `wodery-paciuciu`, ustaw jako **Public**, kliknij **Create repository**.
4. Na stronie repozytorium kliknij **"uploading an existing file"** (albo
   "Add file" → "Upload files").
5. Wgraj **wszystkie pliki z tej paczki**:
   - `index.html`
   - `config.js` (już z Waszymi danymi z kroku 3!)
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `service-worker.js`
   - `icon-192.png`
   - `icon-512.png`
6. Kliknij **"Commit changes"**.

## Krok 5 — włącz GitHub Pages

1. W repozytorium wejdź w **Settings** (zakładka na górze).
2. W menu po lewej kliknij **Pages**.
3. Przy "Branch" wybierz **main** i folder **/(root)**, kliknij **Save**.
4. Poczekaj około minuty. Strona pojawi się pod adresem:
   ```
   https://TWOJA-NAZWA-UZYTKOWNIKA.github.io/wodery-paciuciu/
   ```
   (zobaczysz ten adres też w zakładce Pages, gdy będzie gotowy).

## Krok 6 — zainstaluj na telefonie

Wyślij ten link koledze (SMS/WhatsApp), niech każdy zrobi to samo na swoim telefonie:

**Android (Chrome):**
1. Otwórz link.
2. Menu (trzy kropki) → **"Dodaj do ekranu głównego"** / **"Zainstaluj aplikację"**.

**iPhone (Safari):**
1. Otwórz link.
2. Przycisk udostępniania (kwadrat ze strzałką) → **"Dodaj do ekranu początkowego"**.

Od teraz na ekranie głównym macie ikonkę z rybką — otwiera się jak normalna apka,
bez paska adresu przeglądarki.

## Krok 7 — zdjęcia ryb (opcjonalnie)

Aplikacja pozwala dodać zdjęcie do każdej złowionej ryby. Żeby to działało, potrzebny
jest darmowy klucz do **imgbb.com** (zdjęcia są tam hostowane, w bazie Firebase
zapisuje się tylko link do zdjęcia, nie samo zdjęcie — dzięki temu baza pozostaje
mała i szybka).

Jeśli nie zależy Wam na zdjęciach, spokojnie pomińcie ten krok — reszta aplikacji
działa normalnie, tylko przy dodawaniu ryby nie będzie można dołączyć fotki.

1. Wejdź na **https://api.imgbb.com/** i zaloguj się (może być przez Google).
2. Skopiuj swój **API key** (będzie widoczny na stronie po zalogowaniu).
3. Wklej go w `config.js` w polu `imgbbApiKey`.
4. Wgraj zaktualizowany `config.js` na GitHub (tak jak w Kroku 5 — Add file → Upload
   files → nadpisz istniejący plik).

Zdjęcia są automatycznie kompresowane w telefonie przed wysłaniem (do ok. 900px,
jakość ~65%), więc nie zajmują dużo miejsca ani u Was, ani na imgbb.

---

## Jak to działa

- Każda złowiona ryba jest zapisywana z długością, punktami (długość ÷ 10), datą,
  a opcjonalnie też gatunkiem, miejscem połowu i zdjęciem.
- Dane synchronizują się **na żywo** — Firebase wysyła zmiany do obu telefonów niemal
  natychmiast, bez czekania na odpytywanie w tle.
- **Personal Best** — osobne, ręcznie edytowalne pole dla każdego zawodnika (ikona
  ołówka), niezależne od bieżącego sezonu — to Wasz rekord życiowy.
- **Pula sezonu** — każdy dzień, który rozpoczniecie jako nowy dzień połowów, dolicza
  10 zł do puli (po 5 zł od każdego). Karta pokazuje aktualną kwotę i kto by ją
  zgarnął, gdyby sezon skończył się dziś.
- **Motyw jasny/ciemny** — ikona słońca/księżyca w nagłówku. Aplikacja domyślnie
  dopasowuje się do ustawień telefonu, a wybór zapamiętuje na tym urządzeniu.
- Imiona zawodników i reset danych — ikona koła zębatego w prawym górnym rogu.
- Każda próba zapisu (dodanie ryby, usunięcie, zmiana imion, reset) poprosi o hasło
  ustawione w `config.js`. Wystarczy wpisać je raz na danym telefonie — aplikacja
  zapamięta odblokowanie do zamknięcia karty przeglądarki.

## Dlaczego Firebase, a nie jsonbin.io

Wcześniej korzystaliśmy z jsonbin.io, ale ich darmowy plan daje tylko **10 000
zapytań jednorazowo** (nie odnawia się co miesiąc) — przy synchronizacji w tle
mogłoby się to wyczerpać w ciągu jednego-dwóch sezonów. Firebase (Spark, darmowy
plan) daje **50 000 odczytów i 20 000 zapisów dziennie**, co odnawia się codziennie —
przy dwuosobowej rywalizacji wędkarskiej praktycznie nie do wyczerpania.

## Co się dzieje, gdy internet/Firebase nie odpowiada

Aplikacja ma dwie warstwy zabezpieczenia na wypadek braku połączenia:

1. **Automatyczna lokalna kopia** — każdy zapis i odczyt trzyma się też lokalnie w
   przeglądarce telefonu. Jeśli akurat nie ma połączenia, zobaczysz baner
   "Tryb offline" i aplikację dalej działającą na ostatniej znanej wersji danych.
   Gdy połączenie wróci, Firebase samo dośle zaległe zmiany w tle.
2. **Ręczna kopia zapasowa (zalecane po każdym sezonie/wyjeździe)** — w ustawieniach
   (ikona koła zębatego) jest przycisk **"Pobierz kopię zapasową (.json)"**. Zapisuje
   plik na telefon/komputer. W razie totalnej utraty danych, przyciskiem
   **"Przywróć z pliku…"** wczytujecie ten plik z powrotem.

   Warto robić taki eksport raz na jakiś czas (np. po każdym wspólnym wyjeździe) i
   trzymać plik np. w mailu albo na dysku Google — to Wasza prawdziwa "polisa
   ubezpieczeniowa" na wszelki wypadek.

## Aktualizacja aplikacji w przyszłości

Jeśli będziecie chcieli coś zmienić, wróć do mnie w Claude, zmienię pliki, a Ty
podmienisz je w tym samym repozytorium na GitHub (Add file → Upload files →
nadpisz istniejące). Strona zaktualizuje się automatycznie.
