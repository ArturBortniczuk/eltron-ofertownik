import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

interface Notice {
  id: string;
  type: 'approval' | 'task' | 'followup' | 'expiring' | 'viewed' | 'decision';
  title: string;
  subtitle?: string;
  href: string;
}

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const items: Notice[] = [];
    const counts = { approvals: 0, tasks: 0, followUps: 0, expiring: 0, viewed: 0, decisions: 0 };

    // Oferty czekające na akceptację marży (zarząd)
    if (user.isManagement) {
      const r = await db.query(`
        SELECT o.id, o.client_name, o.total_gross, u.name AS salesperson
        FROM offers o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.approval_status = 'pending' ORDER BY o.created_at DESC
      `);
      counts.approvals = r.rows.length;
      r.rows.slice(0, 4).forEach((o: any) =>
        items.push({ id: `ap-${o.id}`, type: 'approval', title: `Do akceptacji: oferta #${o.id}`, subtitle: `${o.client_name} • ${o.salesperson || ''}`, href: '/dashboard/approvals' })
      );
    }

    // Zadania na dziś i zaległe
    const tasks = await db.query(
      `SELECT id, title, due_date FROM tasks WHERE user_id = $1 AND done = false AND due_date <= CURRENT_DATE ORDER BY due_date`,
      [user.id]
    );
    counts.tasks = tasks.rows.length;
    tasks.rows.slice(0, 3).forEach((t: any) =>
      items.push({ id: `t-${t.id}`, type: 'task', title: t.title, subtitle: `Termin: ${new Date(t.due_date).toLocaleDateString('pl-PL')}`, href: '/dashboard/tasks' })
    );

    // Wysłane oferty bez odpowiedzi po terminie follow-up
    const follow = await db.query(
      `SELECT id, client_name FROM offers WHERE user_id = $1 AND status = 'sent' AND follow_up_date IS NOT NULL AND follow_up_date <= CURRENT_DATE ORDER BY follow_up_date LIMIT 20`,
      [user.id]
    );
    counts.followUps = follow.rows.length;
    follow.rows.slice(0, 3).forEach((o: any) =>
      items.push({ id: `f-${o.id}`, type: 'followup', title: `Wróć do klienta: ${o.client_name}`, subtitle: `Oferta #${o.id} czeka na odpowiedź`, href: `/dashboard/offers/${o.id}` })
    );

    // Oferty wygasające w ciągu 3 dni
    const expiring = await db.query(
      `SELECT id, client_name, (created_at + (valid_days || ' days')::interval)::date AS valid_until
       FROM offers
       WHERE user_id = $1 AND status = 'sent'
         AND created_at + (valid_days || ' days')::interval BETWEEN NOW() AND NOW() + INTERVAL '3 days'
       ORDER BY valid_until LIMIT 20`,
      [user.id]
    );
    counts.expiring = expiring.rows.length;
    expiring.rows.slice(0, 3).forEach((o: any) =>
      items.push({ id: `e-${o.id}`, type: 'expiring', title: `Oferta #${o.id} wygasa ${new Date(o.valid_until).toLocaleDateString('pl-PL')}`, subtitle: o.client_name, href: `/dashboard/offers/${o.id}` })
    );

    // Klient niedawno otworzył ofertę
    const viewed = await db.query(
      `SELECT id, client_name, view_count FROM offers
       WHERE user_id = $1 AND status = 'sent' AND viewed_at > NOW() - INTERVAL '3 days' ORDER BY viewed_at DESC LIMIT 20`,
      [user.id]
    );
    counts.viewed = viewed.rows.length;
    viewed.rows.slice(0, 3).forEach((o: any) =>
      items.push({ id: `v-${o.id}`, type: 'viewed', title: `${o.client_name} ogląda ofertę #${o.id}`, subtitle: `Otwarć: ${o.view_count}`, href: `/dashboard/offers/${o.id}` })
    );

    // Decyzje zarządu w sprawie marży (dla autora oferty)
    const decisions = await db.query(
      `SELECT id, client_name, approval_status FROM offers
       WHERE user_id = $1 AND approval_status IN ('approved','rejected') AND approved_at > NOW() - INTERVAL '7 days' AND status = 'draft'
       ORDER BY approved_at DESC LIMIT 20`,
      [user.id]
    );
    counts.decisions = decisions.rows.length;
    decisions.rows.slice(0, 3).forEach((o: any) =>
      items.push({
        id: `d-${o.id}`, type: 'decision',
        title: `Zarząd ${o.approval_status === 'approved' ? 'zaakceptował' : 'odrzucił'} marżę w ofercie #${o.id}`,
        subtitle: o.client_name, href: `/dashboard/offers/${o.id}`,
      })
    );

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ items, counts, total });
  } catch (error) {
    return serverError('Notifications error:', error);
  }
}
