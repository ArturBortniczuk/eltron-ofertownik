import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { computeOffer } from '../../../../lib/offer-calc';
import { validateCreateOffer } from '../../../../lib/validation';
import {
  getApiUser, unauthorized, forbidden, notFound, badRequest, serverError, OFFER_STATUSES,
} from '../../../../lib/api-auth';
import { insertOfferItems, logActivity, loadAccessibleOffer, canEditOffer, newToken, nextOfferNumber, cleanRemarks } from '../../../../lib/offers-db';
import { offerLabel, OUTCOMES } from '../../../../lib/offer-rules';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Szkic', sent: 'Wysłana', accepted: 'Wygrana', rejected: 'Przegrana',
};

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');

    const { offer, canAccess } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound('Oferta nie została znaleziona');
    if (!canAccess) return forbidden('Ta oferta należy do innego handlowca');

    const [owner, clientRow, items, activity, tasks, versions, rfqs] = await Promise.all([
      db.query('SELECT name, email, market_region FROM users WHERE id = $1', [offer.user_id]),
      offer.client_id ? db.query('SELECT nip, address, contact_person FROM clients WHERE id = $1', [offer.client_id]) : Promise.resolve({ rows: [] as any[] }),
      db.query('SELECT * FROM offer_items WHERE offer_id = $1 ORDER BY position_order', [offerId]),
      db.query('SELECT id, user_id, actor_name, type, message, created_at FROM offer_activity WHERE offer_id = $1 ORDER BY created_at DESC, id DESC', [offerId]),
      db.query('SELECT id, title, due_date, done FROM tasks WHERE offer_id = $1 ORDER BY done, due_date', [offerId]),
      db.query(
        `SELECT o.id, o.revision, o.total_net, o.total_gross, o.status, o.outcome, o.is_current, o.created_at,
                COALESCE(om.margin_percent, 0) AS margin_percent
         FROM offers o LEFT JOIN offer_margin_summary om ON om.offer_id = o.id
         WHERE o.offer_number = $1 ORDER BY o.revision, o.id`,
        [offer.offer_number]
      ),
      db.query('SELECT id, manufacturer, message, items, status, response, created_at, responded_at, applied_at FROM supplier_requests WHERE offer_id = $1 ORDER BY created_at DESC', [offerId]),
    ]);

    const isOwner = offer.user_id === user.id;
    // Tokeny publicznego linku widzi tylko właściciel i osoby z dostępem do całości
    const calc = user.canViewAll
      ? computeOffer({ items: items.rows, additional_costs: offer.additional_costs })
      : null;

    return NextResponse.json({
      offer: {
        ...offer,
        created_by_name: owner.rows[0]?.name,
        created_by_email: owner.rows[0]?.email,
        created_by_region: owner.rows[0]?.market_region,
        client_nip: clientRow.rows[0]?.nip,
        client_address: clientRow.rows[0]?.address,
        client_contact: clientRow.rows[0]?.contact_person,
      },
      items: items.rows,
      activity: activity.rows,
      tasks: tasks.rows,
      versions: versions.rows.map((v: any) => (user.canViewAll || offer.user_id === user.id ? v : { ...v, margin_percent: undefined })),
      rfqs: rfqs.rows,
      margin: calc ? { ...calc.totals, itemsMarginPercent: calc.itemsMarginPercent } : null,
      permissions: {
        canEdit: canEditOffer(offer, user) && offer.status !== 'accepted',
        canDelete: canEditOffer(offer, user),
        canApprove: user.isManagement && offer.approval_status === 'pending',
        canSeeMargins: user.canViewAll,
        isOwner,
        canExport: canEditOffer(offer, user),
      },
    });
  } catch (error) {
    return serverError('Get offer error:', error, 'Błąd pobierania oferty');
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');
    const data = await request.json();

    const { offer, canAccess } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound('Oferta nie została znaleziona');
    if (!canAccess) return forbidden();

    const action: string = data.action || (data.status ? 'status' : '');

    // Komentarze może dodawać każdy z dostępem do oferty; reszta - właściciel lub zarząd
    if (action !== 'comment' && !(canEditOffer(offer, user) || (action === 'approve' || action === 'reject') && user.isManagement)) {
      return forbidden('Tylko autor oferty lub zarząd może ją zmieniać');
    }

    switch (action) {
      case 'status': {
        const newStatus: string = data.status;
        if (!(OFFER_STATUSES as readonly string[]).includes(newStatus)) return badRequest('Nieprawidłowy status');
        if (newStatus === offer.status && !(data.outcome && newStatus !== 'draft' && newStatus !== 'sent')) {
          return NextResponse.json({ success: true, status: newStatus });
        }
        if (newStatus === 'sent' && ['pending', 'rejected'].includes(offer.approval_status)) {
          return badRequest(
            offer.approval_status === 'pending'
              ? 'Oferta czeka na akceptację marży przez zarząd - nie można jej jeszcze wysłać'
              : 'Zarząd odrzucił marżę tej oferty - popraw ceny i zapisz ofertę ponownie'
          );
        }

        // Wynik: wygrana / wygrana częściowo / przegrana (domyślnie wynika ze statusu)
        let outcome: string | null = null;
        let wonAmount: number | null = null;
        if (newStatus === 'accepted') {
          outcome = data.outcome === 'partial' ? 'partial' : 'won';
          if (outcome === 'partial') {
            wonAmount = Number(data.won_amount);
            if (!Number.isFinite(wonAmount) || wonAmount <= 0) return badRequest('Podaj wartość netto wygranej części oferty');
            if (wonAmount >= Number(offer.total_net)) outcome = 'won';
          }
          if (outcome === 'won') wonAmount = Number(offer.total_net);
        } else if (newStatus === 'rejected') {
          outcome = 'lost';
        }
        const lostReason = newStatus === 'rejected' || outcome === 'partial' ? (String(data.lost_reason || '').trim() || null) : null;
        const competitor = outcome === 'lost' || outcome === 'partial' ? (String(data.competitor || '').trim().slice(0, 255) || null) : null;

        await db.query(
          `UPDATE offers SET status = $1::text, updated_at = CURRENT_TIMESTAMP,
             sent_at = CASE WHEN $1::text IN ('sent','accepted','rejected') AND sent_at IS NULL THEN CURRENT_TIMESTAMP ELSE sent_at END,
             accepted_at = CASE WHEN $1::text = 'accepted' THEN CURRENT_TIMESTAMP ELSE NULL END,
             lost_reason = $3, outcome = $4, won_amount = $5, competitor = $6,
             closed_at = CASE WHEN $1::text IN ('accepted','rejected') THEN CURRENT_TIMESTAMP ELSE NULL END,
             follow_up_date = CASE WHEN $1::text = 'sent' AND follow_up_date IS NULL THEN CURRENT_DATE + 5
                                   WHEN $1::text IN ('accepted','rejected','draft') THEN NULL ELSE follow_up_date END
           WHERE id = $2`,
          [newStatus, offerId, lostReason, outcome, wonAmount, competitor]
        );
        if (newStatus !== 'sent') {
          await db.query(`UPDATE tasks SET done = true WHERE offer_id = $1 AND done = false AND title LIKE 'Zadzwonić%'`, [offerId]);
        }
        const label = outcome ? OUTCOMES[outcome].label : STATUS_LABELS[newStatus];
        await logActivity(db, offerId, user, 'status',
          `Status zmieniony na: ${label}` +
          (outcome === 'partial' ? ` (zamówiono ${Math.round(wonAmount || 0).toLocaleString('pl-PL')} zł netto z ${Math.round(Number(offer.total_net)).toLocaleString('pl-PL')} zł)` : '') +
          (lostReason ? ` – ${lostReason}` : '') + (competitor ? ` [konkurencja: ${competitor}]` : ''));
        return NextResponse.json({ success: true, status: newStatus, outcome });
      }

      case 'update': {
        if (offer.status === 'accepted') return badRequest('Zaakceptowanej oferty nie można edytować');
        const validation = validateCreateOffer(data);
        if (!validation.isValid) return NextResponse.json({ error: 'Błąd walidacji', details: validation.errors }, { status: 400 });

        const calc = computeOffer({ items: data.items, additional_costs: data.additional_costs });
        const additional = Math.max(0, Number(data.additional_costs) || 0);
        const wasApproved = offer.approval_status === 'approved';
        const approval = calc.needsApproval ? (wasApproved ? 'approved' : 'pending') : 'none';
        // Edycja oferty wysłanej z niezaakceptowaną marżą cofa ją do szkicu
        const status = approval === 'pending' && offer.status === 'sent' ? 'draft' : offer.status;

        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE offers SET client_id = $1, client_name = $2, client_email = $3, client_phone = $4,
               delivery_days = $5, valid_days = $6, additional_costs = $7, additional_costs_description = $8,
               notes = $9, total_net = $10, total_vat = $11, total_gross = $12, status = $13,
               approval_status = $14, updated_at = CURRENT_TIMESTAMP,
               project_name = $16, segment = $17, offer_type = $18, tender_deadline = $19,
               contact_person = $20, remarks = $21, approval_level = $22, cc_emails = $23
             WHERE id = $15`,
            [
              data.client_id || offer.client_id, data.client_name, data.client_email || null, data.client_phone || null,
              data.delivery_days, data.valid_days, additional, data.additional_costs_description || null,
              data.notes || null, calc.totals.net, calc.totals.vat, calc.totals.gross, status, approval, offerId,
              String(data.project_name).trim(), String(data.segment).trim(), data.offer_type === 'przetarg' ? 'przetarg' : 'zakup',
              data.offer_type === 'przetarg' && data.tender_deadline ? String(data.tender_deadline).slice(0, 10) : null,
              String(data.contact_person || '').trim() || null, JSON.stringify(cleanRemarks(data.remarks)),
              calc.approvalLevel, String(data.cc_emails || '').trim() || null,
            ]
          );
          await client.query('DELETE FROM offer_items WHERE offer_id = $1', [offerId]);
          await insertOfferItems(client, offerId, calc.items, user);
          await logActivity(client, offerId, user, 'edited', 'Zmieniono treść oferty');
          if (approval === 'pending' && offer.approval_status !== 'pending') {
            await logActivity(client, offerId, user, 'approval', `Oferta wymaga akceptacji zarządu: ${calc.approvalReasons.join('; ')}`);
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
        return NextResponse.json({ success: true, status, approval_status: approval, needsApproval: calc.needsApproval, approvalReasons: calc.approvalReasons });
      }

      case 'follow_up': {
        const date = data.follow_up_date ? String(data.follow_up_date).slice(0, 10) : null;
        await db.query('UPDATE offers SET follow_up_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [date, offerId]);
        if (date && data.create_task) {
          await db.query(
            `INSERT INTO tasks (user_id, offer_id, client_id, title, due_date) VALUES ($1, $2, $3, $4, $5)`,
            [offer.user_id, offerId, offer.client_id, `Zadzwonić do ${offer.client_name} w sprawie oferty`, date]
          );
        }
        await logActivity(db, offerId, user, 'comment', date ? `Ustawiono przypomnienie na ${date}` : 'Usunięto przypomnienie');
        return NextResponse.json({ success: true });
      }

      case 'comment': {
        const message = String(data.message || '').trim();
        if (!message) return badRequest('Komentarz nie może być pusty');
        await logActivity(db, offerId, user, 'comment', message.slice(0, 2000));
        return NextResponse.json({ success: true });
      }

      case 'send_email': {
        if (['pending', 'rejected'].includes(offer.approval_status)) {
          return badRequest('Oferta czeka na akceptację marży - nie można jej jeszcze wysłać');
        }
        const to = String(data.to || offer.client_email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return badRequest('Podaj poprawny adres e-mail');
        // Wersja demo: wiadomość nie jest faktycznie wysyłana - zapisujemy tylko akcję w historii
        await db.query(
          `UPDATE offers SET
             status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
             sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
             follow_up_date = COALESCE(follow_up_date, CURRENT_DATE + 5),
             public_token = COALESCE(public_token, $2),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [offerId, newToken()]
        );
        const cc = String(data.cc || '').split(/[;,\s]+/).map((x: string) => x.trim()).filter((x: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
        if (cc.length) await db.query('UPDATE offers SET cc_emails = $2 WHERE id = $1', [offerId, cc.join(', ')]);
        await logActivity(db, offerId, user, 'email',
          `Wysłano ofertę ${offerLabel(offer)} e-mailem do ${offer.contact_person || to} <${to}>${cc.length ? `, DW: ${cc.join(', ')}` : ''} (symulacja w wersji demo)`);
        if (offer.status === 'draft') await logActivity(db, offerId, user, 'status', 'Status zmieniony na: Wysłana');
        return NextResponse.json({ success: true, sentTo: to });
      }

      case 'approve':
      case 'reject': {
        if (!user.isManagement) return forbidden('Marżę akceptuje tylko zarząd');
        if (offer.approval_status !== 'pending') return badRequest('Ta oferta nie czeka na akceptację');
        const note = String(data.note || '').trim() || null;
        const approved = action === 'approve';
        await db.query(
          `UPDATE offers SET approval_status = $1, approval_note = $2, approved_by = $3, approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
          [approved ? 'approved' : 'rejected', note, user.id, offerId]
        );
        await logActivity(db, offerId, user, 'approval', `${approved ? 'Zaakceptowano' : 'Odrzucono'} niską marżę${note ? `: ${note}` : ''}`);
        return NextResponse.json({ success: true, approval_status: approved ? 'approved' : 'rejected' });
      }

      default:
        return badRequest('Nieznana akcja');
    }
  } catch (error) {
    return serverError('Update offer error:', error, 'Błąd aktualizacji oferty');
  }
}

// Duplikowanie oferty i zapis jako szablon
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');
    const data = await request.json().catch(() => ({}));

    const { offer, canAccess } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound('Oferta nie została znaleziona');
    if (!canAccess) return forbidden();

    const itemsResult = await db.query('SELECT * FROM offer_items WHERE offer_id = $1 ORDER BY position_order', [offerId]);

    if (data.action === 'save_template') {
      const name = String(data.name || '').trim();
      if (!name) return badRequest('Podaj nazwę szablonu');
      const payload = {
        delivery_days: offer.delivery_days,
        valid_days: offer.valid_days,
        notes: offer.notes,
        items: itemsResult.rows.map((i: any) => ({
          product_name: i.product_name, unit: i.unit, quantity: i.quantity, unit_price: i.original_price || i.unit_price,
          vat_rate: i.vat_rate, cost_price: i.cost_price, margin_percent: i.margin_percent,
          discount_percent: 0, original_price: i.original_price || i.unit_price,
        })),
      };
      const created = await db.query(
        'INSERT INTO offer_templates (name, description, created_by, payload) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, String(data.description || '').trim() || null, user.id, JSON.stringify(payload)]
      );
      return NextResponse.json({ success: true, templateId: created.rows[0].id });
    }

    if (data.action !== 'duplicate' && data.action !== 'variant') return badRequest('Nieznana akcja');
    const isVariant = data.action === 'variant';
    if (isVariant && !canEditOffer(offer, user)) return forbidden('Wariant może utworzyć autor oferty lub zarząd');

    const calc = computeOffer({ items: itemsResult.rows, additional_costs: offer.additional_costs });
    const approval = calc.needsApproval ? 'pending' : 'none';

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Wariant negocjacyjny dostaje ten sam numer + kolejną rewizję (OF/2026/0042.1, .2 ...), kopia - nowy numer
      let offerNumber: string;
      let revision = 0;
      if (isVariant) {
        offerNumber = offer.offer_number;
        const rev = await client.query('SELECT COALESCE(MAX(revision), 0) + 1 AS n FROM offers WHERE offer_number = $1', [offerNumber]);
        revision = rev.rows[0].n;
      } else {
        offerNumber = await nextOfferNumber(client);
      }

      const created = await client.query(
        `INSERT INTO offers (user_id, client_id, client_name, client_email, client_phone, delivery_days, valid_days,
           additional_costs, additional_costs_description, notes, total_net, total_vat, total_gross, status, public_token, approval_status,
           offer_number, revision, parent_offer_id, is_current, project_name, segment, offer_type, tender_deadline,
           contact_person, remarks, approval_level, cc_emails)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16,$17,$18,true,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING id`,
        [
          user.id, offer.client_id, offer.client_name, offer.client_email, offer.client_phone, offer.delivery_days,
          offer.valid_days, offer.additional_costs, offer.additional_costs_description, offer.notes,
          calc.totals.net, calc.totals.vat, calc.totals.gross, newToken(), approval,
          offerNumber, revision, isVariant ? offerId : null, offer.project_name, offer.segment, offer.offer_type || 'zakup',
          offer.tender_deadline, offer.contact_person, JSON.stringify(offer.remarks || []), calc.approvalLevel, offer.cc_emails,
        ]
      );
      const newId = created.rows[0].id;
      await insertOfferItems(client, newId, calc.items, user);
      if (isVariant) {
        await client.query('UPDATE offers SET is_current = false WHERE offer_number = $1 AND id <> $2', [offerNumber, newId]);
        await logActivity(client, newId, user, 'created', `Utworzono wariant negocjacyjny ${offerLabel({ offer_number: offerNumber, revision })} na bazie ${offerLabel(offer)}`);
        await logActivity(client, offerId, user, 'comment', `Rozpoczęto negocjacje: powstał wariant ${offerLabel({ offer_number: offerNumber, revision })}`);
      } else {
        await logActivity(client, newId, user, 'created', `Utworzono jako kopię oferty ${offerLabel(offer)}`);
      }
      if (approval === 'pending') await logActivity(client, newId, user, 'approval', `Oferta wymaga akceptacji zarządu: ${calc.approvalReasons.join('; ')}`);
      await client.query('COMMIT');
      return NextResponse.json({ success: true, offerId: newId, offerNumber, revision });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    return serverError('Offer POST error:', error, 'Błąd operacji na ofercie');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');

    const { offer } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound('Oferta nie została znaleziona');
    if (!canEditOffer(offer, user)) return forbidden('Tylko autor oferty lub zarząd może ją usunąć');

    await db.query('DELETE FROM offers WHERE id = $1', [offerId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Delete offer error:', error, 'Błąd usuwania oferty');
  }
}
