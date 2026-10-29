// app/api/clients/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

async function loadClient(id: number) {
  const r = await db.query(
    `SELECT c.*, u.name AS owner_name FROM clients c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const client = await loadClient(clientId);
    if (!client) return notFound('Klient nie został znaleziony');
    if (!user.canViewAll && client.created_by !== user.id) return forbidden('Ten klient należy do innego handlowca');

    return NextResponse.json(client);
  } catch (error) {
    return serverError('Get client error:', error, 'Błąd pobierania klienta');
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');
    const data = await request.json();

    const existing = await loadClient(clientId);
    if (!existing) return notFound('Klient nie został znaleziony');
    if (existing.created_by !== user.id && !user.isManagement) return forbidden();

    const result = await db.query(
      `UPDATE clients SET
         name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
         address = COALESCE($4, address), nip = COALESCE($5, nip), contact_person = COALESCE($6, contact_person),
         notes = COALESCE($7, notes), last_used = COALESCE($8, last_used)
       WHERE id = $9 RETURNING *`,
      [
        data.name || null, data.email || null, data.phone || null, data.address || null, data.nip || null,
        data.contact_person || null, data.notes || null, data.last_used || null, clientId,
      ]
    );

    return NextResponse.json({ success: true, client: result.rows[0], message: 'Klient został zaktualizowany' });
  } catch (error) {
    return serverError('Update client error:', error, 'Błąd podczas aktualizacji klienta');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const existing = await loadClient(clientId);
    if (!existing) return notFound('Klient nie został znaleziony');
    if (existing.created_by !== user.id && !user.isManagement) return forbidden();

    const offers = await db.query('SELECT COUNT(*) AS n FROM offers WHERE client_id = $1', [clientId]);
    if (offers.rows[0].n > 0) {
      return badRequest(`Klient ma ${offers.rows[0].n} ofert - najpierw je usuń albo zostaw klienta w bazie`);
    }

    await db.query('DELETE FROM clients WHERE id = $1', [clientId]);
    return NextResponse.json({ success: true, message: 'Klient został usunięty' });
  } catch (error) {
    return serverError('Delete client error:', error, 'Błąd podczas usuwania klienta');
  }
}
