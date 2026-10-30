// Wczytywanie zapytań klientów (e-mail / PDF / Excel) i zamiana ich w listę towarów do oferty.
// Parser tekstu działa naprawdę; odczyt PDF i skanów (OCR) jest w demo symulowany.
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVAILABILITY } from '../../../lib/offer-rules';
import { formatCurrency } from '../../../lib/format';

interface Match {
  product_id: number; name: string; unit: string; category?: string; manufacturer?: string; confidence: number;
  unit_price: number; cost_price: number; margin_percent: number; min_price: number | null; in_ekonom: boolean;
  availability: string; availability_note: string;
}
interface Row { id: number; raw: string; name: string; quantity: number; unit: string; note: string; matches: Match[] }
interface ClientHit { id: number; name: string; email?: string; phone?: string; contact_person?: string }
interface Parsed {
  project: string; deadline: string; offerType: 'zakup' | 'przetarg'; remarks: string[]; clientHint: string; contactHint: string;
  client: ClientHit | null; rows: Row[]; stats: { found: number; matched: number; unmatched: number };
}

const SAMPLES: Array<{ key: string; icon: string; title: string; file: string; text: string }> = [
  {
    key: 'mail', icon: '✉️', title: 'E-mail od inwestora', file: 'RE: Zapytanie – Zielone Tarasy etap II.eml',
    text: `Od: Adam Mazur <a.mazur@polbud.pl>
Zamawiający: PolBud Mazowsze S.A.
Temat: Budowa osiedla Zielone Tarasy – etap II, instalacje elektryczne

Dzień dobry,
prosimy o wycenę materiałów:

1. Kabel ziemny YKY 4x16 - 450 m
2. Kabel YKY 4x35 – 200 m
3. Mufa kablowa 4x16-35 - 6 kpl
4. Głowica kablowa wnętrzowa 4x16 - 6 kpl
5. Wyłącznik nadprądowy B16 1P; 120; szt.
6. 2 km Przewód YDY 3x2,5
7. Bednarka FeZn 30x4 - 300 mb (cięcie na odcinki po 6 m)
8. Rozdzielnica podtynkowa 36 mod. - 8 szt.
9. Uchwyt specjalny do rur wg rysunku - 40 szt
Uwagi: dostawa na budowę, rozładunek tylko do 14:00. Płatność 30 dni.

Z poważaniem,
Adam Mazur`,
  },
  {
    key: 'pdf', icon: '📄', title: 'PDF – przetarg gminy', file: 'SIWZ_Modernizacja_oswietlenia_Piaseczno.pdf',
    text: `SPECYFIKACJA WARUNKÓW ZAMÓWIENIA
Zamawiający: Gmina Piaseczno – Wydział Inwestycji
Przedmiot zamówienia: Modernizacja oświetlenia ulicznego i terenów rekreacyjnych
Postępowanie w trybie przetargu nieograniczonego.
Termin składania ofert: 20.11.2026

Zakres dostawy:
Oprawa uliczna LED 60W - 85 szt.
Naświetlacz LED 100W IP65 - 24 szt.
Kabel ziemny YKY 5x10 - 1 200 m
Czujnik ruchu 360° ścienny - 30 szt.
Rura osłonowa RHDPE 110 mm - 900 m
Taśma ostrzegawcza do kabli - 9 szt.
Uwagi: Wymagane atesty i deklaracje zgodności. Dostawa partiami wg harmonogramu.`,
  },
  {
    key: 'xlsx', icon: '📊', title: 'Excel – zestawienie materiałów', file: 'Zestawienie_materialow_Hotel_Sopot_Marina.xlsx',
    text: `Firma: Hotel Sopot Marina
Inwestycja: Remont instalacji elektrycznej – skrzydło B
Nazwa\tIlość\tJm\tUwagi
Panel LED 60x60 40W 4000K\t140\tszt\tbarwa neutralna
Przewód YDY 3x1,5\t1800\tm\t
Przewód YDY 3x2,5\t1200\tm\t
Gniazdo podwójne z ramką\t96\tszt\t
Wyłącznik różnicowoprądowy 25A/30mA\t18\tszt\t
Rozdzielnica natynkowa 24 mod.\t6\tszt\t
Pomiary elektryczne z protokołem\t1\tusł\tpo zakończeniu prac`,
  },
];

