// Podpowiedź przy wpisywaniu tematu / inwestycji: czy podobna oferta już istnieje (żeby nie dublować pracy)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

const STOP = new Set(['dla', 'oraz', 'przy', 'nad', 'pod', 'budowa', 'budynek', 'budynku', 'instalacja', 'instalacji', 'sp', 'zoo', 'etap']);

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const exclude = parseInt(searchParams.get('exclude') || '', 10) || 0;
    if (q.length < 3) return NextResponse.json([]);

    const words = q.toLowerCase().split(/[^a-z0-9ąćęłńóśźż]+/).filter((w) => w.length >= 4 && !STOP.has(w)).slice(0, 5);
    const patterns = [`%${q}%`, ...words.map((w) => `%${w.slice(0, Math.max(4, w.length - 2))}%`)];
    const r = await db.query(
      `SELECT o.id, o.offer_number, o.revision, o.project_name, o.client_name, o.status, o.outcome, o.total_net, o.created_at,
              o.user_id, u.name AS salesperson
       FROM offers o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.project_name ILIKE ANY($1::text[]) AND o.is_current IS NOT FALSE AND o.id <> $2
       ORDER BY o.created_at DESC LIMIT 60`,
      [patterns, exclude]
    );
    // Podobieństwo = ile słów kluczowych tematu wystąpiło w nazwie (wymagamy min. 2, gdy wpisano kilka słów)
    const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)));
    const need = Math.min(2, stems.length);
    const scored = r.rows
      .map((o: any) => {
        const name = String(o.project_name).toLowerCase();
        const hits = stems.filter((st) => name.includes(st)).length;
        return { o, hits: name.includes(q.toLowerCase()) ? 99 : hits };
      })
      .filter((x: any) => x.hits >= Math.max(1, need))
      .sort((a: any, b: any) => b.hits - a.hits)
      .slice(0, 6)
      .map((x: any) => x.o);
    return NextResponse.json(
      scored.map((o: any) => ({
        id: o.id,
        offer_number: o.offer_number,
        revision: o.revision,
        project_name: o.project_name,
        client_name: o.client_name,
        status: o.status,
        outcome: o.outcome,
        created_at: o.created_at,
        salesperson: o.salesperson,
        mine: o.user_id === user.id,
        // wartość tylko dla właściciela lub osób z dostępem do całości
        total_net: user.canViewAll || o.user_id === user.id ? o.total_net : null,
      }))
    );
  } catch (error) {
    return serverError('Similar projects error:', error);
  }
}
