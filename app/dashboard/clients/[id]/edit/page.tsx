// app/dashboard/clients/[id]/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  nip?: string;
  contact_person?: string;
  notes?: string;
}

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    nip: '',
    contact_person: '',
    notes: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      if (response.ok) {
        const client = await response.json();
        setFormData({
          name: client.name || '',
          email: client.email || '',
          phone: client.phone || '',
          address: client.address || '',
          nip: client.nip || '',
          contact_person: client.contact_person || '',
          notes: client.notes || ''
        });
      } else {
        setError('Nie znaleziono klienta');
      }
    } catch (error) {
      setError('Błąd ładowania danych klienta');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Nazwa klienta jest wymagana');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        router.push('/dashboard/clients');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Błąd podczas aktualizacji klienta');
      }
    } catch (error) {
      setError('Błąd podczas aktualizacji klienta');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="card space-y-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !formData.name) {
    return (
      <div className="max-w-2xl mx-auto card text-center">
        <div className="text-red-600 text-lg mb-4">{error}</div>
        <Link href="/dashboard/clients" className="btn-primary">
          Powrót do listy klientów
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center space-x-4">
        <Link 
          href="/dashboard/clients" 
          className="text-gray-600 hover:text-gray-800"
        >
          ← Powrót
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edytuj klienta</h1>
          <p className="text-gray-600 mt-2">Zaktualizuj dane klienta</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="error-text">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Podstawowe informacje</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nazwa klienta / firmy *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="input-field"
              placeholder="np. ABC Elektro Sp. z o.o."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
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
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="input-field"
              placeholder="+48 123 456 789"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adres
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="input-field"
              rows={3}
              placeholder="ul. Przykładowa 123&#10;00-001 Warszawa"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              NIP
            </label>
            <input
              type="text"
              value={formData.nip}
              onChange={(e) => handleChange('nip', e.target.value)}
              className="input-field"
              placeholder="123-456-78-90"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Osoba kontaktowa
            </label>
            <input
              type="text"
              value={formData.contact_person}
              onChange={(e) => handleChange('contact_person', e.target.value)}
              className="input-field"
              placeholder="Jan Kowalski"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Uwagi
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="input-field"
              rows={4}
              placeholder="Dodatkowe informacje o kliencie..."
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <Link href="/dashboard/clients" className="btn-secondary">
            Anuluj
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Zapisywanie...' : '💾 Zaktualizuj klienta'}
          </button>
        </div>
      </form>
    </div>
  );
}