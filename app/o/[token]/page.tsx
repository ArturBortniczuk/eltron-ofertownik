// Publiczna strona oferty dla klienta (bez logowania)
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDate } from '../../../lib/format';

interface PublicOffer {
  id: number;
  client_name: string;
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
  salesperson_name?: string;
  salesperson_email?: string;
}
interface PublicItem {
  product_name: string; quantity: number; unit: string; unit_price: number; vat_rate: number; net_amount: number; gross_amount: number;
}

export default function PublicOfferPage() {
  const params = useParams();
  const token = params.token as string;
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/public/offers/${token}`);
      const data = await res.json();
      if (res.ok) {
        setOffer(data.offer);
        setItems(data.items);
      } else {
        setError(data.error || 'Oferta jest niedostępna');
      }
    } catch {
      setError('Nie udało się wczytać oferty');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const respond = async (decision: 'accept' | 'reject') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/public/offers/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, name, reason }),
      });
      const data = await res.json();
      if (res.ok) {
        setOffer((o) => (o ? { ...o, status: data.status } : o));
        setRejecting(false);
      } else {
        setError(data.error || 'Nie udało się zapisać decyzji');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-600">Ładowanie oferty...</div>;
  if (!offer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card text-center max-w-md">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-lg font-semibold text-gray-900 mb-2">{error || 'Oferta jest niedostępna'}</div>
          <p className="text-gray-600 text-sm">Link może być nieprawidłowy albo oferta nie została jeszcze wysłana.</p>
        </div>
      </div>
    );
  }

  const validUntil = new Date(new Date(offer.created_at).getTime() + offer.valid_days * 86400000);
  const expired = validUntil < new Date();

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-eltron-primary text-white rounded-xl p-6 flex justify-between items-start gap-4">
          <div>
            <div className="text-sm opacity-80">GRUPA ELTRON</div>
            <h1 className="text-2xl font-bold mt-1">Oferta handlowa nr {offer.id}</h1>
            <div className="text-sm opacity-90 mt-2">Dla: {offer.client_name}</div>
          </div>
          <div className="text-right text-sm opacity-90">
            <div>Data: {formatDate(offer.created_at)}</div>
            <div>Ważna do: {formatDate(validUntil)}</div>
            <div>Dostawa: {offer.delivery_days} dni</div>
          </div>
        </div>

        {offer.status === 'accepted' && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-center font-medium">
            ✅ Oferta została zaakceptowana. Dziękujemy! Opiekun skontaktuje się z Państwem w sprawie realizacji.
          </div>
        )}
        {offer.status === 'rejected' && (
          <div className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg p-4 text-center">
            Oferta została odrzucona. Dziękujemy za informację.
          </div>
        )}
        {offer.status === 'sent' && expired && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-center">
            ⏳ Termin ważności oferty minął. Skontaktuj się z opiekunem, aby ją odnowić.
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-2">Lp.</th>
                <th className="py-2 pr-2">Opis</th>
                <th className="py-2 pr-2 text-right">Ilość</th>
                <th className="py-2 pr-2 text-right">Cena netto</th>
                <th className="py-2 pr-2 text-right">VAT</th>
                <th className="py-2 text-right">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-gray-900">{it.product_name}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{it.quantity} {it.unit}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{formatCurrency(it.unit_price)}</td>
                  <td className="py-2 pr-2 text-right">{it.vat_rate}%</td>
                  <td className="py-2 text-right font-medium whitespace-nowrap">{formatCurrency(it.gross_amount)}</td>
                </tr>
              ))}
              {offer.additional_costs > 0 && (
                <tr className="border-b border-gray-100">
                  <td className="py-2 pr-2"></td>
                  <td className="py-2 pr-2 font-medium">{offer.additional_costs_description || 'Dodatkowe koszty'}</td>
                  <td className="py-2 pr-2 text-right">1 usł</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(offer.additional_costs)}</td>
                  <td className="py-2 pr-2 text-right">23%</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(offer.additional_costs * 1.23)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Netto:</span><span>{formatCurrency(offer.total_net)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">VAT:</span><span>{formatCurrency(offer.total_vat)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold text-eltron-primary">
                <span>Razem:</span><span>{formatCurrency(offer.total_gross)}</span>
              </div>
            </div>
          </div>
        </div>

        {offer.notes && (
          <div className="card text-sm">
            <div className="font-semibold text-gray-900 mb-1">Uwagi</div>
            <div className="text-gray-700 whitespace-pre-wrap">{offer.notes}</div>
          </div>
        )}

        {offer.status === 'sent' && !expired && (
          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Twoja decyzja</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Imię i nazwisko osoby akceptującej (opcjonalnie)" />
            {rejecting && (
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input-field" placeholder="Powód odrzucenia (opcjonalnie) - pomoże nam przygotować lepszą ofertę" />
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              {!rejecting ? (
                <>
                  <button disabled={busy} onClick={() => respond('accept')} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg disabled:opacity-50">
                    ✅ Akceptuję ofertę
                  </button>
                  <button disabled={busy} onClick={() => setRejecting(true)} className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium py-3 rounded-lg">
                    Odrzucam
                  </button>
                </>
              ) : (
                <>
                  <button disabled={busy} onClick={() => respond('reject')} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg disabled:opacity-50">
                    Potwierdź odrzucenie
                  </button>
                  <button onClick={() => setRejecting(false)} className="flex-1 btn-secondary">Wróć</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="text-center text-sm text-gray-600 space-y-2">
          <a href={`/api/offers/${offer.id}/pdf-html?token=${token}`} target="_blank" rel="noreferrer" className="text-eltron-primary hover:underline">
            🖨️ Wersja do druku / PDF
          </a>
          {offer.salesperson_name && (
            <div>
              Opiekun oferty: <strong>{offer.salesperson_name}</strong>
              {offer.salesperson_email && <> • <a href={`mailto:${offer.salesperson_email}`} className="text-eltron-primary hover:underline">{offer.salesperson_email}</a></>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
