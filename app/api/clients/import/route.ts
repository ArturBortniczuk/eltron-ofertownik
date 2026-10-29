// Import klientów z CSV (wiersze parsowane w przeglądarce); klienci trafiają do importującego
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) return badRequest('Brak wierszy do importu');
    if (rows.length > 1000) return badRequest('Maksymalnie 1000 klientów w jednym imporcie');

    const client = await db.connect();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = String(r.name || '').trim();
        if (!name) { errors.push(`Wiersz ${i + 2}: brak nazwy`); continue; }
        const nip = r.nip ? String(r.nip).replace(/[\s-]/g, '') : null;

        // Duplikat: ten sam NIP albo ta sama nazwa
        const dup = await client.query(
          'SELECT id FROM clients WHERE (($1::text IS NOT NULL AND REPLACE(REPLACE(nip, \'-\', \'\'), \' \', \'\') = $1) OR LOWER(name) = LOWER($2)) LIMIT 1',
          [nip, name]
        );
        if (dup.rows.length > 0) { skipped++; continue; }

        await client.query(
          `INSERT INTO clients (name, email, phone, address, nip, contact_person, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            name.slice(0, 255), r.email ? String(r.email).trim().slice(0, 255) : null, r.phone ? String(r.phone).trim().slice(0, 50) : null,
            r.address ? String(r.address).trim() : null, nip ? nip.slice(0, 50) : null,
            r.contact_person ? String(r.contact_person).trim().slice(0, 255) : null, r.notes ? String(r.notes).trim() : null, user.id,
          ]
        );
        created++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, created, skipped, errors: errors.slice(0, 20) });
  } catch (error) {
    return serverError('Import clients error:', error, 'Błąd importu klientów');
  }
}
