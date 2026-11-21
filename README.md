# PL3Y · Mafia

Gra towarzyska dla 5–16 osób: ekran główny (TV/laptop) prowadzi grę, gracze dołączają telefonami przez kod QR, tajnie poznają role i nocą działają na swoich telefonach.

## Uruchomienie lokalne (bez serwera)

```
powershell -ExecutionPolicy Bypass -File dev\serve.ps1
```

Otwórz `http://localhost:8080/` (ekran główny), a graczy w kolejnych kartach tej samej przeglądarki (link pod kodem QR). Gdy `API` w `js/config.js` jest puste, serwer gry działa w przeglądarce.

## Wdrożenie

1. Załóż darmowe konto Cloudflare. Utwórz token API z uprawnieniem „Edit Cloudflare Workers” i zanotuj Account ID.
2. W repozytorium GitHub (`egozaur/mafia`) dodaj sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`.
3. Push na `main` uruchamia testy i deploy Workera (`pl3y-server`). Adres Workera (`https://pl3y-server.<subdomena>.workers.dev`) wpisz w `js/config.js` jako `API`.
4. Włącz GitHub Pages dla repo. Gra pojawi się pod `https://pl3y.pl/mafia/`.

## Hasło i sesje (sekrety Cloudflare)

Hasło do PL3Y sprawdza Worker. Ustaw sekrety (w katalogu `worker/`, po wdrożeniu Workera):

```
cd worker
npx wrangler secret put PL3Y_PASSWORD       # nowe, długie hasło (jawnym tekstem, tylko w sekrecie)
npx wrangler secret put PL3Y_TOKEN_SECRET   # losowy klucz podpisu, np. wynik: openssl rand -base64 48
npx wrangler secret put PL3Y_TEST_SECRET    # losowy sekret do testów E2E z localhost (opcjonalny)
```

Albo w panelu: Cloudflare → Workers & Pages → `pl3y-server` → Settings → Variables and Secrets.

Tryb bramki to zmienna `AUTH_MODE` w `worker/wrangler.toml`. Domyślnie jest `required` (bez ważnego tokena 401; brak sekretów = 503, serwer nigdy nie zostaje otwarty). Do wdrożenia stopniowego ustaw `optional` (token sprawdzany tylko, gdy jest) albo `off` (bramka wyłączona), wdróż, a po sprawdzeniu wróć do `required`. Zmiana hasła: ponownie `wrangler secret put PL3Y_PASSWORD`. Wylogowanie wszystkich: zmień `PL3Y_TOKEN_SECRET`.

Kolejność wdrożenia przy `required`: 1) sekrety, 2) strony (lobby i wszystkie gry, żeby klienci umieli się zalogować), 3) Worker (push na `main` w `mafia`). Strony ze starym kodem po włączeniu `required` przestają łączyć się z serwerem, więc nie odwracaj kolejności. Sprawdzenie po wdrożeniu: `curl -i -X POST https://pl3y-server.pl3y.workers.dev/api/rooms -H "Origin: https://pl3y.pl"` ma dać 401, a logowanie w lobby 200.

## Gracze: nick + PIN, reset PIN-u przez Discord

Gracze PL3Y mają nick zarezerwowany 4-cyfrowym PIN-em (bez kont i e-maili, `worker/src/players.js`).
Gdy gracz zapomni PIN i kliknie „Nie pamiętam PIN-u”, Worker wysyła na Discorda wiadomość z linkiem
„Reset”. Otwierasz link, klikasz **Resetuj PIN**, a gracz przy następnym wejściu ustawia nowy.

Jednorazowa konfiguracja powiadomień:

1. Discord → ustawienia kanału → Integracje → Webhooki → Nowy webhook → **Kopiuj adres URL webhooka**.
2. `cd worker && npx wrangler secret put PL3Y_DISCORD_WEBHOOK` i wklej adres (albo w panelu Cloudflare:
   Workers → pl3y-server → Settings → Variables and Secrets → Add → Secret).

Bez tego sekretu prośby o reset nigdzie nie trafiają (gracz widzi „Prośba wysłana”, ale nic nie przychodzi).
Link resetu jest podpisany (`PL3Y_TOKEN_SECRET`) i ważny 7 dni; podgląd linku w Discordzie niczego nie resetuje,
dopiero przycisk na stronie. Jedna prośba na nick na godzinę.

Opcjonalnie `PL3Y_WORDLE_SECRET`: ustala kolejność słów dnia w Wordle. Bez niego używany jest `PL3Y_TOKEN_SECRET`,
więc „wylogowanie wszystkich” (zmiana `PL3Y_TOKEN_SECRET`) zmieni też dzisiejsze słowo i unieważni zalogowania nickiem.

## Testy

- Silnik i protokół: `node --test worker/test/engine.test.js` (CI) albo `worker/test/run.html` w przeglądarce.
- Pełne gry przez interfejs: `http://localhost:8080/dev/e2e.html?n=7&games=2`.

## Podgląd testowy (gra w pojedynkę)

`https://pl3y.pl/mafia/dev/podglad.html` — ekran TV i 5–16 „telefonów” na jednej stronie, w trybie lokalnym (bez serwera). Boty mogą grać telefonami („Ruch botów”, „Boty grają same”), a „TV też automatycznie” prowadzi całą grę. Wybierz „Twój telefon”, żeby grać jednym z nich samemu. `?demo` włącza oba tryby automatyczne od razu.
