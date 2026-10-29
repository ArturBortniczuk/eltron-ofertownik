'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { StatusBadge, ApprovalBadge } from '../../../components/StatusBadge';
import { formatCurrency, formatDate, formatDateTime, marginBadge, timeAgo } from '../../../../lib/format';

interface OfferItem {
  id: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  cost_price: number;
  margin_percent: number;
  discount_percent: number;
}

interface OfferDetails {
  offer: {
    id: number;
    client_id?: number;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    delivery_days: number;
    valid_days: number;
    additional_costs: number;
    additional_costs_description?: string;
    notes?: string;
    total_net: number;
    total_vat: number;
    total_gross: number;
    status: string;
    created_at: string;
    sent_at?: string;
    accepted_at?: string;
    created_by_name: string;
    created_by_email: string;
    approval_status?: string;
    approval_note?: string;
    follow_up_date?: string | null;
    lost_reason?: string;
    view_count?: number;
    viewed_at?: string;
    public_token?: string;
  };
  items: OfferItem[];
  activity: Array<{ id: number; actor_name?: string; type: string; message: string; created_at: string }>;
  tasks: Array<{ id: number; title: string; due_date: string; done: boolean }>;
  margin: { net: number; cost: number; margin: number; marginPercent: number; itemsMarginPercent: number | null } | null;
  permissions: { canEdit: boolean; canDelete: boolean; canApprove: boolean; canSeeMargins: boolean; isOwner: boolean };
}

const PDFDownloadButtonPrimary = dynamic(
  () => import('../../../components/PDFDocument').then((mod) => mod.PDFDownloadButtonPrimary),
  { ssr: false, loading: () => <button className="btn-primary" disabled>⏳ Ładowanie...</button> }
);

