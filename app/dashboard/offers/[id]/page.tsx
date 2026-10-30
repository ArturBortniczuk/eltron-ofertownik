'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { StatusBadge, ApprovalBadge, TypeBadge } from '../../../components/StatusBadge';
import CloseOfferModal from '../../../components/CloseOfferModal';
import { AVAILABILITY, OUTCOMES, CC_SUGGESTIONS, amountTier, offerLabel } from '../../../../lib/offer-rules';
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
  availability?: string;
  availability_note?: string;
  item_note?: string;
  min_price?: number | null;
  in_ekonom?: boolean;
  manufacturer?: string | null;
}

interface Version {
  id: number; revision: number; total_net: number; total_gross: number; status: string; outcome?: string | null;
  is_current: boolean; created_at: string; margin_percent?: number;
}

interface Rfq {
  id: number; manufacturer: string; message: string; status: string; created_at: string;
  items: Array<{ id: number; product_name: string; quantity: number; unit: string }>;
  response?: Array<{ item_id: number; product_name: string; old_cost: number; quoted_cost: number | null; lead_days: number }> | null;
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
    offer_number?: string;
    revision?: number;
    project_name?: string;
    segment?: string;
    offer_type?: string;
    tender_deadline?: string | null;
    contact_person?: string;
    remarks?: Array<{ target: string; text: string }>;
    outcome?: string | null;
    won_amount?: number | null;
    competitor?: string | null;
    ekonom_order_no?: string | null;
    ekonom_exported_at?: string | null;
    approval_level?: string | null;
    cc_emails?: string | null;
  };
  versions: Version[];
  rfqs: Rfq[];
  items: OfferItem[];
  activity: Array<{ id: number; actor_name?: string; type: string; message: string; created_at: string }>;
  tasks: Array<{ id: number; title: string; due_date: string; done: boolean }>;
  margin: { net: number; cost: number; margin: number; marginPercent: number; itemsMarginPercent: number | null } | null;
  permissions: { canEdit: boolean; canDelete: boolean; canApprove: boolean; canSeeMargins: boolean; isOwner: boolean; canExport?: boolean };
}

const PDFDownloadButtonPrimary = dynamic(
  () => import('../../../components/PDFDocument').then((mod) => mod.PDFDownloadButtonPrimary),
  { ssr: false, loading: () => <button className="btn-primary" disabled>⏳ Ładowanie...</button> }
);

