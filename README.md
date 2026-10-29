# Ofertownik Eltron – wersja demonstracyjna

Aplikacja do wycen i ofert dla handlowców (Next.js 14, NextAuth, PostgreSQL/Neon, Tailwind).
Wersja demo nie wymaga rejestracji ani haseł: na ekranie startowym wybierasz użytkownika, a rolę możesz
zmienić w każdej chwili w prawym górnym rogu.

## Uruchomienie

1. `cp .env.example .env.local` i wpisz `DATABASE_URL` (np. z Neon) oraz dowolny `NEXTAUTH_SECRET`.
2. `npm install`
3. `npm run dev` i otwórz http://localhost:3000
4. Na ekranie logowania kliknij **Przygotuj dane demo** (tworzy tabele i wgrywa dane – ok. 10 s).

Schemat bazy jest w `database-schema.sql` (idempotentny – bezpieczny na istniejącej bazie). Po jego zmianie
uruchom `npm run gen:schema`. Kliknięcie „Przygotuj dane demo” wgrywa dane **tylko do pustej bazy**.
Pełny reset (kasuje wszystko!) jest w panelu *Zespół* dla roli Zarząd.

Baza ze starszej wersji aplikacji jest uzupełniana automatycznie (kolumny i tabele, bez kasowania danych).
Gdy coś zwraca błędy 500, otwórz `/api/health` – pokaże połączenie z bazą, stan schematu i błędy ostatniej migracji
(w odpowiedziach 500 w trybie demo jest też pole `detail` z komunikatem bazy).

## Role w demo

| Rola | Co widzi |
|---|---|
| Handlowiec (4 osoby, regiony) | tylko swoje oferty i klientów; marże tylko podczas wyceny; oferta z niską marżą trafia do akceptacji |
| Zarząd | wszystko, marże i zyski, akceptuje niskie marże, zespół i cele, reset demo |
| Centrum Elektryczne | podgląd całej firmy i marż, import cennika; nie akceptuje marż |
| Budowy | jak handlowiec |

## Funkcje

- **Lejek ofert** – tablica kanban, przeciąganie kart zmienia status (z powodem odrzucenia).
- **Akceptacja niskiej marży** – serwer sam przelicza ceny i sumy; marża < 10% (lub pozycja < 5%) blokuje wysyłkę do decyzji zarządu.
- **Oferty** – wyszukiwanie, filtry, sortowanie, edycja, kopiowanie, szablony, porównanie dwóch ofert, historia zmian i komentarze.
- **Wysyłka i link dla klienta** – publiczna strona `/o/<token>`, na której klient ogląda ofertę i akceptuje/odrzuca ją jednym kliknięciem;
  system pokazuje, że klient ją otworzył. Wysyłka e-mailem jest symulowana (nic nie wychodzi na zewnątrz).
- **Zadania i przypomnienia** – follow-up po wysłaniu oferty, podpowiedzi „warto zadzwonić”, powiadomienia (dzwonek).
- **Klienci** – karta klienta z historią ofert, kontaktami (telefon, spotkanie, e-mail), rabatami indywidualnymi.
- **Produkty** – katalog, ceny, import cennika z CSV/Excela, eksport.
- **Analityka** – sprzedaż miesięczna, skuteczność, lejek ważony, cel miesięczny, ranking zespołu, regiony, przyczyny przegranych, trend marży.
- **Kalendarz** – zadania, terminy kontaktu i wygasanie ofert w widoku miesiąca (zarząd może zobaczyć cały zespół).
- **Segmenty klientów** – aktywni, uśpieni, do reaktywacji, bez ofert, VIP; przycisk „Przypomnij o kontakcie” tworzy zadanie; import klientów z CSV.
- **Akcje zbiorcze na ofertach** – zaznacz wiele ofert: zmiana statusu, +14 dni ważności, usunięcie (z pominięciem cudzych i czekających na akceptację).
- **Prognoza sprzedaży** – otwarty lejek ważony skutecznością, rozłożony na 3 miesiące.
- **Aktywność** – strumień zdarzeń na ofertach z filtrami (statusy, odpowiedzi klientów, otwarcia, akceptacje).
- **Wyszukiwarka globalna** – `Ctrl+K`.
- **Eksport CSV** – oferty, klienci, produkty (otwiera się w Excelu).

## Proponowany scenariusz pokazu (10 minut)

1. Wejdź jako **Anna Nowak (handlowiec)** → pulpit, cel miesięczny, zadania na dziś.
2. *Nowa oferta* → wybierz klienta → wczytaj szablon → zmień ilości → obniż cenę mocno → *Zapisz i wyślij*:
   oferta wraca jako szkic i czeka na akceptację zarządu.
3. Przełącz na **Katarzyna Lewandowska (zarząd)** → dzwonek i zakładka *Akceptacje* → zobacz marże pozycji → zaakceptuj.
4. Wróć na Annę → wyślij ofertę e-mailem → skopiuj link → otwórz go w oknie prywatnym jako klient i zaakceptuj.
5. Na Annie: *Lejek ofert* – oferta sama przeszła do „Zaakceptowana”; w historii widać wszystkie kroki.
6. Jako zarząd: *Analityka* i *Zespół*. Porównaj z widokiem handlowca (brak marż, tylko swoje dane).

## Ograniczenia wersji demo

- Rejestracja i zwykłe logowanie hasłem zostały w kodzie, ale nie są używane. Nie wyłączaj `DEMO_MODE` bez wcześniejszego
  ograniczenia wyboru roli przy rejestracji (obecnie każdy z domeną @eltron.pl może wybrać rolę „zarząd”).
- Maile nie są wysyłane, PDF to wersja HTML do druku.
