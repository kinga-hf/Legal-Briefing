# Legal Opposition Summarizer & Briefing Tool

## Stan projektu

Projekt jest aplikacją Next.js z App Routerem, Tailwind CSS i integracją z Google Gemini (`gemini-2.5-flash`). Aktualny stan został zapisany w plikach projektu.

## Najważniejsze funkcje

- Analiza polskiego pisma procesowego z rozbudowanym promptem dotyczącym KPC.
- Wynik analizy w ustrukturyzowanym JSON-ie:
  - główne tezy,
  - zarzuty formalne i materialne,
  - kontrargumenty procesowe,
  - wnioski procesowe,
  - checklista dla prawnika.
- Obsługa plików PDF, TXT, MD i JSON.
- Automatyczne wydobywanie tekstu z PDF przez `pdf-parse`.
- Podgląd PDF po lewej stronie oraz panel analizy po prawej stronie.
- Zmiana szerokości paneli przez splitter.
- Odnośniki do stron PDF i podświetlanie cytowanego fragmentu.
- Zakładka „Czat prawniczy” z dostępem do analizowanego dokumentu.
- Tryby czatu:
  - Strateg Procesowy,
  - Adwokat Diabła,
  - Legal Design.
- Smart Chips do szybkich poleceń: kwoty i roszczenia, dane identyfikacyjne, sprzeczności, siła argumentów, pytania do świadków, terminy i rygory oraz prosty język dla klienta.
- Formatowanie odpowiedzi czatu Markdown przez `react-markdown` i `remark-gfm`.
- Motyw wizualny: głęboki granat, złote akcenty i logo helpfind.

## Eksport PDF

Raporty są generowane bezpośrednio jako pliki PDF przez `pdfmake`, a nie jako zrzut ekranu ani okno drukowania.

Eksport:

- pobiera plik bezpośrednio,
- używa białego tła i czarnego tekstu,
- ma formalną typografię i numerację stron,
- nie zawiera przycisków, badge'y, odnośników stron ani checklisty.

Eksport działa osobno dla analizy i czatu.

## Zabezpieczenia API

- Wspólny moduł bezpieczeństwa znajduje się w `app/api/_safety.ts`.
- Maksymalna liczba kroków/ponowień agenta: `MAX_STEPS = 5`.
- Domyślny timeout zapytań AI: 30 sekund.
- Timeout pełnej analizy pisma: 120 sekund.
- Limit kontekstu: 120 000 znaków.
- Obsługiwane błędy: rate limit 429, zbyt długi kontekst 400, timeouty, błędy sieciowe i błędne odpowiedzi modelu.
- Błędy API mają jednolity format:

```json
{
  "success": false,
  "errorType": "...",
  "userMessage": "..."
}
```

- Frontend pokazuje czytelny alert i blokuje przyciski podczas ładowania, aby zapobiec wielokrotnym żądaniom.

## Najważniejsze pliki

- `app/page.tsx` - główny interfejs analizy i czatu.
- `app/briefing-context.tsx` - współdzielenie tekstu pisma między zakładkami.
- `app/pdf-document-viewer.tsx` - podgląd i obsługa cytowań PDF.
- `app/api/analyze/route.ts` - analiza pisma przez Gemini.
- `app/api/chat/route.ts` - czat z Gemini.
- `app/api/extract-pdf/route.ts` - wydobywanie tekstu z PDF.
- `app/api/_safety.ts` - timeouty, limity, retry i format błędów.
- `app/globals.css` - motyw oraz reguły stylów drukowania.
- `public/helpfind-logo-v2.png` - logo aplikacji.
- `.env.local` - lokalny klucz `GEMINI_API_KEY`; pliku nie należy publikować.

## Uruchomienie

W folderze projektu:

```bash
npm install
npm run dev
```

Następnie otwórz: `http://localhost:3000`

## Integracja z Supabase

- Dodano logowanie i rejestrację kont w `app/auth/page.tsx`.
- Aplikacja wymaga zalogowania, a użytkownik może wylogować się z nagłówka.
- Dodano klienty Supabase dla przeglądarki i serwera w `lib/supabase/` oraz odświeżanie sesji w `proxy.ts`.
- Przygotowano endpointy do zapisu i odczytu spraw oraz historii czatu:
  - `app/api/cases/route.ts`
  - `app/api/cases/[id]/route.ts`
  - `app/api/cases/[id]/messages/route.ts`
- Dodano `supabase/schema.sql` z tabelami `cases`, `chat_messages`, indeksami i politykami RLS, aby każdy użytkownik widział wyłącznie swoje dane.
- Po uruchomieniu schematu SQL w Supabase analiza będzie zapisywać sprawy, a czat — wiadomości powiązane z daną sprawą.
- W `.env.local` skonfigurowano zmienne `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` i `SUPABASE_SECRET_KEY`. Klucze pozostają lokalne i nie powinny być publikowane.

## Oryginalne pliki PDF w Supabase Storage

- Kolumna `file_url` w tabeli `cases` przechowuje publiczny adres oryginalnego pliku PDF.
- Bucket `case-files` jest tworzony przez `supabase/schema.sql` i przeznaczony dla plików PDF spraw.
- Po kliknięciu zapisanej sprawy przywracane są analiza, tekst, historia czatu i podgląd PDF.
- Podczas wczytywania sprawy podgląd pokazuje spinner.

## Usuwanie historii

- Przycisk kosza przy zapisanej sprawie usuwa sprawę, wiadomości czatu i powiązany plik PDF z Storage.
- Przycisk „Wyczyść” w czacie usuwa historię rozmowy zapisanej dla aktywnej sprawy.
- Usunięcie wymaga potwierdzenia i dotyczy wyłącznie danych zalogowanego użytkownika.

## Fiszka na rozprawę / Court Card

- Analiza Gemini zwraca dodatkowe pole `courtCard` z istotą sporu, trzema słabymi punktami, szybkimi ripostami i pytaniami do świadków.
- Wynik zapisuje się razem z pełnym obiektem analizy w tabeli `cases`.
- Przycisk „📱 Fiszka na Rozprawę” otwiera czytelny modal mobilny.
- Modal pozwala skopiować treść oraz wydrukować fiszkę na białym tle.

## Nazewnictwo trybów czatu

- Analiza Taktyczna i Proceduralna
- Krytyczna Ocena Ryzyka (Słabe Punkty)
- Podsumowanie dla Klienta (Plain Language)

## Weryfikacja

Ostatnia kompilacja produkcyjna `npm run build` zakończyła się pomyślnie.
