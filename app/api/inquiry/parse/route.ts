// Analiza zapytania ofertowego klienta: z treści (e-mail / tekst z PDF / Excel) tworzy listę towarów
// dopasowanych do katalogu, z dostępnością i podpowiedzią ceny. Odczyt PDF/OCR jest w demo symulowany w UI.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';
import { parseInquiry, matchScore } from '../../../../lib/inquiry-parser';
import { availabilityFor } from '../../../../lib/offer-rules';

export const dynamic = 'force-dynamic';

const GENERIC = new Set(['sp', 'zoo', 'sa', 'gmina', 'szpital', 'hotel', 'budowa', 'zaklad', 'fabryka', 'park', 'grupa', 'siec', 'osiedle', 'wydzial', 'inwestycji', 'centrum']);

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const text = String(body.text || '').slice(0, 60000);
    if (text.trim().length < 10) return NextResponse.json({ error: 'Wklej treść zapytania lub wybierz plik' }, { status: 400 });

    const parsed = parseInquiry(text);

    const [products, clients] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.unit, p.category, p.manufacturer, p.min_price, p.stock_qty, p.production_note, p.in_ekonom,
                pm.cost_price, pm.margin_percent
         FROM products p LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $1`,
        [user.id]
      ),
      user.canViewAll
        ? db.query('SELECT id, name, email, phone, contact_person FROM clients')
        : db.query('SELECT id, name, email, phone, contact_person FROM clients WHERE created_by = $1', [user.id]),
    ]);

    const rows = parsed.rows.map((row, idx) => {
      const scored = products.rows
        .map((p: any) => ({ p, score: matchScore(row.name, p.name) }))
        .filter((x) => x.score >= 0.42)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const matches = scored.map(({ p, score }) => {
        const cost = Number(p.cost_price) || 0;
        const price = cost > 0 ? Math.round(cost * (1 + (Number(p.margin_percent) || 20) / 100) * 100) / 100 : 0;
        const stock = p.stock_qty !== null ? Number(p.stock_qty) : null;
        const av = availabilityFor(row.quantity, stock, p.unit, p.production_note);
        return {
          product_id: p.id, name: p.name, unit: p.unit, category: p.category, manufacturer: p.manufacturer,
          confidence: Math.round(Math.min(0.99, score + 0.1) * 100),
          unit_price: price, cost_price: cost, margin_percent: cost > 0 ? Math.round(((price - cost) / cost) * 10000) / 100 : 0,
          min_price: p.min_price !== null ? Number(p.min_price) : null, in_ekonom: p.in_ekonom !== false,
          availability: av.availability, availability_note: av.availability_note,
        };
      });
      return { id: idx + 1, ...row, matches };
    });

    // Klient: po nazwie lub domenie e-mail wspomnianej w treści
    const lower = text.toLowerCase();
    const clientMatch = clients.rows.find((c: any) => {
      if (lower.includes(String(c.name).toLowerCase())) return true;
      const words = String(c.name).toLowerCase().split(/[^a-z0-9ąćęłńóśźż]+/).filter((w) => w.length >= 5 && !GENERIC.has(w));
      return words.length > 0 && words.some((w) => lower.includes(w)) && (parsed.clientHint ? parsed.clientHint.toLowerCase().includes(words[0]) || lower.includes(words[0]) : true);
    });

    return NextResponse.json({
      project: parsed.project,
      deadline: parsed.deadline,
      offerType: parsed.offerType,
      remarks: parsed.remarks,
      clientHint: parsed.clientHint,
      contactHint: parsed.contactHint,
      client: clientMatch || null,
      rows,
      stats: {
        found: rows.length,
        matched: rows.filter((r) => r.matches.length > 0).length,
        unmatched: rows.filter((r) => r.matches.length === 0).length,
      },
    });
  } catch (error) {
    return serverError('Inquiry parse error:', error, 'Nie udało się przeanalizować zapytania');
  }
}
