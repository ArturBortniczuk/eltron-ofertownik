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