const ACTIVITY_ICON: Record<string, string> = {
  created: '🆕', status: '🔄', comment: '💬', email: '✉️', approval: '🛡️', viewed: '👀', client_response: '🤝', edited: '✏️', ekonom: '🔗', rfq: '🏭',
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
  const [showClose, setShowClose] = useState(false);
  const [emailCc, setEmailCc] = useState('');
  const [rfqMaker, setRfqMaker] = useState('');

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
    return put({ action: 'status', status });
  };

  const newVariant = async () => {
    setBusy(true);
    const r = await post({ action: 'variant' });
    setBusy(false);
    if (r.ok) router.push(`/dashboard/offers/new?edit=${r.body.offerId}`);
    else setError(r.body.error || 'Nie udało się utworzyć wariantu');
  };

  const sendToEkonom = async () => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/offers/${offerId}/ekonom`, { method: 'POST' });
    const d = await res.json();
    setBusy(false);
    if (res.ok) { setInfo(`Utworzono zamówienie ${d.orderNo} w Ekonomie (symulacja integracji).`); fetchOffer(); }
    else setError(d.error || 'Nie udało się utworzyć zamówienia w Ekonomie');
  };

  const rfqAction = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/offers/${offerId}/rfq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    setBusy(false);
    if (res.ok) { setInfo(success); fetchOffer(); }
    else setError(d.error || 'Operacja nie powiodła się');
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
  const label = offerLabel(offer);
  const isOpen = offer.status === 'sent';
  const tier = amountTier(Number(offer.total_net));
  const makers = Array.from(new Set(items.map((i) => i.manufacturer).filter(Boolean))) as string[];
  const offEkonom = items.filter((i) => i.in_ekonom === false).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">Oferta {label}</h1>
            <StatusBadge status={offer.status} outcome={offer.outcome} large />
            <TypeBadge type={offer.offer_type} />
            <ApprovalBadge status={offer.approval_status} />
            {expired && <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">Termin ważności minął</span>}
          </div>
          {offer.project_name && <p className="text-lg text-gray-800 font-medium">{offer.project_name}</p>}
          <p className="text-gray-600">Utworzona {formatDate(offer.created_at)} przez {offer.created_by_name}{offer.segment ? ` · segment: ${offer.segment}` : ''}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <PDFDownloadButtonPrimary offer={offer as any} items={items as any} />
          <button onClick={() => setShowEmail(true)} disabled={blocked} title={blocked ? 'Najpierw akceptacja marży' : ''} className="btn-secondary disabled:opacity-50">✉️ Wyślij e-mailem</button>
          {permissions.canEdit && offer.status !== 'draft' && <button onClick={newVariant} disabled={busy} className="btn-secondary" title="Nowa wersja oferty do negocjacji (ten sam numer + kolejna rewizja)">🔁 Wariant (negocjacje)</button>}
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
              : 'Oferta narusza ustalone progi (marża, cena minimalna lub wartość).'}
            {tier ? ` Wymagany poziom akceptacji dla tej kwoty: ${tier.label}.` : ''}
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

      {/* Status i rozliczenie */}
      {permissions.canEdit && (
        <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-gray-600">
            Status oferty
            {isOpen && <div className="text-xs text-gray-500">Każdą wysłaną ofertę trzeba na końcu rozliczyć: wygrana, wygrana częściowo lub przegrana.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {offer.status !== 'draft' && <button disabled={busy} onClick={() => updateStatus('draft')} className="btn-secondary text-sm">↩ Wróć do szkicu</button>}
            {offer.status !== 'sent' && <button disabled={busy || blocked} onClick={() => updateStatus('sent')} className="btn-secondary text-sm disabled:opacity-50">📤 {offer.status === 'draft' ? 'Oznacz jako wysłaną' : 'Otwórz ponownie'}</button>}
            {offer.status !== 'draft' && (
              <button disabled={busy} onClick={() => setShowClose(true)} className="bg-eltron-primary hover:opacity-90 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">
                🏁 {isOpen ? 'Rozlicz ofertę' : 'Zmień wynik'}
              </button>
            )}
          </div>
        </div>
      )}
      {offer.outcome === 'partial' && offer.won_amount != null && (
        <div className="text-sm text-lime-900 bg-lime-50 border border-lime-200 rounded-lg px-4 py-2">
          🟡 Wygrana częściowo: zamówiono <strong>{formatCurrency(offer.won_amount)}</strong> netto z {formatCurrency(offer.total_net)} ({Math.round((offer.won_amount / Math.max(1, offer.total_net)) * 100)}%).
        </div>
      )}
      {offer.competitor && (
        <div className="text-sm text-gray-700 bg-gray-100 rounded-lg px-4 py-2">Konkurencja: <strong>{offer.competitor}</strong></div>
      )}
      {(offer.status === 'rejected' || offer.outcome === 'partial') && offer.lost_reason && (
        <div className="text-sm text-gray-700 bg-gray-100 rounded-lg px-4 py-2">Powód przegranej: <strong>{offer.lost_reason}</strong></div>
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
              {offer.contact_person && <div><div className="text-gray-600 mb-1">Oferta dla</div><div className="font-medium">👤 {offer.contact_person}</div></div>}
              {offer.offer_type === 'przetarg' && <div><div className="text-gray-600 mb-1">Termin składania</div><div className="font-medium">{offer.tender_deadline ? formatDate(offer.tender_deadline) : 'nie podano'}</div></div>}
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
                      <td className="py-3 px-2 font-medium text-gray-900">
                        {item.product_name}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.availability && (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-normal ${AVAILABILITY[item.availability]?.badge || ''}`}>
                              {AVAILABILITY[item.availability]?.label}{item.availability_note ? ` – ${item.availability_note}` : ''}
                            </span>
                          )}
                          {item.in_ekonom === false && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-normal">poza Ekonomem</span>}
                          {showMargins && item.min_price != null && item.min_price > 0 && item.unit_price < item.min_price && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white font-normal">poniżej ceny min. {formatCurrency(item.min_price)}</span>
                          )}
                        </div>
                        {item.item_note && <div className="text-xs font-normal text-gray-500 mt-1">📝 {item.item_note}</div>}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">{item.quantity} {item.unit}</td>
                      <td className={`py-3 px-2 text-right whitespace-nowrap ${showMargins && item.min_price != null && item.min_price > 0 && item.unit_price < item.min_price ? 'text-red-600 font-semibold' : ''}`}>{formatCurrency(item.unit_price)}</td>
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

          {Array.isArray(offer.remarks) && offer.remarks.length > 0 && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Uwagi dodatkowe</h2>
              <ul className="space-y-1.5 text-sm">
                {offer.remarks.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs h-fit whitespace-nowrap">{r.target}</span>
                    <span className="text-gray-800">{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {offer.notes && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Uwagi</h2>
              <div className="text-gray-700 whitespace-pre-wrap">{offer.notes}</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {data.versions.length > 1 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">🔁 Negocjacje</h2>
              <p className="text-xs text-gray-500 mb-3">Kolejne warianty oferty – widać, jak zmieniała się cena.</p>
              <ol className="space-y-2">
                {data.versions.map((v, i) => {
                  const prev = i > 0 ? data.versions[i - 1] : null;
                  const delta = prev ? ((v.total_net - prev.total_net) / Math.max(1, prev.total_net)) * 100 : null;
                  const max = Math.max(...data.versions.map((x) => x.total_net));
                  return (
                    <li key={v.id}>
                      <Link href={`/dashboard/offers/${v.id}`} className={`block rounded-lg border p-2 hover:border-eltron-primary ${v.id === offer.id ? 'border-eltron-primary bg-eltron-primary/5' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium">{v.revision === 0 ? 'Oferta pierwotna' : `Wariant ${offer.offer_number}.${v.revision}`}{v.is_current ? ' · aktualny' : ''}</span>
                          <span className="font-semibold">{formatCurrency(v.total_net)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded mt-1.5 overflow-hidden"><div className="h-full bg-eltron-primary rounded" style={{ width: `${(v.total_net / max) * 100}%` }} /></div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{formatDate(v.created_at)}</span>
                          {delta !== null && <span className={delta < 0 ? 'text-red-600' : 'text-green-700'}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs poprzednia</span>}
                          {showMargins && v.margin_percent != null && <span>marża {Number(v.margin_percent).toFixed(1)}%</span>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {offer.status === 'accepted' && permissions.canExport && (
            <div className="card border-indigo-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">🔗 Ekonom</h2>
              {offer.ekonom_order_no ? (
                <>
                  <p className="text-sm text-gray-700">Zamówienie w Ekonomie: <strong>{offer.ekonom_order_no}</strong></p>
                  <p className="text-xs text-gray-500">Przekazano {formatDateTime(offer.ekonom_exported_at)}</p>
                  <a href={`/api/offers/${offer.id}/ekonom`} className="btn-secondary text-sm w-full text-center mt-3 block">⬇ Pobierz plik zamówienia (XML)</a>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-600 mb-2">Oferta wygrana – jednym kliknięciem wpada do Ekonoma jako zamówienie odbiorcy{offer.outcome === 'partial' ? ' (tylko zamówiona część)' : ''}.</p>
                  {offEkonom > 0 && <p className="text-xs text-sky-800 bg-sky-50 rounded p-2 mb-2">{offEkonom} poz. spoza kartoteki Ekonoma zostanie przekazane jako nieskatalogowe.</p>}
                  <button disabled={busy} onClick={sendToEkonom} className="btn-primary w-full text-sm disabled:opacity-50">Utwórz zamówienie w Ekonomie</button>
                  <p className="text-[11px] text-gray-400 mt-2">Demo: integracja jest symulowana – powstaje numer zamówienia i plik XML.</p>
                </>
              )}
            </div>
          )}

          {offer.status !== 'draft' && permissions.canEdit && makers.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">🏭 Zapytania do producentów</h2>
              <p className="text-xs text-gray-500 mb-3">Wyślij zestawienie pozycji danego producenta z prośbą o wycenę.</p>
              <div className="flex gap-2 mb-3">
                <select value={rfqMaker || makers[0]} onChange={(e) => setRfqMaker(e.target.value)} className="input-field text-sm">
                  {makers.map((m) => <option key={m}>{m}</option>)}
                </select>
                <button disabled={busy} onClick={() => rfqAction({ action: 'create', manufacturer: rfqMaker || makers[0] }, `Wysłano zapytanie do ${rfqMaker || makers[0]} (symulacja)`)} className="btn-secondary text-sm whitespace-nowrap disabled:opacity-50">Wyślij</button>
              </div>
              <ul className="space-y-3">
                {data.rfqs.map((q) => (
                  <li key={q.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{q.manufacturer}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${q.status === 'sent' ? 'bg-blue-100 text-blue-800' : q.status === 'answered' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {q.status === 'sent' ? 'czeka na odpowiedź' : q.status === 'answered' ? 'jest wycena' : 'zastosowano'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{q.items.length} poz. · {formatDate(q.created_at)}</div>
                    {q.response && (
                      <table className="w-full text-xs mt-2">
                        <tbody>
                          {q.response.map((l) => (
                            <tr key={l.item_id} className="border-t border-gray-100">
                              <td className="py-1 pr-2">{l.product_name}</td>
                              <td className="py-1 text-right whitespace-nowrap">{l.quoted_cost ? `${formatCurrency(l.quoted_cost)}` : '-'}{l.old_cost && l.quoted_cost ? <span className={l.quoted_cost <= l.old_cost ? 'text-green-700' : 'text-red-600'}> ({(((l.quoted_cost - l.old_cost) / l.old_cost) * 100).toFixed(1)}%)</span> : null}</td>
                              <td className="py-1 pl-2 text-right text-gray-500">{l.lead_days} dni</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="flex gap-2 mt-2">
                      {q.status === 'sent' && <button disabled={busy} onClick={() => rfqAction({ action: 'simulate_response', rfq_id: q.id }, 'Producent odesłał wycenę (symulacja)')} className="btn-secondary text-xs">Symuluj odpowiedź</button>}
                      {q.status === 'answered' && showMargins && <button disabled={busy} onClick={() => rfqAction({ action: 'apply', rfq_id: q.id }, 'Zastosowano ceny zakupu – przeliczono marże')} className="btn-primary text-xs">Zastosuj ceny zakupu</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

      {showClose && (
        <CloseOfferModal
          offer={{ id: offer.id, label, client_name: offer.client_name, total_net: Number(offer.total_net) }}
          onClose={() => setShowClose(false)}
          onDone={() => { setShowClose(false); fetchOffer(); }}
        />
      )}

      {showEmail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowEmail(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Wyślij ofertę e-mailem</h2>
            <p className="text-xs text-gray-500 mb-4">Wersja demo: wiadomość nie jest faktycznie wysyłana, ale oferta zmienia status na „Wysłana”, a akcja trafia do historii.</p>
            <label className="block text-sm text-gray-700 mb-1">Do</label>
            <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="input-field mb-3" />
            <label className="block text-sm text-gray-700 mb-1">DW (np. dyrektor, logistyka – po przecinku)</label>
            <input value={emailCc || offer.cc_emails || ''} onChange={(e) => setEmailCc(e.target.value)} className="input-field mb-1" placeholder="dyrektor.handlowy@eltron.pl" />
            <div className="flex flex-wrap gap-1 mb-3">
              {CC_SUGGESTIONS.map((c) => (
                <button key={c.email} type="button" onClick={() => setEmailCc((cur) => { const base = cur || offer.cc_emails || ''; return base.includes(c.email) ? base : base ? `${base}, ${c.email}` : c.email; })}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700">+ {c.label}</button>
              ))}
            </div>
            <label className="block text-sm text-gray-700 mb-1">Wiadomość</label>
            <textarea
              rows={6} className="input-field mb-4"
              value={emailMsg || `Dzień dobry${offer.contact_person ? ` ${offer.contact_person.split(' ')[0]}` : ''},\n\nw załączeniu przesyłamy ofertę nr ${label}${offer.project_name ? ` („${offer.project_name}”)` : ''}. Można ją obejrzeć i zaakceptować online:\n${publicUrl || '(link pojawi się po wysłaniu)'}\n\nOferta ważna do ${formatDate(validUntil)}.\n\nPozdrawiam,\n${offer.created_by_name}`}
              onChange={(e) => setEmailMsg(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEmail(false)} className="btn-secondary">Anuluj</button>
              <button
                disabled={busy}
                onClick={async () => { if (await put({ action: 'send_email', to: emailTo, message: emailMsg, cc: emailCc || offer.cc_emails || '' }, `Oferta wysłana na ${emailTo} (symulacja)`)) setShowEmail(false); }}
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
