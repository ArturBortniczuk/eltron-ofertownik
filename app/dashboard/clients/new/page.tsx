// app/dashboard/clients/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AddClientPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    nip: '',
    contact_person: '',
    notes: ''
  });
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        router.push('/dashboard/clients');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Błąd podczas dodawania klienta');
      }
    } catch (error) {
      setError('Błąd podczas dodawania klienta');
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Dodaj klienta</h1>
          <p className="text-gray-600 mt-2">Uzupełnij dane nowego klienta</p>
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
            {saving ? 'Zapisywanie...' : '💾 Dodaj klienta'}
          </button>
        </div>
      </form>
    </div>
  );
}