const ACTIVITY_ICON: Record<string, string> = {
  created: '🆕', status: '🔄', comment: '💬', email: '✉️', approval: '🛡️', viewed: '👀', client_response: '🤝', edited: '✏️',
};

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;

  const [data, setData] = useState<OfferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const [comment, setComment] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [followTask, setFollowTask] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchOffer = useCallback(async () => {
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const d: OfferDetails = await response.json();
        setData(d);
        setFollowUp(d.offer.follow_up_date ? d.offer.follow_up_date.slice(0, 10) : '');
        setEmailTo((cur) => cur || d.offer.client_email || '');
        setError('');
      } else {
        setError((await response.json()).error || 'Nie znaleziono oferty');
      }
    } catch {
      setError('Błąd ładowania oferty');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  const put = async (body: Record<string, unknown>, success?: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const response = await fetch(`/api/offers/${offerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Operacja nie powiodła się');
        return false;
      }
      if (success) setInfo(success);
      await fetchOffer();
      return true;
    } catch {
      setError('Operacja nie powiodła się');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/offers/${offerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: response.ok, body: await response.json() };
  };

  const updateStatus = (status: string) => {
    if (status === 'rejected') {
      const reason = window.prompt('Dlaczego oferta została odrzucona? (opcjonalnie)', '');
      if (reason === null) return;
      return put({ action: 'status', status, lost_reason: reason });
    }
    return put({ action: 'status', status });
  };

  const deleteOffer = async () => {
    if (!confirm('Czy na pewno chcesz usunąć tę ofertę?')) return;
    const response = await fetch(`/api/offers/${offerId}`, { method: 'DELETE' });
    if (response.ok) router.push('/dashboard/offers');
    else setError((await response.json()).error || 'Błąd usuwania oferty');
  };

  const duplicate = async () => {
    setBusy(true);
    const r = await post({ action: 'duplicate' });
    setBusy(false);
    if (r.ok) router.push(`/dashboard/offers/${r.body.offerId}`);
    else setError(r.body.error || 'Nie udało się skopiować oferty');
  };

  const saveTemplate = async () => {
    const name = window.prompt('Nazwa szablonu:', `Szablon: ${data?.offer.client_name || ''}`);
    if (!name) return;
    const r = await post({ action: 'save_template', name });
    if (r.ok) setInfo('Zapisano szablon – znajdziesz go w kreatorze nowej oferty.');
    else setError(r.body.error || 'Nie udało się zapisać szablonu');
  };

  const publicUrl = data?.offer.public_token ? `${window.location.origin}/o/${data.offer.public_token}` : '';
  const copyLink = async () => {
    await navigator.clipboard?.writeText(publicUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="text-lg">Ładowanie oferty...</div></div>;

  if (!data) {
    return (
      <div className="card text-center">
        <div className="text-red-600 text-lg mb-4">{error || 'Nie znaleziono oferty'}</div>
        <Link href="/dashboard/offers" className="btn-primary">Powrót do listy ofert</Link>
      </div>
    );
  }

  const { offer, items, permissions, margin } = data;
  const validUntil = new Date(new Date(offer.created_at).getTime() + offer.valid_days * 86400000);
  const expired = validUntil < new Date() && offer.status === 'sent';
  const blocked = offer.approval_status === 'pending' || offer.approval_status === 'rejected';
  const showMargins = permissions.canSeeMargins;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">Oferta #{offer.id}</h1>
            <StatusBadge status={offer.status} large />
            <ApprovalBadge status={offer.approval_status} />
            {expired && <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">Termin ważności minął</span>}
          </div>
          <p className="text-gray-600">Utworzona {formatDate(offer.created_at)} przez {offer.created_by_name}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <PDFDownloadButtonPrimary offer={offer as any} items={items as any} />
          <button onClick={() => setShowEmail(true)} disabled={blocked} title={blocked ? 'Najpierw akceptacja marży' : ''} className="btn-secondary disabled:opacity-50">✉️ Wyślij e-mailem</button>
          <button onClick={duplicate} disabled={busy} className="btn-secondary">📄 Kopiuj</button>
          <button onClick={saveTemplate} className="btn-secondary">💾 Jako szablon</button>
          {permissions.canEdit && <Link href={`/dashboard/offers/new?edit=${offer.id}`} className="btn-secondary">✏️ Edytuj</Link>}
          {permissions.canDelete && <button onClick={deleteOffer} className="btn-danger">🗑️ Usuń</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}
      {info && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">{info}</div>}

      {/* Akceptacja marży */}
      {offer.approval_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="font-semibold text-amber-900">🛡️ Oferta czeka na akceptację marży przez zarząd</div>
          <p className="text-sm text-amber-800 mt-1">
            {permissions.isOwner
              ? 'Do czasu decyzji nie możesz jej wysłać do klienta. Zarząd dostał powiadomienie.'
              : 'Marża jest poniżej ustalonego progu.'}
          </p>
          {permissions.canApprove && (
            <div className="mt-3 flex flex-col md:flex-row gap-3">
              <input value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} className="input-field flex-1" placeholder="Komentarz dla handlowca (opcjonalnie)" />
              <button disabled={busy} onClick={() => put({ action: 'approve', note: approvalNote }, 'Marża zaakceptowana')} className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50">✅ Zaakceptuj</button>
              <button disabled={busy} onClick={() => put({ action: 'reject', note: approvalNote }, 'Marża odrzucona')} className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50">❌ Odrzuć</button>
            </div>
          )}
        </div>
      )}
      {offer.approval_status === 'approved' && offer.approval_note && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">✅ Zarząd zaakceptował marżę: „{offer.approval_note}”</div>
      )}
      {offer.approval_status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
          ❌ Zarząd odrzucił marżę{offer.approval_note ? `: „${offer.approval_note}”` : ''}. Popraw ceny w edycji oferty i zapisz ją ponownie.
        </div>
      )}

      {/* Przyciski statusu */}
      {permissions.canEdit && (
        <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-gray-600">Status oferty</div>
          <div className="flex flex-wrap gap-2">
            {offer.status !== 'draft' && <button disabled={busy} onClick={() => updateStatus('draft')} className="btn-secondary text-sm">↩ Wróć do szkicu</button>}
            {offer.status !== 'sent' && <button disabled={busy || blocked} onClick={() => updateStatus('sent')} className="btn-secondary text-sm disabled:opacity-50">📤 Oznacz jako wysłaną</button>}
            {offer.status !== 'accepted' && <button disabled={busy || offer.status === 'draft'} onClick={() => updateStatus('accepted')} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">✅ Zaakceptowana</button>}
            {offer.status !== 'rejected' && <button disabled={busy || offer.status === 'draft'} onClick={() => updateStatus('rejected')} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">❌ Odrzucona</button>}
          </div>
        </div>
      )}
      {offer.status === 'rejected' && offer.lost_reason && (
        <div className="text-sm text-gray-700 bg-gray-100 rounded-lg px-4 py-2">Powód odrzucenia: <strong>{offer.lost_reason}</strong></div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Klient i warunki</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="text-gray-600 mb-1">Klient</div>
                <div className="font-medium">
                  {offer.client_id ? <Link href={`/dashboard/clients/${offer.client_id}`} className="text-eltron-primary hover:underline">{offer.client_name}</Link> : offer.client_name}
                </div>
              </div>
              {offer.client_email && (
                <div><div className="text-gray-600 mb-1">E-mail</div><a href={`mailto:${offer.client_email}`} className="font-medium text-eltron-primary hover:underline">{offer.client_email}</a></div>
              )}
              {offer.client_phone && (
                <div><div className="text-gray-600 mb-1">Telefon</div><a href={`tel:${offer.client_phone}`} className="font-medium text-eltron-primary hover:underline">{offer.client_phone}</a></div>
              )}
              <div><div className="text-gray-600 mb-1">Dostawa</div><div className="font-medium">{offer.delivery_days} dni</div></div>
              <div><div className="text-gray-600 mb-1">Ważna do</div><div className={`font-medium ${expired ? 'text-red-600' : ''}`}>{formatDate(validUntil)}</div></div>
              <div><div className="text-gray-600 mb-1">Wartość brutto</div><div className="font-bold text-eltron-primary">{formatCurrency(offer.total_gross)}</div></div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pozycje oferty</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-700">
                    <th className="py-3 px-2 font-medium">Lp.</th>
                    <th className="py-3 px-2 font-medium">Produkt</th>
                    <th className="py-3 px-2 font-medium">Ilość</th>
                    <th className="py-3 px-2 font-medium text-right">Cena netto</th>
                    {showMargins && <><th className="py-3 px-2 font-medium text-right">Koszt</th><th className="py-3 px-2 font-medium text-right">Rabat</th><th className="py-3 px-2 font-medium text-right">Marża</th></>}
                    <th className="py-3 px-2 font-medium text-right">VAT</th>
                    <th className="py-3 px-2 font-medium text-right">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="table-row">
                      <td className="py-3 px-2 text-gray-600">{index + 1}</td>
                      <td className="py-3 px-2 font-medium text-gray-900">{item.product_name}</td>
                      <td className="py-3 px-2 whitespace-nowrap">{item.quantity} {item.unit}</td>
                      <td className="py-3 px-2 text-right whitespace-nowrap">{formatCurrency(item.unit_price)}</td>
                      {showMargins && (
                        <>
                          <td className="py-3 px-2 text-right text-gray-600 whitespace-nowrap">{item.cost_price ? formatCurrency(item.cost_price) : '-'}</td>
                          <td className="py-3 px-2 text-right text-gray-600">{item.discount_percent ? `${item.discount_percent.toFixed(1)}%` : '-'}</td>
                          <td className="py-3 px-2 text-right">
                            {item.cost_price ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge(item.margin_percent)}`}>{item.margin_percent.toFixed(1)}%</span> : '-'}
                          </td>
                        </>
                      )}
                      <td className="py-3 px-2 text-right">{item.vat_rate}%</td>
                      <td className="py-3 px-2 text-right font-medium whitespace-nowrap">{formatCurrency(item.gross_amount)}</td>
                    </tr>
                  ))}
                  {offer.additional_costs > 0 && (
                    <tr className="table-row border-t border-gray-300">
                      <td className="py-3 px-2"></td>
                      <td className="py-3 px-2 font-medium text-gray-900">{offer.additional_costs_description || 'Dodatkowe koszty'}</td>
                      <td className="py-3 px-2">1 usł</td>
                      <td className="py-3 px-2 text-right">{formatCurrency(offer.additional_costs)}</td>
                      {showMargins && <><td className="py-3 px-2"></td><td className="py-3 px-2"></td><td className="py-3 px-2"></td></>}
                      <td className="py-3 px-2 text-right">23%</td>
                      <td className="py-3 px-2 text-right font-medium">{formatCurrency(offer.additional_costs * 1.23)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-6 flex flex-col md:flex-row md:justify-between gap-6">
              {showMargins && margin ? (
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5 md:w-72">
                  <div className="font-semibold text-gray-900 mb-2">Rentowność (widoczna dla zarządu)</div>
                  <div className="flex justify-between"><span className="text-gray-600">Koszt własny:</span><span>{formatCurrency(margin.cost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Zysk:</span><span className="font-medium text-green-700">{formatCurrency(margin.margin)}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Marża (na koszt):</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${marginBadge(margin.itemsMarginPercent ?? margin.marginPercent)}`}>
                      {(margin.itemsMarginPercent ?? margin.marginPercent).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ) : <div />}
              <div className="w-full md:w-80 space-y-2">
                <div className="flex justify-between"><span className="text-gray-600">Wartość netto:</span><span className="font-medium">{formatCurrency(offer.total_net)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">VAT:</span><span className="font-medium">{formatCurrency(offer.total_vat)}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-lg font-semibold">RAZEM:</span>
                  <span className="text-lg font-bold text-eltron-primary">{formatCurrency(offer.total_gross)}</span>
                </div>
              </div>
            </div>
          </div>

          {offer.notes && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Uwagi</h2>
              <div className="text-gray-700 whitespace-pre-wrap">{offer.notes}</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {offer.status !== 'draft' && offer.public_token && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Link dla klienta</h2>
              <p className="text-xs text-gray-600 mb-3">Klient może obejrzeć ofertę i zaakceptować ją jednym kliknięciem – bez logowania.</p>
              <div className="flex gap-2">
                <input readOnly value={publicUrl} className="input-field text-xs" onFocus={(e) => e.target.select()} />
                <button onClick={copyLink} className="btn-secondary text-sm whitespace-nowrap">{copied ? '✓' : 'Kopiuj'}</button>
              </div>
              <div className="flex gap-3 mt-3 text-sm">
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-eltron-primary hover:underline">Otwórz widok klienta ↗</a>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
                {offer.view_count ? <>👀 Klient otworzył ofertę <strong>{offer.view_count}x</strong>, ostatnio {timeAgo(offer.viewed_at)}.</> : 'Klient jeszcze nie otworzył oferty.'}
              </div>
            </div>
          )}

          {offer.status === 'sent' && permissions.canEdit && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Przypomnienie o kontakcie</h2>
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="input-field mb-2" />
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input type="checkbox" checked={followTask} onChange={(e) => setFollowTask(e.target.checked)} /> Dodaj zadanie w „Zadaniach”
              </label>
              <button disabled={busy} onClick={() => put({ action: 'follow_up', follow_up_date: followUp || null, create_task: followTask && !!followUp }, 'Zapisano przypomnienie')} className="btn-secondary w-full text-sm">Zapisz</button>
              {data.tasks.length > 0 && (
                <ul className="mt-3 text-sm space-y-1">
                  {data.tasks.map((t) => (
                    <li key={t.id} className={t.done ? 'text-gray-400 line-through' : 'text-gray-700'}>• {t.title} <span className="text-xs text-gray-400">({formatDate(t.due_date)})</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Historia</h2>
            <div className="flex gap-2 mb-4">
              <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && comment.trim()) { if (await put({ action: 'comment', message: comment })) setComment(''); } }} className="input-field text-sm" placeholder="Dodaj komentarz..." />
              <button disabled={!comment.trim() || busy} onClick={async () => { if (await put({ action: 'comment', message: comment })) setComment(''); }} className="btn-secondary text-sm">Dodaj</button>
            </div>
            <ol className="space-y-3">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="text-base leading-5">{ACTIVITY_ICON[a.type] || '•'}</span>
                  <div className="min-w-0">
                    <div className="text-gray-800 break-words">{a.message}</div>
                    <div className="text-xs text-gray-500">{a.actor_name} · {formatDateTime(a.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div>
        <Link href="/dashboard/offers" className="btn-secondary">← Powrót do listy ofert</Link>
      </div>

      {showEmail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowEmail(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Wyślij ofertę e-mailem</h2>
            <p className="text-xs text-gray-500 mb-4">Wersja demo: wiadomość nie jest faktycznie wysyłana, ale oferta zmienia status na „Wysłana”, a akcja trafia do historii.</p>
            <label className="block text-sm text-gray-700 mb-1">Do</label>
            <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="input-field mb-3" />
            <label className="block text-sm text-gray-700 mb-1">Wiadomość</label>
            <textarea
              rows={6} className="input-field mb-4"
              value={emailMsg || `Dzień dobry,\n\nw załączeniu przesyłamy ofertę nr ${offer.id}. Można ją obejrzeć i zaakceptować online:\n${publicUrl || '(link pojawi się po wysłaniu)'}\n\nOferta ważna do ${formatDate(validUntil)}.\n\nPozdrawiam,\n${offer.created_by_name}`}
              onChange={(e) => setEmailMsg(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEmail(false)} className="btn-secondary">Anuluj</button>
              <button
                disabled={busy}
                onClick={async () => { if (await put({ action: 'send_email', to: emailTo, message: emailMsg }, `Oferta wysłana na ${emailTo} (symulacja)`)) setShowEmail(false); }}
                className="btn-primary disabled:opacity-50"
              >
                📤 Wyślij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
