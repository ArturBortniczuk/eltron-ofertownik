import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { validateCreateOffer } from '../../../lib/validation';
import { computeOffer } from '../../../lib/offer-calc';
import { getApiUser, unauthorized, serverError, intParam } from '../../../lib/api-auth';
import { insertOfferItems, logActivity, newToken } from '../../../lib/offers-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const data = await request.json();

    const validation = validateCreateOffer(data);
    if (!validation.isValid) {
      return NextResponse.json({ error: 'Błąd walidacji', details: validation.errors }, { status: 400 });
    }

    // Ceny i sumy zawsze liczymy po stronie serwera
    const calc = computeOffer({ items: data.items, additional_costs: data.additional_costs });
    const wantsSent = data.status === 'sent';
    let status = wantsSent ? 'sent' : 'draft';
    let approval = 'none';
    let blockedSend = false;
    if (calc.needsApproval) {
      approval = 'pending';
      if (wantsSent) {
        status = 'draft';
        blockedSend = true;
      }
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const additional = Math.max(0, Number(data.additional_costs) || 0);
      const offerResult = await client.query(
        `INSERT INTO offers (
           user_id, client_id, client_name, client_email, client_phone,
           delivery_days, valid_days, additional_costs, additional_costs_description,
           notes, total_net, total_vat, total_gross, status, public_token,
           approval_status, sent_at, follow_up_date
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           ${status === 'sent' ? 'CURRENT_TIMESTAMP' : 'NULL'},
           ${status === 'sent' ? "CURRENT_DATE + 5" : 'NULL'})
         RETURNING id`,
        [
          user.id, data.client_id || null, data.client_name, data.client_email || null, data.client_phone || null,
          data.delivery_days, data.valid_days, additional, data.additional_costs_description || null,
          data.notes || null, calc.totals.net, calc.totals.vat, calc.totals.gross, status, newToken(), approval,
        ]
      );
      const offerId = offerResult.rows[0].id;

      if (data.client_id) {
        await client.query('UPDATE clients SET last_used = CURRENT_TIMESTAMP WHERE id = $1', [data.client_id]);
      }

      await insertOfferItems(client, offerId, calc.items, user);

      await logActivity(client, offerId, user, 'created', 'Utworzono ofertę');
      if (approval === 'pending') {
        await logActivity(client, offerId, user, 'approval', `Oferta wymaga akceptacji zarządu: ${calc.approvalReasons.join('; ')}`);
      }
      if (status === 'sent') await logActivity(client, offerId, user, 'status', 'Status zmieniony na: Wysłana');

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        offerId,
        status,
        approval_status: approval,
        needsApproval: calc.needsApproval,
        blockedSend,
        approvalReasons: calc.approvalReasons,
        message: blockedSend
          ? 'Oferta zapisana jako szkic - niska marża wymaga akceptacji zarządu przed wysłaniem'
          : 'Oferta została zapisana pomyślnie',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return serverError('Create offer error:', error, 'Błąd podczas tworzenia oferty');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const page = intParam(searchParams.get('page'), 1, 1, 100000);
    const limit = intParam(searchParams.get('limit'), 10, 1, 500);
    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const q = (searchParams.get('q') || '').trim();
    const approval = searchParams.get('approval');
    const salesperson = searchParams.get('user_id');
    const sort = searchParams.get('sort') || 'created_desc';
    const offset = (page - 1) * limit;

    // Warunki wspólne (bez statusu) - potrzebne też do liczników statusów
    const params: any[] = [];
    const conditions: string[] = [];
    const add = (sql: string, value: any) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };

    if (!user.canViewAll) add('o.user_id = ?', user.id);
    else if (salesperson) add('o.user_id = ?', parseInt(salesperson, 10) || 0);
    if (clientId) add('o.client_id = ?', parseInt(clientId, 10) || 0);
    if (approval) add('o.approval_status = ?', approval);
    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      const asId = /^#?\d+$/.test(q) ? parseInt(q.replace('#', ''), 10) : -1;
      params.push(asId);
      conditions.push(`(o.client_name ILIKE $${idx} OR o.id = $${params.length})`);
    }
    const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const statusParams = [...params];
    let where = baseWhere;
    if (status) {
      statusParams.push(status);
      where = `${baseWhere ? baseWhere + ' AND' : 'WHERE'} o.status = $${statusParams.length}`;
    }

    const orderBy =
      ({
        created_desc: 'o.created_at DESC',
        created_asc: 'o.created_at ASC',
        value_desc: 'o.total_gross DESC',
        value_asc: 'o.total_gross ASC',
      } as Record<string, string>)[sort] || 'o.created_at DESC';

    const select = user.canViewAll
      ? `SELECT o.id, o.user_id, o.client_id, o.client_name, o.client_email, o.client_phone,
           o.delivery_days, o.valid_days, o.total_net, o.total_gross, o.status, o.created_at,
           o.approval_status, o.follow_up_date, o.view_count, o.viewed_at, o.sent_at, o.accepted_at, o.public_token,
           u.name AS salesperson_name, u.market_region,
           COALESCE(om.total_cost, 0) AS total_cost, COALESCE(om.total_margin, 0) AS total_margin,
           COALESCE(om.margin_percent, 0) AS margin_percent`
      : `SELECT o.id, o.user_id, o.client_id, o.client_name, o.client_email, o.client_phone,
           o.delivery_days, o.valid_days, o.total_net, o.total_gross, o.status, o.created_at,
           o.approval_status, o.follow_up_date, o.view_count, o.viewed_at, o.sent_at, o.accepted_at, o.public_token`;
    const joins = user.canViewAll
      ? `FROM offers o LEFT JOIN users u ON o.user_id = u.id LEFT JOIN offer_margin_summary om ON o.id = om.offer_id`
      : `FROM offers o`;

    const [list, count, statusCounts] = await Promise.all([
      db.query(
        `${select} ${joins} ${where} ORDER BY ${orderBy}, o.id DESC LIMIT $${statusParams.length + 1} OFFSET $${statusParams.length + 2}`,
        [...statusParams, limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS count, COALESCE(SUM(o.total_gross), 0) AS value FROM offers o ${where}`, statusParams),
      db.query(`SELECT o.status, COUNT(*) AS count FROM offers o ${baseWhere} GROUP BY o.status`, params),
    ]);

    const totalCount = count.rows[0].count;
    const totalPages = Math.ceil(totalCount / limit);
    const byStatus: Record<string, number> = {};
    statusCounts.rows.forEach((r: any) => { byStatus[r.status] = r.count; });

    return NextResponse.json({
      offers: list.rows,
      statusCounts: byStatus,
      totalValue: count.rows[0].value,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    return serverError('Get offers error:', error, 'Błąd pobierania ofert');
  }
}