const STEPS = ['Odczyt dokumentu (OCR)', 'Rozpoznawanie pozycji i ilości', 'Dopasowanie do katalogu i cen'];
const TEXT_EXT = /\.(txt|csv|tsv|eml|md|log)$/i;

export default function InquiryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [simulated, setSimulated] = useState(false);
  const [step, setStep] = useState(-1);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<Record<number, number>>({}); // wiersz -> indeks dopasowania (-1 = brak)
  const [qty, setQty] = useState<Record<number, number>>({});
  const [skip, setSkip] = useState<Record<number, boolean>>({});
  const [project, setProject] = useState('');
  const [offerType, setOfferType] = useState<'zakup' | 'przetarg'>('zakup');
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [clientId, setClientId] = useState<number | ''>('');
  const [dragOver, setDragOver] = useState(false);

  const analyze = async (content: string, name: string, isSimulated: boolean) => {
    setError('');
    setParsed(null);
    setFileName(name);
    setSimulated(isSimulated);
    setText(content);
    // Animacja kroków – pokazuje, co „robi” analiza (sam parser jest szybki)
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, i === 0 ? (isSimulated ? 900 : 350) : 450));
    }
    try {
      const [res, cl] = await Promise.all([
        fetch('/api/inquiry/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: content }) }),
        fetch('/api/clients').then((r) => (r.ok ? r.json() : [])),
      ]);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Nie udało się przeanalizować zapytania'); return; }
      setClients(cl);
      setParsed(d);
      setProject(d.project || '');
      setOfferType(d.offerType);
      setClientId(d.client ? d.client.id : '');
      setChoice(Object.fromEntries(d.rows.map((r: Row) => [r.id, r.matches.length ? 0 : -1])));
      setQty(Object.fromEntries(d.rows.map((r: Row) => [r.id, r.quantity])));
      setSkip({});
    } catch {
      setError('Nie udało się przeanalizować zapytania');
    } finally {
      setStep(-1);
    }
  };

  const onFile = async (file: File) => {
    if (TEXT_EXT.test(file.name)) {
      analyze(await file.text(), file.name, false);
    } else {
      // PDF / skan / Excel: bez zewnętrznego OCR pokazujemy przykładowy wynik odczytu
      const sample = SAMPLES[Math.abs(Array.from(file.name).reduce((h, c) => h + c.charCodeAt(0), 0)) % SAMPLES.length];
      analyze(sample.text, file.name, true);
    }
  };

  const createOffer = () => {
    if (!parsed) return;
    const items = parsed.rows
      .filter((r) => !skip[r.id])
      .map((r) => {
        const m = choice[r.id] >= 0 ? r.matches[choice[r.id]] : null;
        const quantity = qty[r.id] || r.quantity;
        const base = {
          quantity, vat_rate: 23, discount_percent: 0,
          item_note: m && m.name.toLowerCase() !== r.name.toLowerCase() ? [`wg zapytania: ${r.name}`, r.note].filter(Boolean).join('; ') : r.note,
        };
        return m
          ? {
              ...base, product_name: m.name, unit: m.unit, unit_price: m.unit_price, cost_price: m.cost_price, margin_percent: m.margin_percent,
              original_price: m.unit_price, min_price: m.min_price || 0, manufacturer: m.manufacturer || '', category: m.category || '',
              in_ekonom: m.in_ekonom, availability: m.availability, availability_note: m.availability_note,
            }
          : {
              ...base, product_name: r.name, unit: r.unit, unit_price: 0, cost_price: 0, margin_percent: 0, original_price: 0,
              in_ekonom: false, availability: 'on_request', availability_note: 'do potwierdzenia u producenta',
            };
      });
    const remarks = parsed.remarks.map((t) => ({ target: 'Klient', text: t }));
    sessionStorage.setItem('ofertownik.inquiry', JSON.stringify({
      project, offerType, deadline: parsed.deadline, contact: parsed.contactHint, remarks, clientId: clientId || null, items,
    }));
    router.push('/dashboard/offers/new?from=inquiry');
  };

  const included = parsed ? parsed.rows.filter((r) => !skip[r.id]) : [];
  const estimate = included.reduce((s, r) => {
    const m = choice[r.id] >= 0 ? r.matches[choice[r.id]] : null;
    return s + (m ? m.unit_price * (qty[r.id] || r.quantity) : 0);
  }, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Wczytaj zapytanie klienta</h1>
        <p className="text-gray-600 mt-2">
          Wrzuć e-mail, PDF lub arkusz Excel z zapytaniem – system wyciągnie listę towarów i ilości, dopasuje je do katalogu, sprawdzi dostępność i podpowie ceny.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
        🎭 <strong>Wersja demo:</strong> analiza tekstu (wklejony e-mail, pliki .txt / .csv / .eml) działa naprawdę. Odczyt <strong>PDF, skanów i plików Excel</strong>
        wymaga zewnętrznego OCR/AI – tutaj jest symulowany (pokazujemy przykładowy odczyt), docelowo zadanie dla modułu AI.
      </div>

      {!parsed && step < 0 && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`card cursor-pointer text-center py-12 border-2 border-dashed transition ${dragOver ? 'border-eltron-primary bg-eltron-primary/5' : 'border-gray-300 hover:border-eltron-primary'}`}
          >
            <div className="text-5xl mb-3">📥</div>
            <div className="text-lg font-semibold text-gray-900">Przeciągnij plik zapytania tutaj</div>
            <div className="text-sm text-gray-500 mt-1">PDF · Excel · e-mail (.eml) · tekst – albo kliknij, aby wybrać plik</div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.txt,.eml,.docx,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Lub wypróbuj na przykładzie</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SAMPLES.map((sm) => (
                <button key={sm.key} onClick={() => analyze(sm.text, sm.file, sm.key !== 'mail')} className="text-left border border-gray-200 rounded-lg p-4 hover:border-eltron-primary hover:shadow-sm transition">
                  <div className="text-2xl">{sm.icon}</div>
                  <div className="font-medium text-gray-900 mt-1">{sm.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 break-all">{sm.file}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Albo wklej treść maila / zapytania</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="input-field font-mono text-sm" placeholder={'Kabel YKY 4x16 - 450 m\nWyłącznik nadprądowy B16 1P - 120 szt.\n...'} />
            <div className="mt-3 flex justify-end">
              <button disabled={text.trim().length < 10} onClick={() => analyze(text, 'wklejona treść', false)} className="btn-primary disabled:opacity-50">🔍 Analizuj zapytanie</button>
            </div>
          </div>
        </>
      )}

      {step >= 0 && (
        <div className="card">
          <div className="font-semibold text-gray-900 mb-1">🤖 Analizuję: {fileName}</div>
          <p className="text-sm text-gray-500 mb-4">To zajmie chwilę…</p>
          <ol className="space-y-3">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-eltron-primary text-white animate-pulse' : 'bg-gray-200 text-gray-500'}`}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className={i <= step ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      {parsed && (
        <>
          <div className="card">
            <div className="flex flex-wrap justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Wynik analizy</h2>
                <p className="text-sm text-gray-600">
                  {fileName} · rozpoznano <strong>{parsed.stats.found}</strong> pozycji, dopasowano do katalogu <strong>{parsed.stats.matched}</strong>
                  {parsed.stats.unmatched > 0 && <>, bez dopasowania <strong className="text-amber-700">{parsed.stats.unmatched}</strong></>}
                </p>
                {simulated && <p className="text-xs text-amber-700 mt-1">⚠️ Odczyt pliku jest symulowany – to przykładowy wynik OCR.</p>}
              </div>
              <button onClick={() => { setParsed(null); setText(''); }} className="btn-secondary text-sm self-start">← Wczytaj inne zapytanie</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Klient</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value ? parseInt(e.target.value, 10) : '')} className="input-field">
                  <option value="">— wybierz w kreatorze oferty —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {parsed.client && <div className="text-xs text-green-700 mt-1">Rozpoznano po treści zapytania{parsed.clientHint ? ` („${parsed.clientHint}”)` : ''}.</div>}
                {!parsed.client && parsed.clientHint && <div className="text-xs text-amber-700 mt-1">W zapytaniu: „{parsed.clientHint}” – brak w bazie klientów.</div>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Temat / inwestycja</label>
                <input value={project} onChange={(e) => setProject(e.target.value)} className="input-field" placeholder="Nazwa tematu" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rodzaj</label>
                <select value={offerType} onChange={(e) => setOfferType(e.target.value as 'zakup' | 'przetarg')} className="input-field">
                  <option value="zakup">Zakup</option>
                  <option value="przetarg">Przetarg</option>
                </select>
                {offerType === 'przetarg' && parsed.deadline && <div className="text-xs text-gray-500 mt-1">Termin składania: {parsed.deadline}</div>}
              </div>
              {parsed.remarks.length > 0 && (
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-gray-700 mb-1">Uwagi z zapytania (trafią do uwag dla klienta)</div>
                  <ul className="text-sm text-gray-700 list-disc list-inside">{parsed.remarks.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-700">
                    <th className="py-2 px-2 w-8"></th>
                    <th className="py-2 px-2 font-medium">Wg zapytania</th>
                    <th className="py-2 px-2 font-medium">Ilość</th>
                    <th className="py-2 px-2 font-medium">Dopasowany towar z katalogu</th>
                    <th className="py-2 px-2 font-medium">Dostępność</th>
                    <th className="py-2 px-2 font-medium text-right">Cena netto</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r) => {
                    const idx = choice[r.id] ?? -1;
                    const m = idx >= 0 ? r.matches[idx] : null;
                    return (
                      <tr key={r.id} className={`border-b border-gray-100 align-top ${skip[r.id] ? 'opacity-40' : ''}`}>
                        <td className="py-3 px-2"><input type="checkbox" checked={!skip[r.id]} onChange={(e) => setSkip((s) => ({ ...s, [r.id]: !e.target.checked }))} aria-label="Uwzględnij pozycję" /></td>
                        <td className="py-3 px-2">
                          <div className="font-medium text-gray-900">{r.name}</div>
                          {r.note && <div className="text-xs text-gray-500">📝 {r.note}</div>}
                        </td>
                        <td className="py-3 px-2 whitespace-nowrap">
                          <input type="number" min={0} step="0.001" value={qty[r.id] ?? r.quantity} onChange={(e) => setQty((q) => ({ ...q, [r.id]: parseFloat(e.target.value) || 0 }))} className="w-24 px-2 py-1 border border-gray-300 rounded" />
                          <span className="ml-1 text-gray-600">{m ? m.unit : r.unit}</span>
                        </td>
                        <td className="py-3 px-2 min-w-[260px]">
                          <select value={idx} onChange={(e) => setChoice((c) => ({ ...c, [r.id]: parseInt(e.target.value, 10) }))} className="input-field text-sm">
                            {r.matches.map((mm, i) => <option key={mm.product_id} value={i}>{mm.name} ({mm.confidence}%)</option>)}
                            <option value={-1}>— brak w katalogu (pozycja jednorazowa) —</option>
                          </select>
                          {m ? (
                            <div className="text-xs text-gray-500 mt-1">🏭 {m.manufacturer || '—'} · pewność dopasowania <strong className={m.confidence >= 80 ? 'text-green-700' : 'text-amber-700'}>{m.confidence}%</strong></div>
                          ) : (
                            <div className="text-xs text-amber-700 mt-1">Pozycja spoza katalogu – cena i dostępność do ustalenia (np. zapytanie do producenta).</div>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          {m ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${AVAILABILITY[m.availability]?.badge}`}>
                              {AVAILABILITY[m.availability]?.label}{m.availability_note ? ` – ${m.availability_note}` : ''}
                            </span>
                          ) : <span className="text-xs text-gray-400">do potwierdzenia</span>}
                        </td>
                        <td className="py-3 px-2 text-right whitespace-nowrap">
                          {m ? formatCurrency(m.unit_price) : <span className="text-gray-400">—</span>}
                          {m && <div className="text-xs text-gray-500">{formatCurrency(m.unit_price * (qty[r.id] || r.quantity))}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-gray-600">Orientacyjna wartość netto (pozycje z ceną): <strong className="text-gray-900">{formatCurrency(estimate)}</strong></div>
              <button onClick={createOffer} disabled={included.length === 0} className="btn-primary disabled:opacity-50">➡ Utwórz ofertę z zapytania ({included.length} poz.)</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
