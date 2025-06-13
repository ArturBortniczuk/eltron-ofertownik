// app/dashboard/offers/new/page.tsx - ZAKTUALIZOWANA WERSJA
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

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
}

interface ProductSuggestion {
  id: number;
  name: string;
  unit: string;
  last_price: number;
  last_used_by: string;
  last_used_at: string;
}

export default function NewOfferPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get('client');
  
  // Wybór klienta
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientSelector, setShowClientSelector] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  
  // Dane oferty (reszta bez zmian)
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
    gross_amount: 0
  });
  
  // Podpowiedzi produktów
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Stan UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  // Wyszukiwanie produktów (bez zmian)
  const searchProducts = async (query: string) => {
    if (query.length < 2) {
      setProductSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const suggestions = await response.json();
        setProductSuggestions(suggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  // Funkcje obsługi produktów (bez zmian - kopiuję z oryginalnej wersji)
  const handleProductNameChange = (value: string) => {
    setCurrentItem(prev => ({ ...prev, product_name: value }));
    searchProducts(value);
  };

  const selectProduct = (product: ProductSuggestion) => {
    setCurrentItem(prev => ({
      ...prev,
      product_name: product.name,
      unit: product.unit,
      unit_price: product.last_price
    }));
    setShowSuggestions(false);
    calculateAmounts({ ...currentItem, product_name: product.name, unit: product.unit, unit_price: product.last_price });
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

    setItems(prev => [...prev, { ...currentItem }]);
    setCurrentItem({
      product_name: '',
      quantity: 1,
      unit: 'szt',
      unit_price: 0,
      vat_rate: 23,
      net_amount: 0,
      vat_amount: 0,
      gross_amount: 0
    });
    setError('');
    setShowSuggestions(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const totalNet = items.reduce((sum, item) => sum + item.net_amount, 0) + additionalCosts;
    const totalVat = items.reduce((sum, item) => sum + item.vat_amount, 0) + (additionalCosts * 0.23);
    const totalGross = totalNet + totalVat;

    return {
      net: Math.round(totalNet * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
      gross: Math.round(totalGross * 100) / 100
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

    setSaving(true);
    setError('');

    try {
      const totals = calculateTotals();
      
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

      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offerData)
      });

      if (response.ok) {
        const { offerId } = await response.json();
        router.push(`/dashboard/offers/${offerId}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Błąd podczas zapisywania oferty');
      }
    } catch (error) {
      setError('Błąd podczas zapisywania oferty');
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nowa oferta</h1>
          <p className="text-gray-600 mt-2">
            {selectedClient ? `Oferta dla: ${selectedClient.name}` : 'Wybierz klienta i utwórz ofertę'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="error-text">{error}</div>
        </div>
      )}

      {/* Wybór klienta */}
      {showClientSelector ? (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Wybierz klienta</h2>
            <button
              onClick={() => router.push('/dashboard/clients/new')}
              className="btn-secondary text-sm"
            >
              ➕ Dodaj nowego klienta
            </button>
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
              <button
                onClick={() => router.push('/dashboard/clients/new')}
                className="btn-primary"
              >
                Dodaj klienta
              </button>
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
                  className="btn-secondary text-sm"
                >
                  Zmień klienta
                </button>
              </div>
            </div>

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
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nazwa produktu *
                  </label>
                  <input
                    type="text"
                    value={currentItem.product_name}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    className="input-field"
                    placeholder="Zacznij pisać nazwę produktu..."
                    onFocus={() => currentItem.product_name.length >= 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  
                  {/* Podpowiedzi produktów */}
                  {showSuggestions && productSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {productSuggestions.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectProduct(product)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-600">
                            Ostatnia cena: {product.last_price} zł/{product.unit} 
                            • {product.last_used_by} 
                            • {new Date(product.last_used_at).toLocaleDateString('pl-PL')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
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
                      className="btn-primary w-full"
                    >
                      Dodaj
                    </button>
                  </div>
                </div>

                {/* Podgląd kwot aktualnej pozycji */}
                {currentItem.product_name && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Podgląd pozycji:</div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
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
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lista dodanych pozycji */}
            {items.length > 0 && (
              <div className="card">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Pozycje w ofercie</h2>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.product_name}</div>
                        <div className="text-sm text-gray-600">
                          {item.quantity} {item.unit} × {item.unit_price.toFixed(2)} zł 
                          = {item.gross_amount.toFixed(2)} zł brutto
                        </div>
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
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => saveOffer('draft')}
                  disabled={saving}
                  className="w-full btn-secondary disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie...' : '💾 Zapisz jako szkic'}
                </button>
                
                <button
                  onClick={() => saveOffer('sent')}
                  disabled={saving}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie...' : '📤 Zapisz i wyślij'}
                </button>
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
