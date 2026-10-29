// app/dashboard/offers/new/page.tsx - ROZSZERZONA WERSJA Z MARŻAMI
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import PricingManager from '../../../components/PricingManager';

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
}

interface OfferItem {
  id?: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  // Nowe pola dla marż
  cost_price: number;
  margin_percent: number;
  discount_percent: number;
  original_price: number;
}

interface ProductSuggestion {
  name: string;
  unit: string;
  last_price: number;
  last_used_by: string;
  last_used_at: string;
  usage_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

interface OfferTemplate {
  id: number;
  name: string;
  description?: string;
  payload: { delivery_days?: number; valid_days?: number; notes?: string; items: any[] };
}

// Przelicza kwoty pozycji (netto/VAT/brutto) - serwer i tak liczy je ponownie
const withAmounts = (item: any): OfferItem => {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const vatRate = item.vat_rate !== undefined ? Number(item.vat_rate) : 23;
  const net = Math.round(quantity * unitPrice * 100) / 100;
  const vat = Math.round(net * (vatRate / 100) * 100) / 100;
  return {
    product_name: item.product_name,
    quantity,
    unit: item.unit || 'szt',
    unit_price: unitPrice,
    vat_rate: vatRate,
    net_amount: net,
    vat_amount: vat,
    gross_amount: Math.round((net + vat) * 100) / 100,
    cost_price: Number(item.cost_price) || 0,
    margin_percent: Number(item.margin_percent) || 0,
    discount_percent: Number(item.discount_percent) || 0,
    original_price: Number(item.original_price) || unitPrice,
  };
};

export default function NewOfferPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams?.get('client');
  const editId = searchParams?.get('edit');
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [notice, setNotice] = useState('');

