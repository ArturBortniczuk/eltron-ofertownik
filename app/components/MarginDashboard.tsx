// app/components/MarginDashboard.tsx
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
