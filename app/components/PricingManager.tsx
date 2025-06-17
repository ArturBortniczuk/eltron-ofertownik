// components/PricingManager.tsx
'use client';

import { useState, useEffect } from 'react';

interface PricingData {
  product: {
    id: number;
    name: string;
    unit: string;
    cost_price: number;
    base_price: number;
    final_price: number;
    client_discount: number;
    final_margin: number;
    min_margin: number;
    max_discount: number;
  };
}

interface PricingManagerProps {
  productName: string;
  clientId?: number;
  onPriceSelect: (priceData: {
    unit_price: number;
    cost_price: number;
    margin_percent: number;
    discount_percent: number;
    original_price: number;
  }) => void;
}

export default function PricingManager({ 
  productName, 
  clientId, 
  onPriceSelect 
}: PricingManagerProps) {
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [showPricingDetails, setShowPricingDetails] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productName.length >= 2) {
      searchProductPricing();
    }
  }, [productName, clientId]);

  const searchProductPricing = async () => {
    setLoading(true);
    try {
      // Najpierw znajdź produkt po nazwie
      const searchResponse = await fetch(`/api/products/search?q=${encodeURIComponent(productName)}`);
      if (searchResponse.ok) {
        const products = await searchResponse.json();
        if (products.length > 0) {
          const product = products[0];
          
          // Pobierz dane cenowe
          const pricingResponse = await fetch(
            `/api/products/pricing?product_id=${product.id}${clientId ? `&client_id=${clientId}` : ''}`
          );
          
          if (pricingResponse.ok) {
            const pricing = await pricingResponse.json();
            setPricingData(pricing);
            setCustomPrice(pricing.product.final_price);
            setCustomDiscount(pricing.product.client_discount);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateFinalPrice = (basePrice: number, discount: number) => {
    return basePrice * (1 - discount / 100);
  };

  const calculateMargin = (salePrice: number, costPrice: number) => {
    if (costPrice === 0) return 0;
    return ((salePrice - costPrice) / costPrice) * 100;
  };

  const handlePriceChange = (newPrice: number) => {
    if (!pricingData) return;
    
    setCustomPrice(newPrice);
    const margin = calculateMargin(newPrice, pricingData.product.cost_price);
    
    onPriceSelect({
      unit_price: newPrice,
      cost_price: pricingData.product.cost_price,
      margin_percent: margin,
      discount_percent: customDiscount,
      original_price: pricingData.product.base_price
    });
  };

  const handleDiscountChange = (newDiscount: number) => {
    if (!pricingData) return;
    
    const maxDiscount = pricingData.product.max_discount;
    if (newDiscount > maxDiscount) {
      alert(`Maksymalny rabat wynosi ${maxDiscount}%`);
      return;
    }
    
    setCustomDiscount(newDiscount);
    const finalPrice = calculateFinalPrice(pricingData.product.base_price, newDiscount);
    setCustomPrice(finalPrice);
    
    const margin = calculateMargin(finalPrice, pricingData.product.cost_price);
    
    onPriceSelect({
      unit_price: finalPrice,
      cost_price: pricingData.product.cost_price,
      margin_percent: margin,
      discount_percent: newDiscount,
      original_price: pricingData.product.base_price
    });
  };

  const useRecommendedPrice = () => {
    if (!pricingData) return;
    handlePriceChange(pricingData.product.final_price);
    setCustomDiscount(pricingData.product.client_discount);
  };

  const getMarginColor = (margin: number, minMargin: number) => {
    if (margin < minMargin) return 'text-red-600';
    if (margin < minMargin + 5) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (!pricingData) {
    return (
      <div className="text-sm text-gray-500">
        {loading ? 'Sprawdzam ceny...' : 'Wpisz nazwę produktu aby zobaczyć ceny'}
      </div>
    );
  }

  const currentMargin = calculateMargin(customPrice, pricingData.product.cost_price);
  const isMarginTooLow = currentMargin < pricingData.product.min_margin;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-blue-900">💰 Zarządzanie ceną</h4>
        <button
          onClick={() => setShowPricingDetails(!showPricingDetails)}
          className="text-blue-600 text-sm hover:underline"
        >
          {showPricingDetails ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cena sprzedaży (zł)
          </label>
          <input
            type="number"
            value={customPrice}
            onChange={(e) => handlePriceChange(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.01"
            min="0"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rabat dla klienta (%)
          </label>
          <input
            type="number"
            value={customDiscount}
            onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.1"
            min="0"
            max={pricingData.product.max_discount}
          />
          <div className="text-xs text-gray-500 mt-1">
            Max: {pricingData.product.max_discount}%
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center text-sm mb-3">
        <div className="flex space-x-4">
          <div>
            <span className="text-gray-600">Marża:</span>
            <span className={`font-bold ml-1 ${getMarginColor(currentMargin, pricingData.product.min_margin)}`}>
              {currentMargin.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-gray-600">Min marża:</span>
            <span className="font-medium ml-1">{pricingData.product.min_margin}%</span>
          </div>
        </div>
        
        <button
          onClick={useRecommendedPrice}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
        >
          Użyj zalecanej ceny
        </button>
      </div>

      {isMarginTooLow && (
        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
          <div className="text-red-700 text-sm font-medium">
            ⚠️ Marża jest poniżej minimum ({pricingData.product.min_margin}%)
          </div>
        </div>
      )}

      {showPricingDetails && (
        <div className="border-t border-blue-200 pt-3 mt-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Cena zakupu:</div>
              <div className="font-medium">{pricingData.product.cost_price.toFixed(2)} zł</div>
            </div>
            <div>
              <div className="text-gray-600">Cena bazowa:</div>
              <div className="font-medium">{pricingData.product.base_price.toFixed(2)} zł</div>
            </div>
            <div>
              <div className="text-gray-600">Zalecana cena:</div>
              <div className="font-medium text-blue-600">{pricingData.product.final_price.toFixed(2)} zł</div>
            </div>
            <div>
              <div className="text-gray-600">Zysk jednostkowy:</div>
              <div className="font-medium text-green-600">
                {(customPrice - pricingData.product.cost_price).toFixed(2)} zł
              </div>
            </div>
          </div>
          
          {pricingData.product.client_discount > 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <div className="text-yellow-700 text-sm">
                💡 Ten klient ma już ustalone {pricingData.product.client_discount}% rabatu na ten produkt
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// components/MarginDashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface MarginReport {
  monthlyReport: Array<{
    month: string;
    offers_count: number;
    total_cost: number;
    total_sale: number;
    total_margin: number;
    avg_margin_percent: number;
    total_discount: number;
    avg_discount_percent: number;
  }>;
  topMarginProducts: Array<{
    name: string;
    avg_margin: number;
    total_quantity: number;
    total_value: number;
  }>;
  period: string;
}

export default function MarginDashboard() {
  const { data: session } = useSession();
  const [report, setReport] = useState<MarginReport | null>(null);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarginReport();
  }, [period]);

  const fetchMarginReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/margins?period=${period}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      }
    } catch (error) {
      console.error('Error fetching margin report:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(amount);
  };

  const formatMonth = (monthString: string) => {
    return new Date(monthString).toLocaleDateString('pl-PL', { 
      year: 'numeric', 
      month: 'long' 
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="card text-center py-8">
        <div className="text-gray-600">Brak danych do wyświetlenia</div>
      </div>
    );
  }

  const latestMonth = report.monthlyReport[0];
  const totalRevenue = latestMonth ? latestMonth.total_sale : 0;
  const totalCosts = latestMonth ? latestMonth.total_cost : 0;
  const totalProfit = totalRevenue - totalCosts;
  const avgMargin = latestMonth ? latestMonth.avg_margin_percent : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">📊 Analiza marż i rabatów</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="30">Ostatnie 30 dni</option>
          <option value="90">Ostatnie 3 miesiące</option>
          <option value="180">Ostatnie 6 miesięcy</option>
          <option value="365">Ostatni rok</option>
        </select>
      </div>

      {/* Podsumowanie */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <div className="w-6 h-6 text-blue-600">💰</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-gray-600 text-sm">Przychody</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <div className="w-6 h-6 text-red-600">📉</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalCosts)}
              </p>
              <p className="text-gray-600 text-sm">Koszty</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <div className="w-6 h-6 text-green-600">📈</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalProfit)}
              </p>
              <p className="text-gray-600 text-sm">Zysk</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <div className="w-6 h-6 text-yellow-600">%</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {avgMargin.toFixed(1)}%
              </p>
              <p className="text-gray-600 text-sm">Średnia marża</p>
            </div>
          </div>
        </div>
      </div>

      {/* Raport miesięczny */}
      <div className="card">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">📅 Raport miesięczny</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 font-medium text-gray-700">Miesiąc</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Oferty</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Przychody</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Koszty</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Zysk</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Marża</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Śr. rabat</th>
              </tr>
            </thead>
            <tbody>
              {report.monthlyReport.map((month, index) => {
                const profit = month.total_sale - month.total_cost;
                const marginPercent = month.total_cost > 0 ? (profit / month.total_cost) * 100 : 0;
                
                return (
                  <tr key={index} className="table-row">
                    <td className="py-3 px-2 font-medium">{formatMonth(month.month)}</td>
                    <td className="py-3 px-2">{month.offers_count}</td>
                    <td className="py-3 px-2">{formatCurrency(month.total_sale)}</td>
                    <td className="py-3 px-2">{formatCurrency(month.total_cost)}</td>
                    <td className="py-3 px-2 font-medium text-green-600">
                      {formatCurrency(profit)}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`font-medium ${
                        marginPercent >= 25 ? 'text-green-600' : 
                        marginPercent >= 15 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {marginPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-2">{month.avg_discount_percent.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top produkty */}
      <div className="card">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">🏆 Produkty z najwyższą marżą</h3>
        <div className="space-y-3">
          {report.topMarginProducts.map((product, index) => (
            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="font-medium text-gray-900">{product.name}</div>
                <div className="text-sm text-gray-600">
                  Sprzedano: {product.total_quantity} | Wartość: {formatCurrency(product.total_value)}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  product.avg_margin >= 25 ? 'text-green-600' : 
                  product.avg_margin >= 15 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {product.avg_margin.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">marża</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
