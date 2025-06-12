'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

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
  
  // Dane oferty
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
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

  // Wyszukiwanie produktów
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

  // Obsługa zmiany nazwy produktu
  const handleProductNameChange = (value: string) => {
    setCurrentItem(prev => ({ ...prev, product_name: value }));
    searchProducts(value);
  };

  // Wybierz produkt z podpowiedzi
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

  // Przelicz kwoty
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

  // Obsługa zmiany pól pozycji
  const handleItemChange = (field: keyof OfferItem, value: number | string) => {
    const updatedItem = { ...currentItem, [field]: value };
    calculateAmounts(updatedItem);
  };

  // Dodaj pozycję do oferty
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

  // Usuń pozycję
  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Oblicz sumy
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

  // Zapisz ofertę
  const saveOffer = async (status: 'draft' | 'sent') => {
    if (!clientName.trim()) {
      setError('Podaj nazwę klienta');
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
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
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
          <p className="text-gray-600 mt-2">Utwórz ofertę dla klienta</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="error-text">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Główny formularz */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dane klienta */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Dane klienta</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nazwa klienta *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="input-field"
                  placeholder="Nazwa firmy lub imię nazwisko"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="input-field"
                  placeholder="kontakt@firma.pl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="input-field"
                  placeholder="+48 123 456 789"
                />
              </div>
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
                    <option value="0">0%</option