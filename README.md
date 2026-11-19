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
3. Push na `main` uruchamia testy i deploy Workera (`pl3y-mafia`). Adres Workera (`https://pl3y-mafia.<subdomena>.workers.dev`) wpisz w `js/config.js` jako `API`.
4. Włącz GitHub Pages dla repo. Gra pojawi się pod `https://pl3y.pl/mafia/`.

## Testy

- Silnik i protokół: `node --test worker/test/engine.test.js` (CI) albo `worker/test/run.html` w przeglądarce.
- Pełne gry przez interfejs: `http://localhost:8080/dev/e2e.html?n=7&games=2`.

## Podgląd testowy (gra w pojedynkę)

`https://pl3y.pl/mafia/dev/podglad.html` — ekran TV i 5–16 „telefonów” na jednej stronie, w trybie lokalnym (bez serwera). Boty mogą grać telefonami („Ruch botów”, „Boty grają same”), a „TV też automatycznie” prowadzi całą grę. Wybierz „Twój telefon”, żeby grać jednym z nich samemu. `?demo` włącza oba tryby automatyczne od razu.
