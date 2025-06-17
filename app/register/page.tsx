// app/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientOnly from '../components/ClientOnly';

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: string;
  marketRegion: string;
}

interface RegistrationOptions {
  roles: string[];
  marketRegions: string[];
  allowedDomains: string[];
}

const ROLE_LABELS = {
  'handlowiec': 'Handlowiec',
  'zarząd': 'Zarząd',
  'centrum elektryczne': 'Centrum Elektryczne',
  'budowy': 'Budowy',
  'inne': 'Inne'
};

function RegisterForm() {
  const router = useRouter();
  
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: '',
    marketRegion: ''
  });
  
  const [options, setOptions] = useState<RegistrationOptions>({
    roles: [],
    marketRegions: [],
    allowedDomains: []
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    // Jeśli zmieni się rola na inną niż handlowiec, wyczyść region
    if (formData.role !== 'handlowiec') {
      setFormData(prev => ({ ...prev, marketRegion: '' }));
    }
  }, [formData.role]);

  useEffect(() => {
    // Sprawdź siłę hasła
    const strength = calculatePasswordStrength(formData.password);
    setPasswordStrength(strength);
  }, [formData.password]);

  const fetchOptions = async () => {
    try {
      const response = await fetch('/api/auth/register');
      if (response.ok) {
        const data = await response.json();
        setOptions(data);
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 25;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 15;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 10;
    
    return Math.min(strength, 100);
  };

  const getPasswordStrengthColor = (strength: number): string => {
    if (strength < 30) return 'bg-red-500';
    if (strength < 60) return 'bg-yellow-500';
    if (strength < 80) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getPasswordStrengthText = (strength: number): string => {
    if (strength < 30) return 'Słabe';
    if (strength < 60) return 'Średnie';
    if (strength < 80) return 'Dobre';
    return 'Bardzo dobre';
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;
    
    return options.allowedDomains.some(domain => 
      email.toLowerCase().endsWith(domain)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Walidacja po stronie klienta
    if (!validateEmail(formData.email)) {
      setError('Podaj prawidłowy adres email z domeny @grupaeltron.pl lub @eltron.pl');
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Hasła nie są identyczne');
      setLoading(false);
      return;
    }

    if (passwordStrength < 30) {
      setError('Hasło jest zbyt słabe. Użyj dużych i małych liter, cyfr i znaków specjalnych.');
      setLoading(false);
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('Imię i nazwisko są wymagane');
      setLoading(false);
      return;
    }

    if (!formData.role) {
      setError('Wybierz rolę w firmie');
      setLoading(false);
      return;
    }

    if (formData.role === 'handlowiec' && !formData.marketRegion) {
      setError('Handlowcy muszą wybrać region');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setTimeout(() => {
          router.push('/login?message=registration_success');
        }, 2000);
      } else {
        setError(data.error || 'Błąd podczas rejestracji');
      }
    } catch (error) {
      setError('Błąd połączenia. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-eltron-primary via-gray-100 to-eltron-light py-12 px-4">
      <div className="max-w-md w-full">
        <div className="card">
          <div className="text-center mb-8">
            <div className="mx-auto w-32 h-16 bg-eltron-primary rounded-lg flex items-center justify-center mb-4">
              <div className="text-white font-bold text-lg">ELTRON</div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Rejestracja</h1>
            <p className="text-gray-600 mt-2">Utwórz konto w systemie ofertowym</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="text-green-600 text-sm">{success}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Imię i nazwisko */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imię *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  className="input-field"
                  placeholder="Jan"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nazwisko *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  className="input-field"
                  placeholder="Kowalski"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email firmowy *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="input-field"
                placeholder="imie.nazwisko@grupaeltron.pl"
                required
                disabled={loading}
              />
              <div className="text-xs text-gray-500 mt-1">
                Tylko adresy @grupaeltron.pl i @eltron.pl
              </div>
            </div>

            {/* Rola */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rola w firmie *
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleChange('role', e.target.value)}
                className="input-field"
                required
                disabled={loading}
              >
                <option value="">Wybierz rolę</option>
                {options.roles.map(role => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
                  </option>
                ))}
              </select>
            </div>

            {/* Region dla handlowców */}
            {formData.role === 'handlowiec' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Region rynkowy *
                </label>
                <select
                  value={formData.marketRegion}
                  onChange={(e) => handleChange('marketRegion', e.target.value)}
                  className="input-field"
                  required
                  disabled={loading}
                >
                  <option value="">Wybierz region</option>
                  {options.marketRegions.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Hasło */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hasło *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                className="input-field"
                placeholder="Minimum 8 znaków"
                required
                disabled={loading}
              />
              {formData.password && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Siła hasła:</span>
                    <span>{getPasswordStrengthText(passwordStrength)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor(passwordStrength)}`}
                      style={{ width: `${passwordStrength}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Potwierdzenie hasła */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Potwierdź hasło *
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                className="input-field"
                placeholder="Powtórz hasło"
                required
                disabled={loading}
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <div className="text-red-500 text-xs mt-1">Hasła nie są identyczne</div>
              )}
            </div>

            {/* Przycisk rejestracji */}
            <button
              type="submit"
              disabled={loading || passwordStrength < 30}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Tworzenie konta...' : 'Utwórz konto'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Masz już konto?{' '}
              <Link href="/login" className="text-eltron-primary hover:underline font-medium">
                Zaloguj się
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center text-xs text-gray-500">
            <p>Rejestracja dostępna tylko dla pracowników Grupy Eltron</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <ClientOnly 
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-lg">Ładowanie...</div>
        </div>
      }
    >
      <RegisterForm />
    </ClientOnly>
  );
}