// app/dashboard/margins/page.tsx
'use client';

import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/auth';
import MarginDashboard from '../../components/MarginDashboard';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MarginDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session || !canAccessAllData(session)) {
      router.push('/dashboard');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (!session || !canAccessAllData(session)) {
    return (
      <div className="card text-center py-8">
        <div className="text-red-600 text-lg mb-4">Brak uprawnień</div>
        <p className="text-gray-600">Ta sekcja jest dostępna tylko dla zarządu i centrum elektrycznego.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analiza marż i rentowności</h1>
        <p className="text-gray-600 mt-2">
          Przegląd marż, rabatów i rentowności sprzedaży
        </p>
      </div>

      <MarginDashboard />
    </div>
  );
}

// app/dashboard/products/pricing/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  unit: string;
  cost_price: number;
  base_price: number;
  margin_percent: number;
  min_margin: number;
  max_discount: number;
  last_used: string;
}

export default function ProductPricingPage() {
  const { data: session } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    cost_price: number;
    margin_percent: number;
    min_margin: number;
    max_discount: number;
  }>({
    cost_price: 0,
    margin_percent: 25,
    min_margin: 10,
    max_discount: 15
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/products/pricing/list');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProduct(product.id);
    setEditData({
      cost_price: product.cost_price,
      margin_percent: product.margin_percent,
      min_margin: product.min_margin,
      max_discount: product.max_discount
    });
  };

  const saveChanges = async () => {
    if (!editingProduct) return;

    try {
      const response = await fetch('/api/products/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: editingProduct,
          ...editData
        })
      });

      if (response.ok) {
        await fetchProducts();
        setEditingProduct(null);
      }
    } catch (error) {
      console.error('Error saving pricing:', error);
    }
  };

  const cancelEditing = () => {
    setEditingProduct(null);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Zarządzanie cenami produktów</h1>
          <p className="text-gray-600 mt-2">Ustaw ceny zakupu, marże i limity rabatów</p>
        </div>
        <Link href="/dashboard/products/import" className="btn-primary">
          📥 Import cen
        </Link>
      </div>

      <div className="card">
        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Szukaj produktów..."
            className="input-field max-w-md"
          />
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Produkt</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Cena zakupu</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Marża</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Cena sprzedaży</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Min marża</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Max rabat</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Ostatnie użycie</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="table-row">
                    <td className="py-3 px-2">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-gray-600">{product.unit}</div>
                    </td>
                    <td className="py-3 px-2">
                      {editingProduct === product.id ? (
                        <input
                          type="number"
                          value={editData.cost_price}
                          onChange={(e) => setEditData(prev => ({
                            ...prev,
                            cost_price: parseFloat(e.target.value) || 0
                          }))}
                          className="w-20 px-2 py-1 border rounded text-sm"
                          step="0.01"
                        />
                      ) : (
                        <span className="font-medium">{formatCurrency(product.cost_price)}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingProduct === product.id ? (
                        <div className="flex items-center">
                          <input
                            type="number"
                            value={editData.margin_percent}
                            onChange={(e) => setEditData(prev => ({
                              ...prev,
                              margin_percent: parseFloat(e.target.value) || 0
                            }))}
                            className="w-16 px-2 py-1 border rounded text-sm"
                            step="0.1"
                          />
                          <span className="ml-1 text-sm">%</span>
                        </div>
                      ) : (
                        <span className={`font-medium ${
                          product.margin_percent >= 25 ? 'text-green-600' :
                          product.margin_percent >= 15 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {product.margin_percent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-medium text-blue-600">
                        {formatCurrency(product.base_price)}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {editingProduct === product.id ? (
                        <div className="flex items-center">
                          <input
                            type="number"
                            value={editData.min_margin}
                            onChange={(e) => setEditData(prev => ({
                              ...prev,
                              min_margin: parseFloat(e.target.value) || 0
                            }))}
                            className="w-16 px-2 py-1 border rounded text-sm"
                            step="0.1"
                          />
                          <span className="ml-1 text-sm">%</span>
                        </div>
                      ) : (
                        <span className="text-sm">{product.min_margin}%</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingProduct === product.id ? (
                        <div className="flex items-center">
                          <input
                            type="number"
                            value={editData.max_discount}
                            onChange={(e) => setEditData(prev => ({
                              ...prev,
                              max_discount: parseFloat(e.target.value) || 0
                            }))}
                            className="w-16 px-2 py-1 border rounded text-sm"
                            step="0.1"
                          />
                          <span className="ml-1 text-sm">%</span>
                        </div>
                      ) : (
                        <span className="text-sm">{product.max_discount}%</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-sm text-gray-600">
                      {formatDate(product.last_used)}
                    </td>
                    <td className="py-3 px-2">
                      {editingProduct === product.id ? (
                        <div className="flex space-x-2">
                          <button
                            onClick={saveChanges}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                          >
                            ✅ Zapisz
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                          >
                            ❌ Anuluj
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(product)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          ✏️ Edytuj
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}