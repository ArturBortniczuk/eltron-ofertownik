// app/api/auth/register/route.ts - NAPRAWIONA WERSJA
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_DOMAINS = ['@grupaeltron.pl', '@eltron.pl'];
const ALLOWED_ROLES = ['handlowiec', 'zarząd', 'centrum elektryczne', 'budowy', 'inne'];
const MARKET_REGIONS = ['Podlaski', 'Pomorski', 'Lubelski', 'Śląski', 'Mazowiecki', 'Wielkopolski', 'Małopolski', 'Dolnośląski'];

interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: string;
  marketRegion?: string;
}

// Funkcja pomocnicza do logowania prób rejestracji
async function logRegistrationAttempt(
  email: string, 
  request: NextRequest, 
  success: boolean, 
  errorMessage?: string
) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';

    await db.query(`
      INSERT INTO registration_attempts (email, ip_address, success, error_message)
      VALUES ($1, $2, $3, $4)
    `, [email, ip, success, errorMessage || null]);
  } catch (error) {
    console.error('Failed to log registration attempt:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequest = await request.json();
    const { email, password, confirmPassword, firstName, lastName, role, marketRegion } = body;

    // Walidacja podstawowa
    if (!email || !password || !confirmPassword || !firstName || !lastName || !role) {
      return NextResponse.json(
        { error: 'Wszystkie pola są wymagane' },
        { status: 400 }
      );
    }

    // Walidacja domeny email
    const isValidDomain = ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
    if (!isValidDomain) {
      await logRegistrationAttempt(email, request, false, 'Nieprawidłowa domena email');
      return NextResponse.json(
        { error: 'Rejestracja dostępna tylko dla pracowników Grupy Eltron (@grupaeltron.pl, @eltron.pl)' },
        { status: 400 }
      );
    }

    // Walidacja formatu email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy format adresu email' },
        { status: 400 }
      );
    }

    // Walidacja hasła
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Hasło musi mieć co najmniej 8 znaków' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Hasła nie są identyczne' },
        { status: 400 }
      );
    }

    // Walidacja roli
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Nieprawidłowa rola' },
        { status: 400 }
      );
    }

    // Walidacja regionu dla handlowców
    if (role === 'handlowiec') {
      if (!marketRegion || !MARKET_REGIONS.includes(marketRegion)) {
        return NextResponse.json(
          { error: 'Handlowcy muszą wybrać region' },
          { status: 400 }
        );
      }
    } else if (marketRegion) {
      return NextResponse.json(
        { error: 'Region można wybrać tylko dla roli handlowiec' },
        { status: 400 }
      );
    }

    // Walidacja imienia i nazwiska
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Imię i nazwisko muszą mieć co najmniej 2 znaki' },
        { status: 400 }
      );
    }

    // Sprawdź czy użytkownik już istnieje
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      await logRegistrationAttempt(email, request, false, 'Email już istnieje');
      return NextResponse.json(
        { error: 'Użytkownik z tym adresem email już istnieje' },
        { status: 400 }
      );
    }

    // Hashuj hasło
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Utwórz użytkownika
    const result = await db.query(`
      INSERT INTO users (
        email, password_hash, name, first_name, last_name, 
        role, market_region, is_active, registered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING id, email, first_name, last_name, role, market_region
    `, [
      email.toLowerCase(),
      hashedPassword,
      `${firstName} ${lastName}`, // dla kompatybilności z istniejącym kodem
      firstName.trim(),
      lastName.trim(),
      role,
      role === 'handlowiec' ? marketRegion : null,
      true
    ]);

    const newUser = result.rows[0];

    // Loguj udaną rejestrację
    await logRegistrationAttempt(email, request, true, 'Rejestracja udana');

    console.log(`New user registered: ${email} (${role}${role === 'handlowiec' ? ` - ${marketRegion}` : ''})`);

    return NextResponse.json({
      success: true,
      message: 'Konto zostało utworzone pomyślnie. Możesz się teraz zalogować.',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        marketRegion: newUser.market_region
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Bezpieczne parsowanie email z body
    try {
      const bodyText = await request.text();
      const bodyJson = JSON.parse(bodyText);
      await logRegistrationAttempt(bodyJson?.email || 'unknown', request, false, error instanceof Error ? error.message : 'Unknown error');
    } catch {
      // Ignore parsing errors for logging
    }

    return NextResponse.json(
      { error: 'Błąd podczas rejestracji. Spróbuj ponownie.' },
      { status: 500 }
    );
  }
}

// GET endpoint do pobrania dostępnych opcji (dla formularza)
export async function GET() {
  try {
    return NextResponse.json({
      roles: ALLOWED_ROLES,
      marketRegions: MARKET_REGIONS,
      allowedDomains: ALLOWED_DOMAINS
    });
  } catch (error) {
    console.error('GET register options error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania opcji rejestracji' },
      { status: 500 }
    );
  }
}
