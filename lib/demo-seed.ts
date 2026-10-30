// lib/demo-seed.ts
// Tworzy schemat i (opcjonalnie) wypełnia bazę realistycznymi danymi demo.
// Dane są deterministyczne (stałe ziarno), więc po resecie demo wygląda zawsze tak samo.
import crypto from 'crypto';
import { db } from './db';
import { runSchema } from './schema-guard';
import { computeOffer, round2 } from './offer-calc';
import { availabilityFor, suggestSegment } from './offer-rules';

export async function ensureSchema() {
  await runSchema();
}

type Q = { query: (text: string, params?: any[]) => Promise<any> };

// ---------- narzędzia ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ts = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function bulk(q: Q, table: string, cols: string[], rows: any[][], returning?: string): Promise<any[]> {
  const out: any[] = [];
  if (rows.length === 0) return out;
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: any[] = [];
    const values = part
      .map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')')
      .join(',');
    const res = await q.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values}${returning ? ` RETURNING ${returning}` : ''}`,
      params
    );
    if (returning) out.push(...res.rows);
  }
  return out;
}

// ---------- dane słownikowe ----------

const PERSONAS = [
  // Cele dobrane do skali danych demo (ok. 30-60 tys. zł zaakceptowanej sprzedaży netto miesięcznie na handlowca)
  { first: 'Anna', last: 'Nowak', role: 'handlowiec', region: 'Mazowiecki', target: 45000, offset: 3 },
  { first: 'Piotr', last: 'Kowalski', role: 'handlowiec', region: 'Śląski', target: 55000, offset: -2 },
  { first: 'Marta', last: 'Wiśniewska', role: 'handlowiec', region: 'Pomorski', target: 60000, offset: 0 },
  { first: 'Tomasz', last: 'Zieliński', role: 'handlowiec', region: 'Podlaski', target: 25000, offset: 1 },
  { first: 'Katarzyna', last: 'Lewandowska', role: 'zarząd', region: null, target: 0, offset: 0 },
  { first: 'Marek', last: 'Wójcik', role: 'centrum elektryczne', region: null, target: 0, offset: 5 },
  { first: 'Jan', last: 'Dąbrowski', role: 'budowy', region: null, target: 0, offset: -1 },
];

// name, unit, category, sku, cost, base markup %
const PRODUCTS: Array<[string, string, string, string, number, number]> = [
  ['Przewód YDY 3x1,5 mm² 450/750V', 'm', 'Kable i przewody', 'KB-YDY-3x15', 2.1, 32],
  ['Przewód YDY 3x2,5 mm² 450/750V', 'm', 'Kable i przewody', 'KB-YDY-3x25', 3.4, 31],
  ['Przewód YDY 5x2,5 mm² 450/750V', 'm', 'Kable i przewody', 'KB-YDY-5x25', 5.6, 30],
  ['Kabel ziemny YKY 4x16 mm²', 'm', 'Kable i przewody', 'KB-YKY-4x16', 21.5, 24],
  ['Kabel ziemny YKY 5x10 mm²', 'm', 'Kable i przewody', 'KB-YKY-5x10', 24.0, 24],
  ['Przewód H07V-K 1x2,5 mm² czarny', 'm', 'Kable i przewody', 'KB-H07-25', 1.65, 34],
  ['Kabel UTP kat. 6 (skrętka)', 'm', 'Kable i przewody', 'KB-UTP6', 1.4, 38],
  ['Rura osłonowa peszel 20 mm', 'm', 'Rury i osprzęt kablowy', 'RU-PESZ20', 0.95, 40],
  ['Korytko kablowe perforowane 100x60', 'm', 'Rury i osprzęt kablowy', 'RU-KOR-100', 14.5, 28],
  ['Kabel ziemny YKY 4x35 mm²', 'm', 'Kable i przewody', 'KB-YKY-4x35', 44.0, 23],
  ['Kabel ziemny YAKY 4x120 mm²', 'm', 'Kable i przewody', 'KB-YAKY-4x120', 41.0, 22],
  ['Rura osłonowa RHDPE 110 mm', 'm', 'Rury i osprzęt kablowy', 'RU-RHDPE-110', 6.8, 35],
  ['Rura karbowana DVK 75 mm', 'm', 'Rury i osprzęt kablowy', 'RU-DVK-75', 4.2, 38],
  ['Taśma ostrzegawcza do kabli niebieska (rolka 100 m)', 'szt', 'Rury i osprzęt kablowy', 'RU-TASMA-OST', 19.0, 45],
  ['Bednarka ocynkowana FeZn 30x4', 'm', 'Bednarki i uziemienia', 'BD-FEZN-30', 8.2, 28],
  ['Drut stalowy ocynkowany fi 8', 'm', 'Bednarki i uziemienia', 'BD-DRUT-8', 2.6, 30],
  ['Złączka krzyżowa do bednarki', 'szt', 'Bednarki i uziemienia', 'BD-ZLACZ-KRZ', 4.1, 45],
  ['Uziom pionowy 1,5 m ocynkowany', 'szt', 'Bednarki i uziemienia', 'BD-UZIOM-15', 22.0, 33],
  ['Mufa kablowa termokurczliwa 4x16-35', 'kpl', 'Osprzęt energetyczny', 'OE-MUFA-1635', 84.0, 34],
  ['Głowica kablowa wnętrzowa 4x16-35', 'kpl', 'Osprzęt energetyczny', 'OE-GLOW-1635', 48.0, 36],
  ['Końcówka kablowa Cu 16 mm² (zaprasowywana)', 'szt', 'Osprzęt energetyczny', 'OE-KONC-16', 1.8, 55],
  ['Złącze kablowe ZK-1c z fundamentem', 'szt', 'Osprzęt energetyczny', 'OE-ZK1C', 310.0, 28],
  ['Rozłącznik bezpiecznikowy NH00 3P', 'szt', 'Osprzęt energetyczny', 'OE-NH00-3P', 126.0, 29],
  ['Wkładka topikowa NH00 63A gG', 'szt', 'Osprzęt energetyczny', 'OE-WKL-NH00', 7.4, 45],
  ['Wyłącznik nadprądowy B16 1P', 'szt', 'Aparatura modułowa', 'AP-B16-1P', 9.8, 36],
  ['Wyłącznik nadprądowy B10 1P', 'szt', 'Aparatura modułowa', 'AP-B10-1P', 9.6, 36],
  ['Wyłącznik nadprądowy C25 3P', 'szt', 'Aparatura modułowa', 'AP-C25-3P', 58.0, 30],
  ['Wyłącznik różnicowoprądowy 25A/30mA 2P', 'szt', 'Aparatura modułowa', 'AP-RCD-25', 62.0, 30],
  ['Wyłącznik różnicowoprądowy 40A/30mA 4P', 'szt', 'Aparatura modułowa', 'AP-RCD-40', 118.0, 28],
  ['Rozłącznik izolacyjny 63A 3P', 'szt', 'Aparatura modułowa', 'AP-ROZ-63', 86.0, 29],
  ['Ogranicznik przepięć typ 1+2 4P', 'szt', 'Aparatura modułowa', 'AP-SPD-12', 420.0, 26],
  ['Stycznik modułowy 25A 2NO', 'szt', 'Aparatura modułowa', 'AP-STY-25', 74.0, 30],
  ['Gniazdo podtynkowe 2P+Z białe', 'szt', 'Osprzęt instalacyjny', 'OS-GN-2PZ', 6.8, 45],
  ['Łącznik jednobiegunowy biały', 'szt', 'Osprzęt instalacyjny', 'OS-LC-1', 5.9, 45],
  ['Gniazdo podwójne z ramką', 'szt', 'Osprzęt instalacyjny', 'OS-GN-DBL', 15.4, 42],
  ['Gniazdo komputerowe RJ45 kat. 6', 'szt', 'Osprzęt instalacyjny', 'OS-RJ45', 14.0, 40],
  ['Puszka podtynkowa fi 60', 'szt', 'Osprzęt instalacyjny', 'OS-PUSZ60', 0.9, 60],
  ['Złączka instalacyjna 3x2,5 (op. 50 szt.)', 'opak', 'Osprzęt instalacyjny', 'OS-WAGO3', 38.0, 35],
  ['Panel LED 60x60 40W 4000K', 'szt', 'Oświetlenie LED', 'OL-PAN-60', 78.0, 33],
  ['Oprawa hermetyczna LED 120 cm 36W', 'szt', 'Oświetlenie LED', 'OL-HERM-120', 64.0, 34],
  ['Żarówka LED E27 10W 3000K', 'szt', 'Oświetlenie LED', 'OL-E27-10', 5.2, 50],
  ['Taśma LED 12V 14,4W/m IP20', 'm', 'Oświetlenie LED', 'OL-TASMA', 11.0, 42],
  ['Naświetlacz LED 100W IP65', 'szt', 'Oświetlenie LED', 'OL-NAS-100', 69.0, 33],
  ['Oprawa uliczna LED 60W', 'szt', 'Oświetlenie LED', 'OL-ULICA-60', 245.0, 27],
  ['Oprawa specjalna wg projektu klienta (indywidualna)', 'szt', 'Oświetlenie LED', 'NE-OPRAWA-IND', 420.0, 30],
  ['Czujnik ruchu 360° ścienny', 'szt', 'Oświetlenie LED', 'OL-CZUJ-360', 29.0, 40],
  ['Rozdzielnica natynkowa 24 mod. IP40', 'szt', 'Rozdzielnice', 'RZ-NAT-24', 96.0, 32],
  ['Rozdzielnica podtynkowa 36 mod.', 'szt', 'Rozdzielnice', 'RZ-POD-36', 148.0, 31],
  ['Obudowa hermetyczna IP65 400x300', 'szt', 'Rozdzielnice', 'RZ-HERM-43', 210.0, 29],
  ['Szafa rozdzielcza 800x600x2000', 'szt', 'Rozdzielnice', 'RZ-SZAFA-86', 1180.0, 22],
  ['Sterownik PLC 24 I/O', 'szt', 'Automatyka', 'AU-PLC-24', 1450.0, 22],
  ['Falownik 2,2 kW 400V', 'szt', 'Automatyka', 'AU-FAL-22', 1380.0, 21],
  ['Softstart 11 kW', 'szt', 'Automatyka', 'AU-SOFT-11', 1950.0, 20],
  ['Zasilacz impulsowy 24V/10A DIN', 'szt', 'Automatyka', 'AU-ZAS-24', 265.0, 27],
  ['Przekaźnik czasowy wielofunkcyjny', 'szt', 'Automatyka', 'AU-PRZ-CZ', 82.0, 33],
  ['Przycisk sterowniczy zielony fi 22', 'szt', 'Automatyka', 'AU-PRZYC-Z', 18.5, 40],
  ['Panel fotowoltaiczny 450W mono', 'szt', 'Fotowoltaika i e-mobility', 'PV-PAN-450', 410.0, 18],
  ['Falownik PV 10 kW 3-fazowy', 'szt', 'Fotowoltaika i e-mobility', 'PV-FAL-10', 3950.0, 16],
  ['Konstrukcja montażowa PV (dach skośny)', 'kpl', 'Fotowoltaika i e-mobility', 'PV-KONS-S', 780.0, 22],
  ['Stacja ładowania EV 11 kW', 'szt', 'Fotowoltaika i e-mobility', 'EV-WALL-11', 2450.0, 20],
  ['Montaż i uruchomienie – robocizna', 'godz', 'Usługi', 'US-MONTAZ', 85.0, 35],
  ['Konstrukcja wsporcza wg rysunku klienta', 'kpl', 'Usługi', 'NE-KONSTR-IND', 640.0, 26],
  ['Pomiary elektryczne z protokołem', 'usł', 'Usługi', 'US-POMIARY', 320.0, 40],
];

// Producenci (do podpowiedzi RFQ i analiz) i bonusy zakupowe dostawców (%)
const MANUFACTURERS: Record<string, string[]> = {
  'Kable i przewody': ['TELE-FONIKA Kable', 'Elektrokabel', 'Nexans'],
  'Rury i osprzęt kablowy': ['Pawbol', 'Elektro-Plast', 'Kopos'],
  'Bednarki i uziemienia': ['Dehn', 'Elektromet', 'Zinkpol'],
  'Osprzęt energetyczny': ['Cellpack', 'Raychem', 'Apator'],
  'Osprzęt instalacyjny': ['Kontakt-Simon', 'Legrand', 'Schneider Electric'],
  'Aparatura modułowa': ['Eaton', 'Hager', 'ABB'],
  'Rozdzielnice': ['Hager', 'Elektro-Plast', 'ABB'],
  'Oświetlenie LED': ['LEDVANCE', 'Philips', 'Kanlux'],
  'Automatyka': ['Siemens', 'Schneider Electric', 'Eaton'],
  'Fotowoltaika i e-mobility': ['Huawei', 'Fronius', 'Jinko Solar'],
  'Usługi': ['Eltron Serwis'],
};
const BONUS: Record<string, number> = {
  'TELE-FONIKA Kable': 3.5, Elektrokabel: 2.5, Nexans: 3, Pawbol: 2, 'Elektro-Plast': 1.5, Kopos: 2, Dehn: 4, Elektromet: 2, Zinkpol: 1.5,
  Cellpack: 4.5, Raychem: 5, Apator: 3, 'Kontakt-Simon': 3, Legrand: 4, 'Schneider Electric': 4.5, Eaton: 5, Hager: 4, ABB: 5.5,
  LEDVANCE: 3, Philips: 3.5, Kanlux: 2.5, Siemens: 5, Huawei: 2, Fronius: 3, 'Jinko Solar': 2.5, 'Eltron Serwis': 0,
};
const PRODUCTION_NOTES = ['produkcja ok. 14 dni', 'produkcja ok. 3 tygodnie', 'dostawa od producenta 7 dni', 'dostawa od producenta 10 dni'];
const ITEM_NOTES = ['Kolor RAL 7035', 'Wymagany atest / certyfikat zgodności', 'Cięcie na bębny po 500 m', 'Dostawa partiami wg harmonogramu budowy', 'Wg specyfikacji klienta', 'Opakowanie zbiorcze na palecie'];
const COMPETITORS = ['Elektrohurt Plus', 'Kablex', 'Hurtownia Volt', 'Rynek Prądu', 'Instalmax'];
const PROJECT_TOPICS: Record<string, string[]> = {
  'Kable i przewody': ['Zasilanie kablowe', 'Okablowanie budynku', 'Linia kablowa nN'],
  'Rury i osprzęt kablowy': ['Kanalizacja kablowa', 'Trasy kablowe', 'Prowadzenie instalacji'],
  'Bednarki i uziemienia': ['Instalacja uziemiająca', 'Uziemienie i piorunochrony', 'Wyrównanie potencjałów'],
  'Osprzęt energetyczny': ['Przyłącze energetyczne', 'Stacja SN/nN – osprzęt', 'Modernizacja złączy kablowych'],
  'Osprzęt instalacyjny': ['Wyposażenie instalacji', 'Remont instalacji elektrycznej', 'Wykończenie biur'],
  'Aparatura modułowa': ['Modernizacja rozdzielni', 'Wymiana zabezpieczeń', 'Zabezpieczenia obwodów'],
  'Rozdzielnice': ['Rozdzielnice główne', 'Nowa rozdzielnia piętrowa', 'Szafy sterownicze'],
  'Oświetlenie LED': ['Modernizacja oświetlenia', 'Oświetlenie hali', 'Oświetlenie zewnętrzne'],
  Automatyka: ['Automatyka linii', 'Modernizacja sterowania', 'Napędy i falowniki'],
  'Fotowoltaika i e-mobility': ['Instalacja fotowoltaiczna', 'Stacje ładowania EV', 'Farma PV dachowa'],
  Usługi: ['Pomiary i uruchomienie', 'Serwis instalacji', 'Prace montażowe'],
  Mieszany: ['Kompleksowa dostawa materiałów', 'Zaopatrzenie budowy', 'Dostawa wg specyfikacji'],
};

// name, city, personaIndex (0-3 handlowcy, 5 centrum elektryczne, 6 budowy)
const CLIENTS: Array<[string, string, number]> = [
  ['Elektro-Instal Sp. z o.o.', 'Warszawa', 0],
  ['PolBud Mazowsze S.A.', 'Warszawa', 0],
  ['Zakład Elektryczny Kowalczyk', 'Radom', 0],
  ['Deweloper Zielone Tarasy', 'Warszawa', 0],
  ['Szkoła Podstawowa nr 12', 'Płock', 0],
  ['Hurtownia Prąd-Max', 'Pruszków', 0],
  ['Centrum Handlowe Galeria Północna', 'Warszawa', 0],
  ['Gmina Piaseczno – Wydział Inwestycji', 'Piaseczno', 0],
  ['Fabryka Mebli Meblex', 'Siedlce', 0],
  ['Huta Stali Silesia', 'Gliwice', 1],
  ['Zakład Energomechaniczny Jastrzębie', 'Jastrzębie-Zdrój', 1],
  ['Instalbud Katowice', 'Katowice', 1],
  ['Osiedle Słoneczne Sp. z o.o.', 'Tychy', 1],
  ['Park Logistyczny Gliwice', 'Gliwice', 1],
  ['Szpital Miejski w Zabrzu', 'Zabrze', 1],
  ['Zakłady Chemiczne Rybnik', 'Rybnik', 1],
  ['Elektromontaż Śląsk', 'Bytom', 1],
  ['Hotel Spodek Katowice', 'Katowice', 1],
  ['Stocznia Bałtycka Sp. z o.o.', 'Gdańsk', 2],
  ['Terminal Portowy Gdynia', 'Gdynia', 2],
  ['Biurowiec Baltic Plaza', 'Gdańsk', 2],
  ['Elektro-Serwis Gdynia', 'Gdynia', 2],
  ['Gmina Wejherowo', 'Wejherowo', 2],
  ['Hotel Sopot Marina', 'Sopot', 2],
  ['Spółdzielnia Rolnicza Kaszuby', 'Kartuzy', 2],
  ['Zakład Przetwórstwa Rybnego Hel', 'Hel', 2],
  ['Instal-Pomorze', 'Słupsk', 2],
  ['Spółdzielnia Mleczarska Podlasie', 'Sokółka', 3],
  ['Szpital Powiatowy w Łomży', 'Łomża', 3],
  ['Gmina Białystok – Wydział Inwestycji', 'Białystok', 3],
  ['Podlaskie Centrum Logistyczne', 'Białystok', 3],
  ['Zakład Elektroinstalacyjny Nowak', 'Suwałki', 3],
  ['Pensjonat Biały Dwór', 'Augustów', 3],
  ['Elektrohurt Polska', 'Warszawa', 5],
  ['Grupa Instalatorów Dom-Elektro', 'Łódź', 5],
  ['Sieć Sklepów Elektro-Mix', 'Poznań', 5],
  ['Budowa: Osiedle Parkowe etap II', 'Łódź', 6],
  ['Budowa: Hala Magazynowa Łódź-Północ', 'Łódź', 6],
  ['Budowa: Biurowiec Wola Central', 'Warszawa', 6],
];

const CONTACTS = ['Adam Mazur', 'Ewa Krawczyk', 'Robert Piotrowski', 'Joanna Grabowska', 'Michał Pawłowski', 'Agnieszka Zając', 'Krzysztof Król', 'Magdalena Wieczorek', 'Paweł Jabłoński', 'Barbara Majewska'];
const CLIENT_NOTES = [
  'Stały klient, płaci terminowo. Preferuje kontakt telefoniczny.',
  'Wrażliwy na cenę - zawsze porównuje z hurtownią internetową.',
  'Duży potencjał: planują rozbudowę w przyszłym roku.',
  'Przetargi - oferty muszą być złożone na 3 dni przed terminem.',
  'Wymaga dostawy na budowę, rozładunek tylko do 14:00.',
  '',
];
const OFFER_NOTES = [
  'Ceny nie zawierają kosztów montażu.',
  'Płatność przelewem w terminie 14 dni od daty faktury.',
  'Dostawa na paletach, rozładunek po stronie odbiorcy.',
  'Oferta zawiera pełną dokumentację techniczną i atesty.',
  'Możliwość negocjacji ceny przy zamówieniu powyżej 50 000 zł.',
  '',
  '',
];
const LOST_REASONS = ['Wybrali tańszego dostawcę', 'Projekt wstrzymany przez inwestora', 'Zbyt długi termin dostawy', 'Zmiana specyfikacji - nowa oferta', 'Brak budżetu w tym kwartale'];
const COMMENTS = [
  'Klient prosił o rozbicie oferty na dwa etapy.',
  'Rozmawiałem z inwestorem - czekają na decyzję zarządu.',
  'Do ustalenia termin dostawy częściowej.',
  'Konkurencja zaproponowała cenę o ok. 5% niższą.',
  'Klient poprosił o aktualizację ceny kabli po zmianie na LME.',
];

// ---------- seed ----------

export interface SeedResult {
  users: number;
  clients: number;
  products: number;
  offers: number;
}

export async function seedDemo(opts: { reset: boolean }): Promise<SeedResult> {
  const rand = mulberry32(20240607);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));

  const client = await db.connect();
  const result: SeedResult = { users: 0, clients: 0, products: 0, offers: 0 };
  try {
    await client.query('BEGIN');

    if (opts.reset) {
      await client.query(
        `TRUNCATE registration_attempts, supplier_requests, offer_templates, tasks, client_interactions, offer_activity,
         offer_items, offers, client_discounts, product_margins, product_prices, products, clients, users
         RESTART IDENTITY CASCADE`
      );
    }

    const now = new Date();
    const daysAgo = (d: number, hour = int(8, 17)) => {
      const x = new Date(now.getTime() - d * 86400000);
      x.setUTCHours(hour, int(0, 59), int(0, 59), 0);
      return x > now ? now : x;
    };
    const inDays = (d: number) => dateOnly(new Date(now.getTime() + d * 86400000));

    // Użytkownicy (hasło nieznane - logowanie wyłącznie przez tryb demo)
    const userRows = await bulk(
      client, 'users',
      ['email', 'password_hash', 'name', 'first_name', 'last_name', 'role', 'market_region', 'is_active', 'monthly_target', 'created_at'],
      PERSONAS.map((p) => [
        `${slug(p.first)}.${slug(p.last)}@eltron.pl`,
        crypto.randomBytes(24).toString('hex'),
        `${p.first} ${p.last}`, p.first, p.last, p.role, p.region, true, p.target, ts(daysAgo(400)),
      ]),
      'id, name, role'
    );
    result.users = userRows.length;
    const userIds: number[] = userRows.map((r: any) => r.id);
    const userNames: string[] = userRows.map((r: any) => r.name);
    const adminIdx = 4;

    // Produkty
    const productMeta = PRODUCTS.map((p) => {
      const list = MANUFACTURERS[p[2]] || ['Eltron'];
      const manufacturer = list[(p[3].length * 7 + p[3].charCodeAt(p[3].length - 1)) % list.length];
      const unit = p[1];
      const stockChoices = unit === 'm' ? [0, 150, 800, 3000] : unit === 'godz' || unit === 'usł' ? [9999] : [0, 3, 12, 60, 400];
      const stock = stockChoices[int(0, stockChoices.length - 1)];
      return {
        manufacturer: p[2] === 'Usługi' ? 'Eltron Serwis' : manufacturer,
        stock, note: stock >= 9999 ? null : pick(PRODUCTION_NOTES),
        bonus: BONUS[manufacturer] ?? 0,
        minPrice: round2(p[4] * 1.1),
        inEkonom: !p[3].startsWith('NE-'),
      };
    });
    const productRows = await bulk(
      client, 'products',
      ['name', 'unit', 'created_by', 'created_at', 'last_used', 'sku', 'category', 'manufacturer', 'ekonom_code', 'in_ekonom', 'min_price', 'supplier_bonus_percent', 'stock_qty', 'production_note'],
      PRODUCTS.map((p, i) => [
        p[0], p[1], userIds[5], ts(daysAgo(380)), ts(daysAgo(int(0, 60))), p[3], p[2], productMeta[i].manufacturer,
        productMeta[i].inEkonom ? `EK-${String(1000 + i * 7)}` : null, productMeta[i].inEkonom, productMeta[i].minPrice,
        productMeta[i].bonus, productMeta[i].stock, productMeta[i].note,
      ]),
      'id'
    );
    result.products = productRows.length;
    const productIds: number[] = productRows.map((r: any) => r.id);

    // Marże produktów dla każdego użytkownika
    const marginRows: any[][] = [];
    PERSONAS.forEach((persona, ui) => {
      PRODUCTS.forEach((p, pi) => {
        marginRows.push([productIds[pi], userIds[ui], p[4], Math.max(8, p[5] + persona.offset), 10, 15]);
      });
    });
    await bulk(client, 'product_margins', ['product_id', 'user_id', 'cost_price', 'margin_percent', 'min_margin_percent', 'max_discount_percent'], marginRows);

    // Klienci
    const clientRows = await bulk(
      client, 'clients',
      ['name', 'email', 'phone', 'address', 'nip', 'contact_person', 'notes', 'created_by', 'created_at', 'last_used'],
      CLIENTS.map((c, i) => {
        const contact = CONTACTS[i % CONTACTS.length];
        return [
          c[0],
          `${slug(contact.split(' ')[1])}@${slug(c[0]).slice(0, 18)}.pl`,
          `+48 ${int(500, 799)} ${int(100, 999)} ${int(100, 999)}`,
          `ul. ${pick(['Przemysłowa', 'Elektryczna', 'Handlowa', 'Fabryczna', 'Słoneczna', 'Wolności'])} ${int(1, 80)}, ${int(10, 99)}-${int(100, 999)} ${c[1]}`,
          String(int(1000000000, 9999999999)),
          contact,
          pick(CLIENT_NOTES) || null,
          userIds[c[2]],
          ts(daysAgo(int(60, 360))),
          ts(daysAgo(int(0, 60))),
        ];
      }),
      'id'
    );
    result.clients = clientRows.length;
    const clientIds: number[] = clientRows.map((r: any) => r.id);
    const clientsByUser = new Map<number, number[]>();
    CLIENTS.forEach((c, i) => {
      const arr = clientsByUser.get(c[2]) || [];
      arr.push(i);
      clientsByUser.set(c[2], arr);
    });

    // Rabaty indywidualne
    const discountRows: any[][] = [];
    for (let i = 0; i < 14; i++) {
      const ci = int(0, CLIENTS.length - 1);
      const owner = CLIENTS[ci][2];
      discountRows.push([clientIds[ci], productIds[int(0, PRODUCTS.length - 1)], pick([3, 5, 5, 7, 8, 10]), dateOnly(daysAgo(int(10, 120))), i % 3 === 0 ? inDays(int(30, 200)) : null, pick(['Rabat roczny', 'Rabat z umowy ramowej', 'Promocja dla stałych klientów']), userIds[owner]]);
    }
    const seenDiscount = new Set<string>();
    await bulk(client, 'client_discounts', ['client_id', 'product_id', 'discount_percent', 'valid_from', 'valid_until', 'notes', 'created_by'],
      discountRows.filter((r) => { const k = `${r[0]}-${r[1]}`; if (seenDiscount.has(k)) return false; seenDiscount.add(k); return true; }));

    // Oferty
    const salesWeights = [0.3, 0.27, 0.25, 0.1, 0, 0.05, 0.03];
    const pickUser = () => {
      let r = rand();
      for (let i = 0; i < salesWeights.length; i++) { r -= salesWeights[i]; if (r <= 0) return i; }
      return 0;
    };

    interface DraftOffer {
      ui: number; ci: number; createdAt: Date; calc: ReturnType<typeof computeOffer>; status: string;
      approval: string; approvalNote: string | null; sentAt: Date | null; acceptedAt: Date | null;
      viewedAt: Date | null; viewCount: number; followUp: string | null; lostReason: string | null;
      delivery: number; valid: number; additional: number; additionalDesc: string | null; notes: string | null;
      approvedAt: Date | null; items: any[];
      group: number; rev: number; isCurrent: boolean; segment: string; project: string; offerType: string;
      tenderDeadline: string | null; remarks: Array<{ target: string; text: string }>; outcome: string | null;
      wonAmount: number | null; competitor: string | null; closedAt: Date | null; ekonomNo: string | null;
    }
    const drafts: DraftOffer[] = [];
    const OFFER_COUNT = 140;
    const staleLeft: Record<number, number> = { 0: 2, 1: 5 };
    let ekonomSeq = 1;
    for (let n = 0; n < OFFER_COUNT; n++) {
      const ui = pickUser();
      const own = clientsByUser.get(ui) || clientsByUser.get(0)!;
      const ci = pick(own);
      const age = Math.floor(Math.pow(rand(), 1.7) * 370);
      const createdAt = daysAgo(age);
      const lowMarginDeal = rand() < 0.1;

      const itemCount = int(1, 7);
      const used = new Set<number>();
      const items: any[] = [];
      for (let k = 0; k < itemCount; k++) {
        let pi = int(0, PRODUCTS.length - 1);
        while (used.has(pi)) pi = int(0, PRODUCTS.length - 1);
        used.add(pi);
        const [name, unit, , , cost, baseMarkup] = PRODUCTS[pi];
        const markup = Math.max(8, baseMarkup + PERSONAS[ui].offset);
        const basePrice = round2(cost * (1 + markup / 100));
        const discount = lowMarginDeal ? between(10, 16) : rand() < 0.5 ? 0 : between(1, 8);
        // Cena nigdy nie spada poniżej kosztu (min. 1% narzutu) - wtedy oferta byłaby stratna
        const unitPrice = Math.max(round2(basePrice * (1 - discount / 100)), round2(cost * 1.01));
        const expensive = cost > 300;
        let quantity: number;
        if (unit === 'm') quantity = int(20, 600);
        else if (unit === 'godz') quantity = int(4, 60);
        else if (unit === 'opak') quantity = int(1, 12);
        else if (unit === 'kpl' || unit === 'usł') quantity = int(1, 6);
        else quantity = expensive ? int(1, 10) : int(2, 80);
        const meta = productMeta[pi];
        const av = availabilityFor(quantity, meta.stock, unit, meta.note);
        items.push({
          product_name: name, unit, quantity, unit_price: unitPrice, vat_rate: 23,
          cost_price: cost, discount_percent: round2(discount), original_price: basePrice, _pi: pi,
          min_price: meta.minPrice, manufacturer: meta.manufacturer, in_ekonom: meta.inEkonom,
          availability: av.availability, availability_note: av.availability_note,
          item_note: rand() < 0.13 ? pick(ITEM_NOTES) : '',
        });
      }
      const additional = rand() < 0.28 ? Math.round(between(150, 900) / 10) * 10 : 0;
      const calc = computeOffer({ items, additional_costs: additional });

      let status: string;
      const r = rand();
      if (age < 5) status = r < 0.45 ? 'draft' : 'sent';
      else if (age < 40) status = r < 0.08 ? 'draft' : r < 0.45 ? 'sent' : r < 0.8 ? 'accepted' : 'rejected';
      else status = r < 0.05 ? 'draft' : r < 0.1 ? 'sent' : r < 0.65 ? 'accepted' : 'rejected';

      let approval = 'none';
      let approvalNote: string | null = null;
      let approvedAt: Date | null = null;
      if (calc.needsApproval) {
        if (age < 10 && rand() < 0.75) { approval = 'pending'; status = 'draft'; }
        else if (rand() < 0.12) { approval = 'rejected'; status = 'draft'; approvalNote = 'Marża zbyt niska - proszę podnieść ceny kabli lub zmniejszyć rabat.'; approvedAt = new Date(createdAt.getTime() + 3600000 * int(2, 20)); }
        else { approval = 'approved'; approvalNote = pick(['Akceptuję - strategiczny klient.', 'OK, ale to ostatni raz przy tej marży.', 'Zgoda, duży wolumen.']); approvedAt = new Date(createdAt.getTime() + 3600000 * int(2, 20)); }
      }

      const sentAt = status === 'draft' ? null : new Date(Math.min(now.getTime(), createdAt.getTime() + 86400000 * between(0, 2)));
      let acceptedAt: Date | null = null;
      let lostReason: string | null = null;
      if (status === 'accepted' && sentAt) acceptedAt = new Date(Math.min(now.getTime(), sentAt.getTime() + 86400000 * between(2, 25)));
      if (status === 'rejected') lostReason = pick(LOST_REASONS);
      const viewed = sentAt && rand() < 0.8;
      const viewCount = viewed ? int(1, 6) : 0;
      const viewedAt = viewed && sentAt ? new Date(Math.min(now.getTime(), sentAt.getTime() + 3600000 * int(1, 60))) : null;
      const followUp = status === 'sent' && sentAt ? dateOnly(new Date(sentAt.getTime() + 86400000 * pick([3, 5, 7, 10]))) : null;

      // Scenariusz demo: część starszych ofert „wisi” bez oznaczonego wyniku (limit ofert do rozliczenia)
      let staleForced = false;
      if (staleLeft[ui] > 0 && age >= 85 && sentAt && approval !== 'pending' && approval !== 'rejected' && status !== 'draft') {
        staleLeft[ui]--;
        staleForced = true;
        status = 'sent';
        acceptedAt = null;
        lostReason = null;
      }
      const effFollowUp = staleForced ? null : followUp;

      const segment = suggestSegment(calc.items.map((it, idx) => ({ category: PRODUCTS[items[idx]._pi][2], net_amount: it.net_amount })));
      const topic = (PROJECT_TOPICS[segment] || PROJECT_TOPICS.Mieszany)[(ci + n) % 3];
      const place = CLIENTS[ci][0].replace(/ (Sp\. z o\.o\.|S\.A\.)$/, '').replace(/^(Budowa|Gmina|Szpital|Hotel):? /, '');
      const publicBuyer = /Gmina|Szpital|Szkoła|Wydział/.test(CLIENTS[ci][0]);
      const isTender = publicBuyer ? rand() < 0.5 : rand() < 0.07;
      let outcome: string | null = null;
      let wonAmount: number | null = null;
      let competitor: string | null = null;
      if (status === 'accepted') {
        if (rand() < 0.15) { outcome = 'partial'; wonAmount = round2(calc.totals.net * between(0.3, 0.7)); competitor = pick(COMPETITORS); lostReason = lostReason || 'Część zamówiono u konkurencji'; }
        else { outcome = 'won'; wonAmount = calc.totals.net; }
      } else if (status === 'rejected') {
        outcome = 'lost'; competitor = rand() < 0.6 ? pick(COMPETITORS) : null;
      }
      const closedAt = outcome ? (acceptedAt || new Date(Math.min(now.getTime(), (sentAt || createdAt).getTime() + 86400000 * int(3, 20)))) : null;
      const remarkRoll = rand();
      const remarks: Array<{ target: string; text: string }> = [];
      if (remarkRoll < 0.2) remarks.push({ target: 'Klient', text: pick(OFFER_NOTES.filter(Boolean)) });
      else if (remarkRoll < 0.3) remarks.push({ target: 'Producent', text: 'Prosimy o potwierdzenie terminu produkcji oraz możliwości dostawy partiami.' });
      else if (remarkRoll < 0.4) remarks.push({ target: 'Wewnętrzna', text: 'Klient wrażliwy na cenę – nie schodzić poniżej ceny minimalnej.' });
      const ekonomNo = outcome && outcome !== 'lost' && acceptedAt && now.getTime() - acceptedAt.getTime() > 3 * 86400000 && rand() < 0.7
        ? `ZO/${acceptedAt.getFullYear()}/${String(ekonomSeq++).padStart(4, '0')}` : null;

      drafts.push({
        ui, ci, createdAt, calc, status, approval, approvalNote, approvedAt, sentAt, acceptedAt, viewedAt, viewCount,
        followUp: effFollowUp, lostReason, delivery: pick([3, 7, 14, 14, 21, 30]), valid: pick([14, 30, 30, 60]),
        additional, additionalDesc: additional ? pick(['Transport', 'Transport i rozładunek', 'Montaż i uruchomienie']) : null,
        notes: pick(OFFER_NOTES) || null, items: calc.items.map((it, idx) => ({ ...it, _pi: items[idx]._pi })),
        group: n, rev: 0, isCurrent: true, segment, project: `${topic} – ${place}`, offerType: isTender ? 'przetarg' : 'zakup',
        tenderDeadline: isTender ? dateOnly(new Date(createdAt.getTime() + 86400000 * 14)) : null,
        remarks, outcome, wonAmount, competitor, closedAt, ekonomNo,
      });
    }

    // Wariant negocjacyjny: część ofert miała wcześniejsze wersje z wyższymi cenami (OF/2026/0042, .1, .2)
    const nowMs = now.getTime();
    let chains = 0;
    for (const d of [...drafts]) {
      const ageDays = (nowMs - d.createdAt.getTime()) / 86400000;
      if (chains >= 14 || ageDays < 14 || d.approval !== 'none' || !['sent', 'accepted', 'rejected'].includes(d.status) || rand() > 0.12) continue;
      chains++;
      const prev = int(1, 2);
      d.rev = prev;
      for (let k = 0; k < prev; k++) {
        const factor = 1 + 0.045 * (prev - k);
        const items2 = d.items.map((it: any) => ({ ...it, unit_price: round2(it.unit_price * factor) }));
        const calc2 = computeOffer({ items: items2, additional_costs: d.additional });
        const createdAt2 = new Date(d.createdAt.getTime() - (prev - k) * 86400000 * 3);
        drafts.push({
          ...d, rev: k, isCurrent: false, createdAt: createdAt2, calc: calc2, status: 'sent', outcome: null, wonAmount: null,
          competitor: null, closedAt: null, ekonomNo: null, acceptedAt: null, lostReason: null, followUp: null,
          sentAt: new Date(createdAt2.getTime() + 3600000 * 3), viewedAt: null, viewCount: 0,
          items: calc2.items.map((it, idx) => ({ ...it, _pi: d.items[idx]._pi })),
        });
      }
    }
    drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.rev - b.rev);
    // Unikalne numery ofert: OF/rok/0001 (warianty jednej oferty dzielą numer i różnią się rewizją)
    const yearCounters = new Map<number, number>();
    const groupNumbers = new Map<number, string>();
    const numbers: string[] = drafts.map((d) => {
      let num = groupNumbers.get(d.group);
      if (!num) {
        const y = d.createdAt.getFullYear();
        const c = (yearCounters.get(y) || 0) + 1;
        yearCounters.set(y, c);
        num = `OF/${y}/${String(c).padStart(4, '0')}`;
        groupNumbers.set(d.group, num);
      }
      return num;
    });

    const offerIdRows = await bulk(
      client, 'offers',
      ['user_id', 'client_id', 'client_name', 'client_email', 'client_phone', 'delivery_days', 'valid_days', 'additional_costs',
        'additional_costs_description', 'notes', 'total_net', 'total_vat', 'total_gross', 'created_at', 'updated_at', 'status',
        'public_token', 'sent_at', 'accepted_at', 'viewed_at', 'view_count', 'follow_up_date', 'lost_reason',
        'approval_status', 'approval_note', 'approved_by', 'approved_at',
        'offer_number', 'revision', 'is_current', 'project_name', 'segment', 'offer_type', 'tender_deadline', 'contact_person',
        'remarks', 'outcome', 'won_amount', 'competitor', 'closed_at', 'ekonom_order_no', 'ekonom_exported_at', 'approval_level'],
      drafts.map((d, di) => {
        const c = CLIENTS[d.ci];
        const contactEmail = `${slug(CONTACTS[d.ci % CONTACTS.length].split(' ')[1])}@${slug(c[0]).slice(0, 18)}.pl`;
        return [
          userIds[d.ui], clientIds[d.ci], c[0], contactEmail, `+48 ${500 + (d.ci * 7) % 300} ${100 + (d.ci * 13) % 800} ${100 + (d.ci * 29) % 800}`,
          d.delivery, d.valid, d.additional, d.additionalDesc, d.notes, d.calc.totals.net, d.calc.totals.vat, d.calc.totals.gross,
          ts(d.createdAt), ts(d.sentAt || d.createdAt), d.status, crypto.randomBytes(12).toString('hex'),
          d.sentAt ? ts(d.sentAt) : null, d.acceptedAt ? ts(d.acceptedAt) : null, d.viewedAt ? ts(d.viewedAt) : null, d.viewCount,
          d.followUp, d.lostReason, d.approval, d.approvalNote,
          d.approvedAt ? userIds[adminIdx] : null, d.approvedAt ? ts(d.approvedAt) : null,
          numbers[di], d.rev, d.isCurrent, d.project, d.segment, d.offerType, d.tenderDeadline, CONTACTS[d.ci % CONTACTS.length],
          JSON.stringify(d.remarks), d.outcome, d.wonAmount, d.competitor, d.closedAt ? ts(d.closedAt) : null,
          d.ekonomNo, d.ekonomNo && d.acceptedAt ? ts(new Date(d.acceptedAt.getTime() + 86400000)) : null,
          d.calc.approvalLevel,
        ];
      }),
      'id'
    );
    result.offers = offerIdRows.length;
    const offerIds: number[] = offerIdRows.map((r: any) => r.id);
    // Powiązanie wariantów: wersja N wskazuje na wersję N-1 tej samej oferty
    for (let i = 0; i < drafts.length; i++) {
      if (drafts[i].rev > 0) {
        const parent = drafts.findIndex((x) => x.group === drafts[i].group && x.rev === drafts[i].rev - 1);
        if (parent >= 0) await client.query('UPDATE offers SET parent_offer_id = $1 WHERE id = $2', [offerIds[parent], offerIds[i]]);
      }
    }

    const itemRows: any[][] = [];
    const priceRows: any[][] = [];
    const activityRows: any[][] = [];
    const taskRows: any[][] = [];
    drafts.forEach((d, idx) => {
      const offerId = offerIds[idx];
      d.items.forEach((it: any, pos: number) => {
        itemRows.push([offerId, productIds[it._pi], it.product_name, it.quantity, it.unit, it.unit_price, it.vat_rate, it.net_amount,
          it.vat_amount, it.gross_amount, it.cost_price, it.margin_percent, it.discount_percent, it.original_price, pos + 1,
          it.min_price || null, it.manufacturer || null, it.in_ekonom !== false, it.availability, it.availability_note || null, it.item_note || null]);
        priceRows.push([productIds[it._pi], it.unit_price, it.cost_price, it.unit_price, it.margin_percent, userIds[d.ui], ts(d.createdAt), 'sale']);
      });
      const who = userNames[d.ui];
      activityRows.push([offerId, userIds[d.ui], who, 'created',
        d.rev > 0 ? `Utworzono wariant negocjacyjny ${numbers[idx]}.${d.rev}` : `Utworzono ofertę ${numbers[idx]}: ${d.project}`, ts(d.createdAt)]);
      if (d.ekonomNo && d.acceptedAt) activityRows.push([offerId, userIds[d.ui], who, 'ekonom', `Przekazano do Ekonoma jako zamówienie ${d.ekonomNo} – symulacja`, ts(new Date(d.acceptedAt.getTime() + 86400000))]);
      if (d.approval !== 'none') {
        activityRows.push([offerId, userIds[d.ui], who, 'approval', 'Oferta wymaga akceptacji zarządu (niska marża)', ts(new Date(d.createdAt.getTime() + 60000))]);
        if (d.approvedAt) {
          activityRows.push([offerId, userIds[adminIdx], userNames[adminIdx], 'approval',
            `${d.approval === 'approved' ? 'Zaakceptowano' : 'Odrzucono'} niską marżę${d.approvalNote ? `: ${d.approvalNote}` : ''}`, ts(d.approvedAt)]);
        }
      }
      if (d.sentAt) activityRows.push([offerId, userIds[d.ui], who, 'status', 'Status zmieniony na: Wysłana', ts(d.sentAt)]);
      if (d.viewedAt) activityRows.push([offerId, null, 'Klient', 'viewed', `Klient otworzył ofertę (${d.viewCount}x)`, ts(d.viewedAt)]);
      if (d.acceptedAt) activityRows.push([offerId, null, 'Klient', 'client_response', 'Klient zaakceptował ofertę online', ts(d.acceptedAt)]);
      if (d.status === 'rejected' && d.sentAt) {
        activityRows.push([offerId, userIds[d.ui], who, 'status', `Status zmieniony na: Przegrana (${d.lostReason})`, ts(new Date(Math.min(now.getTime(), d.sentAt.getTime() + 86400000 * int(3, 20))))]);
      }
      if (rand() < 0.22 && d.sentAt) activityRows.push([offerId, userIds[d.ui], who, 'comment', pick(COMMENTS), ts(new Date(Math.min(now.getTime(), d.sentAt.getTime() + 3600000 * int(2, 72))))]);
      if (d.status === 'sent' && d.followUp) {
        taskRows.push([userIds[d.ui], offerId, clientIds[d.ci], `Zadzwonić do ${CLIENTS[d.ci][0]} w sprawie oferty`, d.followUp, false]);
      }
    });
    await bulk(client, 'offer_items', ['offer_id', 'product_id', 'product_name', 'quantity', 'unit', 'unit_price', 'vat_rate', 'net_amount', 'vat_amount', 'gross_amount', 'cost_price', 'margin_percent', 'discount_percent', 'original_price', 'position_order', 'min_price', 'manufacturer', 'in_ekonom', 'availability', 'availability_note', 'item_note'], itemRows);
    await bulk(client, 'product_prices', ['product_id', 'price', 'cost_price', 'sale_price', 'margin_percent', 'used_by', 'used_at', 'price_type'], priceRows);
    await bulk(client, 'offer_activity', ['offer_id', 'user_id', 'actor_name', 'type', 'message', 'created_at'], activityRows);

    // Zadania ogólne
    const genericTasks = ['Przygotować zestawienie cen kabli na kwartał', 'Umówić spotkanie z klientem na prezentację ofert LED', 'Zaktualizować rabaty u kluczowych klientów', 'Odnowić umowę ramową'];
    for (let ui = 0; ui < 4; ui++) {
      taskRows.push([userIds[ui], null, null, pick(genericTasks), inDays(int(-2, 6)), false]);
      taskRows.push([userIds[ui], null, null, pick(genericTasks), dateOnly(daysAgo(int(2, 9))), true]);
    }
    await bulk(client, 'tasks', ['user_id', 'offer_id', 'client_id', 'title', 'due_date', 'done'], taskRows);

    // Kontakty z klientami
    const interactionRows: any[][] = [];
    clientIds.forEach((cid, i) => {
      const count = int(2, 6);
      for (let k = 0; k < count; k++) {
        const type = pick(['call', 'call', 'meeting', 'email', 'note']);
        const content = {
          call: pick(['Rozmowa o terminach dostawy - klient zadowolony.', 'Telefon w sprawie wyceny - poproszono o rabat.', 'Klient pytał o dostępność falowników.']),
          meeting: pick(['Spotkanie na budowie - ustalono zakres instalacji.', 'Prezentacja nowej oferty oświetlenia LED.', 'Wizja lokalna przed wyceną.']),
          email: pick(['Wysłano katalog produktów i cennik.', 'Klient przesłał specyfikację materiałową.', 'Potwierdzenie terminu dostawy.']),
          note: pick(['Zmiana osoby kontaktowej po stronie klienta.', 'Klient planuje remont w Q2.', 'Duże zapytanie ofertowe spodziewane po wakacjach.']),
        }[type as 'call' | 'meeting' | 'email' | 'note'];
        interactionRows.push([cid, userIds[CLIENTS[i][2]], type, content, ts(daysAgo(int(1, 200)))]);
      }
    });
    await bulk(client, 'client_interactions', ['client_id', 'user_id', 'type', 'content', 'created_at'], interactionRows);

    // Zapytania do producentów (kilka w toku, kilka z odpowiedzią)
    const recentSent = drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.status === 'sent' && d.isCurrent && d.sentAt && nowMs - d.sentAt.getTime() < 40 * 86400000)
      .slice(0, 6);
    if (recentSent.length) {
      const itemsDb = await client.query(
        `SELECT id, offer_id, manufacturer, product_name, quantity, unit, cost_price FROM offer_items WHERE offer_id = ANY($1::int[]) ORDER BY position_order`,
        [recentSent.map(({ i }) => offerIds[i])]
      );
      const rfqRows: any[][] = [];
      recentSent.forEach(({ d, i }, k) => {
        const mine = itemsDb.rows.filter((r: any) => r.offer_id === offerIds[i] && r.manufacturer);
        if (!mine.length) return;
        const manufacturer = mine[0].manufacturer;
        const lines = mine.filter((r: any) => r.manufacturer === manufacturer);
        const answered = k % 2 === 1;
        const response = answered
          ? lines.map((l: any) => ({
              item_id: l.id, product_name: l.product_name, quantity: Number(l.quantity), unit: l.unit, old_cost: Number(l.cost_price),
              quoted_cost: round2(Number(l.cost_price) * (0.94 + ((l.id * 37) % 10) / 100)), lead_days: [3, 7, 10, 14, 21][l.id % 5],
            }))
          : null;
        rfqRows.push([
          offerIds[i], manufacturer,
          `Dzień dobry,\n\nprosimy o wycenę poniższych pozycji do tematu „${d.project}” (oferta ${numbers[i]}).`,
          JSON.stringify(lines.map((l: any) => ({ id: l.id, product_name: l.product_name, quantity: Number(l.quantity), unit: l.unit }))),
          answered ? 'answered' : 'sent', response ? JSON.stringify(response) : null, userIds[d.ui], ts(new Date(d.sentAt!.getTime() + 3600000 * 5)),
          answered ? ts(new Date(d.sentAt!.getTime() + 86400000)) : null,
        ]);
      });
      await bulk(client, 'supplier_requests', ['offer_id', 'manufacturer', 'message', 'items', 'status', 'response', 'created_by', 'created_at', 'responded_at'], rfqRows);
    }

    // Szablony ofert
    const tpl = (names: string[], qty: number[]) =>
      names.map((n, i) => {
        const pi = PRODUCTS.findIndex((p) => p[0] === n);
        const [name, unit, , , cost, markup] = PRODUCTS[pi];
        const price = round2(cost * (1 + markup / 100));
        return { product_name: name, unit, quantity: qty[i], unit_price: price, vat_rate: 23, cost_price: cost, margin_percent: markup, discount_percent: 0, original_price: price };
      });
    const templates = [
      {
        name: 'Instalacja elektryczna – mieszkanie 60 m²',
        description: 'Kompletny zestaw materiałów na instalację w nowym mieszkaniu.',
        payload: { delivery_days: 7, valid_days: 30, notes: 'Cena nie zawiera montażu. Dostawa w ciągu 7 dni roboczych.', items: tpl(['Przewód YDY 3x1,5 mm² 450/750V', 'Przewód YDY 3x2,5 mm² 450/750V', 'Gniazdo podtynkowe 2P+Z białe', 'Łącznik jednobiegunowy biały', 'Puszka podtynkowa fi 60', 'Rozdzielnica podtynkowa 36 mod.', 'Wyłącznik nadprądowy B16 1P', 'Wyłącznik różnicowoprądowy 25A/30mA 2P'], [250, 180, 45, 20, 90, 1, 8, 2]) },
      },
      {
        name: 'Rozdzielnica główna – budynek biurowy',
        description: 'Aparatura i obudowy do rozdzielni głównej.',
        payload: { delivery_days: 14, valid_days: 30, notes: 'Termin dostawy zależy od dostępności szafy rozdzielczej.', items: tpl(['Szafa rozdzielcza 800x600x2000', 'Rozłącznik izolacyjny 63A 3P', 'Wyłącznik nadprądowy C25 3P', 'Wyłącznik różnicowoprądowy 40A/30mA 4P', 'Ogranicznik przepięć typ 1+2 4P', 'Pomiary elektryczne z protokołem'], [1, 2, 12, 4, 1, 1]) },
      },
      {
        name: 'Oświetlenie LED – hala produkcyjna',
        description: 'Modernizacja oświetlenia hali na LED.',
        payload: { delivery_days: 10, valid_days: 45, notes: 'Oferta zawiera 5 lat gwarancji na oprawy.', items: tpl(['Oprawa hermetyczna LED 120 cm 36W', 'Naświetlacz LED 100W IP65', 'Czujnik ruchu 360° ścienny', 'Przewód YDY 3x1,5 mm² 450/750V', 'Montaż i uruchomienie – robocizna'], [60, 8, 12, 400, 40]) },
      },
    ];
    await bulk(client, 'offer_templates', ['name', 'description', 'created_by', 'payload'], templates.map((t) => [t.name, t.description, userIds[adminIdx], JSON.stringify(t.payload)]));

    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function setupDemo(reset: boolean): Promise<{ seeded: boolean; counts?: SeedResult }> {
  await ensureSchema();
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  if (reset || rows[0].n === 0) {
    const counts = await seedDemo({ reset });
    return { seeded: true, counts };
  }
  return { seeded: false };
}