  // Wybór klienta
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientSelector, setShowClientSelector] = useState(true);
  const [clientSearch, setClientSearch] = useState('');

  // Dane oferty
  const [deliveryDays, setDeliveryDays] = useState(14);
  const [validDays, setValidDays] = useState(30);
  const [additionalCosts, setAdditionalCosts] = useState(0);
  const [additionalCostsDescription, setAdditionalCostsDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Pozycje w ofercie
  const [items, setItems] = useState<OfferItem[]>([]);

  // Aktualnie dodawana pozycja
  const [currentItem, setCurrentItem] = useState<OfferItem>({
    product_name: '',
    quantity: 1,
    unit: 'szt',
    unit_price: 0,
    vat_rate: 23,
    net_amount: 0,
    vat_amount: 0,
    gross_amount: 0,
    cost_price: 0,
    margin_percent: 0,
    discount_percent: 0,
    original_price: 0
  });

  // Podpowiedzi produktów
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);

  // Stan UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [showMarginWarning, setShowMarginWarning] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (preselectedClientId && clients.length > 0) {
      const client = clients.find(c => c.id === parseInt(preselectedClientId));
      if (client) {
        setSelectedClient(client);
        setShowClientSelector(false);
      }
    }
  }, [preselectedClientId, clients]);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => undefined);
  }, []);

  // Edycja istniejącej oferty: wczytaj jej dane do formularza
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const res = await fetch(`/api/offers/${editId}`);
      if (!res.ok) {
        setError((await res.json()).error || 'Nie można wczytać oferty do edycji');
        return;
      }
      const d = await res.json();
      const o = d.offer;
      setSelectedClient({ id: o.client_id, name: o.client_name, email: o.client_email, phone: o.client_phone });
      setShowClientSelector(false);
      setDeliveryDays(o.delivery_days);
      setValidDays(o.valid_days);
      setAdditionalCosts(o.additional_costs || 0);
      setAdditionalCostsDescription(o.additional_costs_description || '');
      setNotes(o.notes || '');
      setItems(d.items.map((i: any) => withAmounts(i)));
    })();
  }, [editId]);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setDeliveryDays(t.payload.delivery_days || 14);
    setValidDays(t.payload.valid_days || 30);
    setNotes(t.payload.notes || '');
    setItems(t.payload.items.map((i) => withAmounts(i)));
    setNotice(`Wczytano szablon „${t.name}”. Dostosuj ilości i ceny, a potem zapisz ofertę.`);
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    setItems((prev) => prev.map((it, i) => (i === index ? withAmounts({ ...it, quantity }) : it)));
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.email?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.contact_person?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setShowClientSelector(false);
    setError('');

    // Zaktualizuj last_used klienta
    fetch(`/api/clients/${client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...client, last_used: new Date().toISOString() })
    }).catch(console.error);
  };

  // Wyszukiwanie produktów z historii ofert
  const searchProducts = async (query: string) => {
    if (query.length < 2) {
      setProductSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const suggestions = await response.json();
        setProductSuggestions(suggestions);
      }
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  const handleProductNameChange = (value: string) => {
    setCurrentItem(prev => ({ ...prev, product_name: value }));

    // Wyszukaj produkty jeśli jest co najmniej 2 znaki
    if (value.length >= 2) {
      searchProducts(value);
    } else {
      setProductSuggestions([]);
    }
  };

  const selectProduct = (product: ProductSuggestion) => {
    setCurrentItem(prev => ({
      ...prev,
      product_name: product.name,
      unit: product.unit,
      unit_price: product.last_price
    }));
    calculateAmounts({
      ...currentItem,
      product_name: product.name,
      unit: product.unit,
      unit_price: product.last_price
    });
  };

  // Obsługa danych z PricingManager
  const handlePriceSelect = (priceData: {
    unit_price: number;
    cost_price: number;
    margin_percent: number;
    discount_percent: number;
    original_price: number;
  }) => {
    const updatedItem = {
      ...currentItem,
      unit_price: priceData.unit_price,
      cost_price: priceData.cost_price,
      margin_percent: priceData.margin_percent,
      discount_percent: priceData.discount_percent,
      original_price: priceData.original_price
    };

    // Sprawdź czy marża nie jest za niska
    setShowMarginWarning(priceData.margin_percent < 10);

    calculateAmounts(updatedItem);
  };

  const calculateAmounts = (item: OfferItem) => {
    const netAmount = item.quantity * item.unit_price;
    const vatAmount = netAmount * (item.vat_rate / 100);
    const grossAmount = netAmount + vatAmount;

    const updatedItem = {
      ...item,
      net_amount: Math.round(netAmount * 100) / 100,
      vat_amount: Math.round(vatAmount * 100) / 100,
      gross_amount: Math.round(grossAmount * 100) / 100
    };

    setCurrentItem(updatedItem);
    return updatedItem;
  };

  const handleItemChange = (field: keyof OfferItem, value: number | string) => {
    const updatedItem = { ...currentItem, [field]: value };
    calculateAmounts(updatedItem);
  };

  const addItem = () => {
    if (!currentItem.product_name.trim()) {
      setError('Podaj nazwę produktu');
      return;
    }

    if (currentItem.quantity <= 0 || currentItem.unit_price < 0) {
      setError('Sprawdź ilość i cenę');
      return;
    }

    // Sprawdź marżę przed dodaniem
    if (currentItem.cost_price > 0 && currentItem.margin_percent < 5) {
      const confirmed = confirm(
        `Marża wynosi tylko ${currentItem.margin_percent.toFixed(1)}%. ` +
        'Czy na pewno chcesz dodać tę pozycję?'
      );
      if (!confirmed) return;
    }

    setItems(prev => [...prev, { ...currentItem }]);
    setCurrentItem({
      product_name: '',
      quantity: 1,
      unit: 'szt',
      unit_price: 0,
      vat_rate: 23,
      net_amount: 0,
      vat_amount: 0,
      gross_amount: 0,
      cost_price: 0,
      margin_percent: 0,
      discount_percent: 0,
      original_price: 0
    });
    setError('');
    setProductSuggestions([]);
    setShowMarginWarning(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const itemTotalNet = items.reduce((sum, item) => sum + item.net_amount, 0);
    const itemTotalCost = items.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);

    const totalNet = itemTotalNet + additionalCosts;
    const totalVat = items.reduce((sum, item) => sum + item.vat_amount, 0) + (additionalCosts * 0.23);
    const totalGross = totalNet + totalVat;
    const totalCost = itemTotalCost + (additionalCosts * 0.8); // Zakładamy 20% marżę na dodatkowe koszty
    const totalMargin = totalNet - totalCost;
    const marginPercent = totalCost > 0 ? (totalMargin / totalCost) * 100 : 0;

    return {
      net: Math.round(totalNet * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
      gross: Math.round(totalGross * 100) / 100,
      cost: Math.round(totalCost * 100) / 100,
      margin: Math.round(totalMargin * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100
    };
  };

  const saveOffer = async (status: 'draft' | 'sent') => {
    if (!selectedClient) {
      setError('Wybierz klienta');
      return;
    }

    if (items.length === 0) {
      setError('Dodaj przynajmniej jedną pozycję');
      return;
    }

    const totals = calculateTotals();

    // Sprawdź średnią marżę przed zapisaniem
    if (totals.marginPercent < 10 && status === 'sent') {
      const confirmed = confirm(
        `Średnia marża wynosi tylko ${totals.marginPercent.toFixed(1)}%. ` +
        'Czy na pewno chcesz wysłać tę ofertę?'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError('');
    setErrorDetails([]);

    try {
      const offerData = {
        client_id: selectedClient.id,
        client_name: selectedClient.name,
        client_email: selectedClient.email,
        client_phone: selectedClient.phone,
        delivery_days: deliveryDays,
        valid_days: validDays,
        additional_costs: additionalCosts,
        additional_costs_description: additionalCostsDescription,
        notes,
        total_net: totals.net,
        total_vat: totals.vat,
        total_gross: totals.gross,
        status,
        items
      };

      const response = await fetch(editId ? `/api/offers/${editId}` : '/api/offers', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...offerData, action: 'update' } : offerData)
      });

      if (response.ok) {
        const result = await response.json();
        const savedId = editId || result.offerId;
        // Przy edycji "Zapisz i wyślij" zmienia dodatkowo status (o ile marża nie wymaga akceptacji)
        if (editId && status === 'sent' && !result.needsApproval) {
          await fetch(`/api/offers/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status', status: 'sent' })
          });
        }
        router.push(`/dashboard/offers/${savedId}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Błąd podczas zapisywania oferty');
        if (errorData.details) {
          setErrorDetails(errorData.details);
        }
      }
    } catch (error) {
      setError('Błąd podczas zapisywania oferty');
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  if (!session) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{editId ? `Edycja oferty #${editId}` : 'Nowa oferta'}</h1>
          <p className="text-gray-600 mt-2">
            {selectedClient ? `Oferta dla: ${selectedClient.name}` : 'Wybierz klienta i utwórz ofertę'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-600 text-sm font-medium">{error}</div>
          {errorDetails.length > 0 && (
            <ul className="list-disc list-inside mt-2 text-sm text-red-600">
              {errorDetails.map((err, index) => (
                <li key={index}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Wybór klienta */}
      {showClientSelector ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Wybierz klienta</h2>
            <Link href="/dashboard/clients/new" className="btn-secondary">
              ➕ Dodaj nowego klienta
            </Link>
          </div>

          <div className="mb-6">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Szukaj klientów..."
              className="input-field"
            />
          </div>

          {filteredClients.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {clientSearch ? 'Brak wyników wyszukiwania' : 'Brak klientów'}
              </h3>
              <p className="text-gray-600 mb-4">
                {clientSearch
                  ? 'Spróbuj innych słów kluczowych lub dodaj nowego klienta.'
                  : 'Dodaj pierwszego klienta, aby móc tworzyć oferty.'}
              </p>
              <Link href="/dashboard/clients/new" className="btn-primary">
                Dodaj klienta
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => selectClient(client)}
                  className="text-left p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group"
                >
                  <div className="font-medium text-gray-900 group-hover:text-eltron-primary mb-2">
                    {client.name}
                  </div>
                  {client.contact_person && (
                    <div className="text-sm text-gray-600 mb-1">
                      👤 {client.contact_person}
                    </div>
                  )}
                  {client.email && (
                    <div className="text-sm text-gray-600 mb-1">
                      📧 {client.email}
                    </div>
                  )}
                  {client.phone && (
                    <div className="text-sm text-gray-600">
                      📞 {client.phone}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Główny formularz */}
          <div className="lg:col-span-2 space-y-6">
            {/* Wybrany klient */}
            <div className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Wybrany klient</h2>
                  <div className="space-y-1">
                    <div className="font-medium text-lg">{selectedClient?.name}</div>
                    {selectedClient?.contact_person && (
                      <div className="text-gray-600">👤 {selectedClient.contact_person}</div>
                    )}
                    {selectedClient?.email && (
                      <div className="text-gray-600">📧 {selectedClient.email}</div>
                    )}
                    {selectedClient?.phone && (
                      <div className="text-gray-600">📞 {selectedClient.phone}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowClientSelector(true)}
                  className="btn-secondary"
                >
                  Zmień klienta
                </button>
              </div>
            </div>

            {/* Szablony */}
            {!editId && templates.length > 0 && items.length === 0 && (
              <div className="card bg-sky-50 border-sky-200">
                <h2 className="text-lg font-semibold text-sky-900 mb-1">⚡ Zacznij od szablonu</h2>
                <p className="text-sm text-sky-800 mb-3">Wczytaj gotowy zestaw pozycji i tylko dopasuj ilości.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {templates.map((t) => (
                    <button key={t.id} type="button" onClick={() => applyTemplate(String(t.id))} className="text-left bg-white border border-sky-200 rounded-lg p-3 hover:border-eltron-primary hover:shadow-sm transition">
                      <div className="font-medium text-gray-900 text-sm">{t.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.payload.items.length} pozycji{t.description ? ` · ${t.description}` : ''}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {notice && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">{notice}</div>
            )}

            {/* Parametry oferty */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Parametry oferty</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dostawa (dni)
                  </label>
                  <input
                    type="number"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(parseInt(e.target.value) || 14)}
                    className="input-field"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ważność (dni)
                  </label>
                  <input
                    type="number"
                    value={validDays}
                    onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                    className="input-field"
                    min="1"
                  />
                </div>
              </div>
            </div>

            {/* Dodawanie pozycji */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Dodaj pozycję</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nazwa produktu *
                  </label>
                  <input
                    type="text"
                    value={currentItem.product_name}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    className="input-field"
                    placeholder="Zacznij pisać nazwę produktu..."
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ilość *
                    </label>
                    <input
                      type="number"
                      value={currentItem.quantity}
                      onChange={(e) => handleItemChange('quantity', parseFloat(e.target.value) || 0)}
                      className="input-field"
                      min="0"
                      step="0.001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Jednostka
                    </label>
                    <select
                      value={currentItem.unit}
                      onChange={(e) => handleItemChange('unit', e.target.value)}
                      className="input-field"
                    >
                      <option value="szt">szt</option>
                      <option value="m">m</option>
                      <option value="kg">kg</option>
                      <option value="opak">opak</option>
                      <option value="kpl">kpl</option>
                      <option value="godz">godz</option>
                      <option value="usł">usł</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cena netto (zł)
                    </label>
                    <input
                      type="number"
                      value={currentItem.unit_price}
                      onChange={(e) => handleItemChange('unit_price', parseFloat(e.target.value) || 0)}
                      className="input-field"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      VAT (%)
                    </label>
                    <select
                      value={currentItem.vat_rate}
                      onChange={(e) => handleItemChange('vat_rate', parseFloat(e.target.value))}
                      className="input-field"
                    >
                      <option value="23">23%</option>
                      <option value="8">8%</option>
                      <option value="5">5%</option>
                      <option value="0">0%</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full btn-primary"
                    >
                      Dodaj
                    </button>
                  </div>
                </div>

                {/* PricingManager - nowy komponent do zarządzania cenami i marżami */}
                {currentItem.product_name.length >= 2 && (
                  <PricingManager
                    productName={currentItem.product_name}
                    clientId={selectedClient?.id}
                    onPriceSelect={handlePriceSelect}
                  />
                )}

                {/* Ostrzeżenie o niskiej marży */}
                {showMarginWarning && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <div className="text-yellow-600 mr-2">⚠️</div>
                      <div className="text-yellow-700">
                        <strong>Uwaga:</strong> Marża jest bardzo niska ({currentItem.margin_percent.toFixed(1)}%).
                        Sprawdź czy cena jest prawidłowa.
                      </div>
                    </div>
                  </div>
                )}

                {/* Podgląd kwot aktualnej pozycji */}
                {currentItem.product_name && currentItem.unit_price > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Podgląd pozycji:</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Netto:</span>
                        <span className="font-medium ml-2">{currentItem.net_amount.toFixed(2)} zł</span>
                      </div>
                      <div>
                        <span className="text-gray-600">VAT:</span>
                        <span className="font-medium ml-2">{currentItem.vat_amount.toFixed(2)} zł</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Brutto:</span>
                        <span className="font-medium ml-2">{currentItem.gross_amount.toFixed(2)} zł</span>
                      </div>
                      {currentItem.cost_price > 0 && (
                        <div>
                          <span className="text-gray-600">Marża:</span>
                          <span className={`font-medium ml-2 ${currentItem.margin_percent >= 15 ? 'text-green-600' :
                              currentItem.margin_percent >= 10 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                            {currentItem.margin_percent.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Historia produktów */}
            {currentItem.product_name.length >= 2 && productSuggestions.length > 0 && (
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Historia produktów ({productSuggestions.length})
                  </h2>
                  <div className="text-sm text-gray-600">
                    Wyszukiwanie: "<span className="font-medium">{currentItem.product_name}</span>"
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Nazwa produktu</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Jedn.</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Ostatnia cena</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Używane</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Ostatnio</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-700">Akcja</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSuggestions.map((product, index) => (
                        <tr key={index} className="table-row">
                          <td className="py-3 px-2">
                            <div className="font-medium text-gray-900">{product.name}</div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-sm bg-gray-100 px-2 py-1 rounded">{product.unit}</span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-bold text-eltron-primary">
                              {product.last_price.toFixed(2)} zł
                            </div>
                            <div className="text-xs text-gray-500">
                              śr. {product.avg_price.toFixed(2)} zł
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              {product.usage_count}x
                            </span>
                          </td>
                          <td className="py-3 px-2 text-sm text-gray-600">
                            <div>{product.last_used_by}</div>
                            <div className="text-xs">
                              {new Date(product.last_used_at).toLocaleDateString('pl-PL')}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <button
                              type="button"
                              onClick={() => selectProduct(product)}
                              className="btn-primary text-sm"
                            >
                              Użyj
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lista dodanych pozycji */}
            {items.length > 0 && (
              <div className="card">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Pozycje w ofercie</h2>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.product_name}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(index, parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                            aria-label="Ilość"
                          />
                          <span>{item.unit} × {item.unit_price.toFixed(2)} zł = {item.gross_amount.toFixed(2)} zł brutto</span>
                        </div>
                        {item.cost_price > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            Koszt: {item.cost_price.toFixed(2)} zł |
                            Marża: <span className={`font-medium ${item.margin_percent >= 15 ? 'text-green-600' :
                                item.margin_percent >= 10 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                              {item.margin_percent.toFixed(1)}%
                            </span>
                            {item.discount_percent > 0 && (
                              <span> | Rabat: {item.discount_percent.toFixed(1)}%</span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium ml-4"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dodatkowe koszty */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Dodatkowe koszty</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Kwota netto (zł)
                  </label>
                  <input
                    type="number"
                    value={additionalCosts}
                    onChange={(e) => setAdditionalCosts(parseFloat(e.target.value) || 0)}
                    className="input-field"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Opis
                  </label>
                  <input
                    type="text"
                    value={additionalCostsDescription}
                    onChange={(e) => setAdditionalCostsDescription(e.target.value)}
                    className="input-field"
                    placeholder="np. Transport, montaż"
                  />
                </div>
              </div>
            </div>

            {/* Uwagi */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Uwagi</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field"
                rows={4}
                placeholder="Dodatkowe informacje dla klienta..."
              />
            </div>
          </div>

          {/* Sidebar z podsumowaniem */}
          <div className="lg:col-span-1">
            <div className="card sticky top-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Podsumowanie</h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-600">Pozycje:</span>
                  <span className="font-medium">{items.length}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Wartość netto:</span>
                  <span className="font-medium">{totals.net.toFixed(2)} zł</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">VAT:</span>
                  <span className="font-medium">{totals.vat.toFixed(2)} zł</span>
                </div>

                <div className="flex justify-between border-t border-gray-200 pt-3">
                  <span className="text-lg font-semibold">RAZEM:</span>
                  <span className="text-lg font-bold text-eltron-primary">
                    {totals.gross.toFixed(2)} zł
                  </span>
                </div>

                {/* Podsumowanie marż */}
                {totals.cost > 0 && (
                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Koszt całkowity:</span>
                      <span className="font-medium">{totals.cost.toFixed(2)} zł</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Zysk całkowity:</span>
                      <span className={`font-medium ${totals.margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totals.margin.toFixed(2)} zł
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Średnia marża:</span>
                      <span className={`font-bold ${totals.marginPercent >= 15 ? 'text-green-600' :
                          totals.marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                        {totals.marginPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Ostrzeżenie o niskiej marży */}
              {totals.cost > 0 && totals.marginPercent < 10 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="text-red-700 text-sm">
                    <strong>⚠️ Uwaga:</strong> Średnia marża jest bardzo niska!
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => saveOffer('draft')}
                  disabled={saving}
                  className="w-full btn-secondary disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie...' : editId ? '💾 Zapisz zmiany' : '💾 Zapisz jako szkic'}
                </button>

                <button
                  onClick={() => saveOffer('sent')}
                  disabled={saving}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie...' : '📤 Zapisz i wyślij'}
                </button>
                <p className="text-xs text-gray-500">
                  Oferta ze zbyt niską marżą zapisze się jako szkic i trafi do akceptacji zarządu.
                </p>
              </div>

              {selectedClient && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Klient:</div>
                  <div className="font-medium">{selectedClient.name}</div>
                  {selectedClient.email && (
                    <div className="text-sm text-gray-600">{selectedClient.email}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
