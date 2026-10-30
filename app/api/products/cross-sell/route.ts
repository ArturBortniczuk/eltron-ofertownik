// Cross-selling: do pozycji w ofercie podpowiada towary pokrewne (kabel -> mufa, głowica, rura ...)
// Źródła: (1) reguły branżowe, (2) co klienci kupowali razem w poprzednich ofertach.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

// pattern pozycji w ofercie -> [fragment nazwy podpowiadanego towaru, domyślna ilość, uzasadnienie]
const RULES: Array<{ when: RegExp; suggest: Array<[string, number, string]> }> = [
  { when: /kabel ziemny|yky|yaky/i, suggest: [['Mufa kablowa', 2, 'do kabla ziemnego potrzebne są mufy'], ['Głowica kablowa', 2, 'zakończenie kabla – głowice'], ['Końcówka kablowa', 8, 'końcówki do żył'], ['Rura osłonowa RHDPE', 50, 'osłona kabla w ziemi'], ['Bednarka', 50, 'uziemienie wzdłuż trasy kabla']] },
  { when: /mufa|głowica/i, suggest: [['Końcówka kablowa', 8, 'do zaprasowania żył'], ['Kabel ziemny YKY 4x16', 50, 'zwykle razem z kablem']] },
  { when: /ydy|h07v|przewód/i, suggest: [['Puszka podtynkowa', 20, 'puszki instalacyjne'], ['Złączka instalacyjna', 2, 'złączki do łączenia żył'], ['Rura osłonowa peszel', 50, 'peszel do prowadzenia przewodów']] },
  { when: /utp|skrętka/i, suggest: [['Gniazdo komputerowe RJ45', 10, 'gniazda do sieci LAN']] },
  { when: /wyłącznik nadprądowy|różnicowoprądowy/i, suggest: [['Rozdzielnica', 1, 'obudowa na aparaty'], ['Ogranicznik przepięć', 1, 'zabezpieczenie przepięciowe'], ['Wyłącznik różnicowoprądowy', 1, 'ochrona różnicowoprądowa']] },
  { when: /rozdzielnica|szafa/i, suggest: [['Wyłącznik nadprądowy B16', 6, 'aparatura do rozdzielnicy'], ['Rozłącznik izolacyjny', 1, 'rozłącznik główny'], ['Pomiary elektryczne', 1, 'pomiary odbiorcze']] },
  { when: /panel led|oprawa/i, suggest: [['Czujnik ruchu', 4, 'sterowanie oświetleniem'], ['Przewód YDY 3x1,5', 100, 'zasilanie opraw'], ['Montaż i uruchomienie', 8, 'montaż opraw']] },
  { when: /fotowolta|panel foto|falownik pv/i, suggest: [['Falownik PV', 1, 'falownik do instalacji'], ['Konstrukcja montażowa PV', 1, 'konstrukcja pod panele'], ['Montaż i uruchomienie', 16, 'montaż instalacji'], ['Ogranicznik przepięć', 1, 'ochrona przepięciowa PV']] },
  { when: /bednarka|uziom/i, suggest: [['Złączka krzyżowa', 10, 'łączenie bednarki'], ['Uziom pionowy', 4, 'uziomy pionowe'], ['Pomiary elektryczne', 1, 'pomiary rezystancji uziemienia']] },
  { when: /falownik|plc|softstart/i, suggest: [['Zasilacz impulsowy', 1, 'zasilanie automatyki'], ['Przekaźnik czasowy', 2, 'sterowanie'], ['Przycisk sterowniczy', 2, 'obsługa lokalna']] },
  { when: /stacja ładowania/i, suggest: [['Wyłącznik różnicowoprądowy 40A', 1, 'zabezpieczenie ładowarki'], ['Kabel ziemny YKY 5x10', 30, 'zasilanie stacji']] },
];

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const names: string[] = (Array.isArray(body.names) ? body.names : []).map((n: any) => String(n)).slice(0, 30);
    if (names.length === 0) return NextResponse.json({ suggestions: [] });

    const wanted = new Map<string, { pattern: string; qty: number; reason: string }>();
    for (const name of names) {
      for (const rule of RULES) {
        if (!rule.when.test(name)) continue;
        for (const [pattern, qty, why] of rule.suggest) {
          if (!wanted.has(pattern)) wanted.set(pattern, { pattern, qty, reason: `${why} (do: ${name.length > 34 ? name.slice(0, 32) + '…' : name})` });
        }
      }
    }

    const found: any[] = [];
    for (const w of Array.from(wanted.values())) {
      const r = await db.query(
        `SELECT p.id, p.name, p.unit, p.category, p.manufacturer, p.min_price, p.stock_qty, p.production_note, p.in_ekonom,
                pm.cost_price, pm.margin_percent
         FROM products p LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $2
         WHERE p.name ILIKE $1 ORDER BY p.name LIMIT 1`,
        [`%${w.pattern}%`, user.id]
      );
      if (r.rows[0]) found.push({ ...r.rows[0], suggested_qty: w.qty, reason: w.reason, source: 'rule' });
    }

    // Co klienci kupowali razem: towary najczęściej występujące w tych samych ofertach
    const co = await db.query(
      `SELECT p.id, p.name, p.unit, p.category, p.manufacturer, p.min_price, p.stock_qty, p.production_note, p.in_ekonom,
              pm.cost_price, pm.margin_percent, COUNT(DISTINCT oi2.offer_id)::int AS together
       FROM offer_items oi1
       JOIN offer_items oi2 ON oi2.offer_id = oi1.offer_id AND oi2.product_id <> oi1.product_id
       JOIN products p ON p.id = oi2.product_id
       LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $2
       WHERE oi1.product_name = ANY($1::text[]) AND NOT (p.name = ANY($1::text[]))
       GROUP BY p.id, pm.cost_price, pm.margin_percent
       HAVING COUNT(DISTINCT oi2.offer_id) >= 3
       ORDER BY together DESC LIMIT 4`,
      [names, user.id]
    );
    co.rows.forEach((row: any) => {
      if (!found.some((f) => f.id === row.id)) {
        found.push({ ...row, suggested_qty: 1, reason: `kupowane razem w ${row.together} ofertach`, source: 'history' });
      }
    });

    const suggestions = found
      .filter((f) => !names.some((n) => n.toLowerCase() === String(f.name).toLowerCase()))
      .slice(0, 8)
      .map((f) => {
        const cost = Number(f.cost_price) || 0;
        const price = cost > 0 ? Math.round(cost * (1 + (Number(f.margin_percent) || 20) / 100) * 100) / 100 : 0;
        return {
          product_id: f.id, name: f.name, unit: f.unit, category: f.category, manufacturer: f.manufacturer,
          min_price: f.min_price !== null ? Number(f.min_price) : null,
          stock_qty: f.stock_qty !== null ? Number(f.stock_qty) : null,
          production_note: f.production_note, in_ekonom: f.in_ekonom !== false,
          cost_price: cost, unit_price: price, margin_percent: cost > 0 ? Math.round(((price - cost) / cost) * 10000) / 100 : 0,
          suggested_qty: f.suggested_qty, reason: f.reason, source: f.source,
        };
      });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return serverError('Cross-sell error:', error, 'Błąd podpowiedzi produktów pokrewnych');
  }
}
