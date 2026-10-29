// Eksport do CSV (otwiera się w Excelu): oferty, klienci, produkty
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError } from '../../../../lib/api-auth';
import { toCsv } from '../../../../lib/csv';
import { STATUS_META } from '../../../../lib/format';

export const dynamic = 'force-dynamic';

const fmtDate = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export async function GET(request: NextRequest, { params }: { params: { type: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const url = new URL(request.url);
    let header: string[];
    let rows: unknown[][];

    if (params.type === 'offers') {
      const status = url.searchParams.get('status');
      const args: any[] = [];
      const where: string[] = [];
      if (!user.canViewAll) { args.push(user.id); where.push(`o.user_id = $${args.length}`); }
      if (status) { args.push(status); where.push(`o.status = $${args.length}`); }
      const r = await db.query(
        `SELECT o.id, o.created_at, o.client_name, u.name AS salesperson, u.market_region, o.status,
                o.total_net, o.total_vat, o.total_gross, o.delivery_days, o.valid_days, o.approval_status,
                COALESCE(om.total_margin, 0) AS margin, COALESCE(om.margin_percent, 0) AS margin_percent
         FROM offers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN offer_margin_summary om ON om.offer_id = o.id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.created_at DESC`,
        args
      );
      header = ['Nr oferty', 'Data', 'Klient', 'Handlowiec', 'Region', 'Status', 'Netto', 'VAT', 'Brutto', 'Dostawa (dni)', 'Ważność (dni)'];
      if (user.canViewAll) header.push('Zysk', 'Marża %');
      rows = r.rows.map((o: any) => {
        const base = [o.id, fmtDate(o.created_at), o.client_name, o.salesperson, o.market_region, STATUS_META[o.status]?.label || o.status,
          o.total_net, o.total_vat, o.total_gross, o.delivery_days, o.valid_days];
        return user.canViewAll ? [...base, o.margin, o.margin_percent] : base;
      });
    } else if (params.type === 'clients') {
      const r = await db.query(
        `SELECT c.name, c.contact_person, c.email, c.phone, c.nip, c.address, u.name AS owner,
                COUNT(o.id) AS offers, COALESCE(SUM(CASE WHEN o.status = 'accepted' THEN o.total_gross END), 0) AS won
         FROM clients c LEFT JOIN users u ON u.id = c.created_by LEFT JOIN offers o ON o.client_id = c.id
         ${user.canViewAll ? '' : 'WHERE c.created_by = $1'}
         GROUP BY c.id, u.name ORDER BY c.name`,
        user.canViewAll ? [] : [user.id]
      );
      header = ['Nazwa', 'Osoba kontaktowa', 'E-mail', 'Telefon', 'NIP', 'Adres', 'Opiekun', 'Liczba ofert', 'Wartość wygranych (brutto)'];
      rows = r.rows.map((c: any) => [c.name, c.contact_person, c.email, c.phone, c.nip, c.address, c.owner, c.offers, c.won]);
    } else if (params.type === 'products') {
      const r = await db.query(
        `SELECT p.name, p.unit, p.sku, p.category, pm.cost_price, pm.margin_percent
         FROM products p LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $1 ORDER BY p.category NULLS LAST, p.name`,
        [user.id]
      );
      header = user.canViewAll ? ['Nazwa', 'Jednostka', 'SKU', 'Kategoria', 'Cena zakupu', 'Marża %'] : ['Nazwa', 'Jednostka', 'SKU', 'Kategoria', 'Cena katalogowa'];
      rows = r.rows.map((p: any) =>
        user.canViewAll
          ? [p.name, p.unit, p.sku, p.category, p.cost_price, p.margin_percent]
          : [p.name, p.unit, p.sku, p.category, p.cost_price > 0 ? Math.round(p.cost_price * (1 + p.margin_percent / 100) * 100) / 100 : '']
      );
    } else {
      return badRequest('Nieznany typ eksportu');
    }

    return new NextResponse(toCsv(header, rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${params.type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return serverError('Export error:', error, 'Błąd eksportu');
  }
}
