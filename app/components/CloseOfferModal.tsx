'use client';

// Okno rozliczenia oferty: wygrana / wygrana częściowo / przegrana (z powodem i konkurencją).
// Wymuszone rozliczanie ofert pilnuje, żeby oferty nie „wisiały” w systemie bez wyniku.
import { useState } from 'react';
import { LOST_REASON_OPTIONS } from '../../lib/offer-rules';
import { formatCurrency } from '../../lib/format';

export interface CloseTarget {
  id: number;
  label: string;
  client_name: string;
  total_net: number;
}

export default function CloseOfferModal({
  offer, onClose, onDone, initial,
}: { offer: CloseTarget; onClose: () => void; onDone: () => void; initial?: 'won' | 'partial' | 'lost' }) {
  const [result, setResult] = useState<'won' | 'partial' | 'lost'>(initial || 'won');
  const [wonAmount, setWonAmount] = useState(Math.round(offer.total_net * 0.5));
  const [reason, setReason] = useState(LOST_REASON_OPTIONS[0]);
  const [competitor, setCompetitor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> =
        result === 'lost'
          ? { action: 'status', status: 'rejected', lost_reason: reason, competitor }
          : result === 'partial'
          ? { action: 'status', status: 'accepted', outcome: 'partial', won_amount: wonAmount, lost_reason: reason, competitor }
          : { action: 'status', status: 'accepted' };
      const res = await fetch(`/api/offers/${offer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Nie udało się zapisać wyniku'); return; }
      onDone();
    } catch {
      setError('Nie udało się zapisać wyniku');
    } finally {
      setBusy(false);
    }
  };

  const options: Array<{ key: 'won' | 'partial' | 'lost'; title: string; sub: string; style: string }> = [
    { key: 'won', title: '✅ Wygrana', sub: 'Klient zamówił całość', style: 'border-green-500 bg-green-50' },
    { key: 'partial', title: '🟡 Wygrana częściowo', sub: 'Zamówiono część pozycji', style: 'border-lime-500 bg-lime-50' },
    { key: 'lost', title: '❌ Przegrana', sub: 'Zamówienie trafiło gdzie indziej', style: 'border-red-500 bg-red-50' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-gray-900">Rozlicz ofertę {offer.label}</h2>
        <p className="text-sm text-gray-600 mb-4">{offer.client_name} · wartość netto {formatCurrency(offer.total_net)}</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setResult(o.key)}
              className={`text-left rounded-lg border-2 p-3 transition ${result === o.key ? o.style : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="text-sm font-semibold text-gray-900">{o.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{o.sub}</div>
            </button>
          ))}
        </div>

        {result === 'partial' && (
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Wartość zamówionej części (netto, zł)</label>
            <input type="number" min={1} max={offer.total_net} value={wonAmount} onChange={(e) => setWonAmount(parseFloat(e.target.value) || 0)} className="input-field" />
            <div className="text-xs text-gray-500 mt-1">To {Math.round((wonAmount / Math.max(1, offer.total_net)) * 100)}% wartości oferty.</div>
          </div>
        )}

        {result !== 'won' && (
          <div className="space-y-3 mb-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">{result === 'lost' ? 'Powód przegranej' : 'Dlaczego nie całość?'}</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-field">
                {LOST_REASON_OPTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Kto wygrał? (opcjonalnie)</label>
              <input value={competitor} onChange={(e) => setCompetitor(e.target.value)} className="input-field" placeholder="np. nazwa konkurenta" />
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Anuluj</button>
          <button onClick={save} disabled={busy || (result === 'partial' && wonAmount <= 0)} className="btn-primary disabled:opacity-50">
            {busy ? 'Zapisywanie...' : 'Zapisz wynik'}
          </button>
        </div>
      </div>
    </div>
  );
}
