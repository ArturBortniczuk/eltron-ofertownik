// lib/auth.ts - KOMPLETNA WERSJA Z DEBUGOWANIEM
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Hasło', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Pobierz użytkownika z bazy
          const result = await db.query(`
            SELECT 
              id, email, password_hash, name, 
              first_name, last_name, role, market_region, is_active 
            FROM users 
            WHERE LOWER(email) = LOWER($1)
          `, [credentials.email.trim()]);

          if (result.rows.length === 0) {
            return null;
          }

          const user = result.rows[0];

          // Sprawdź czy konto jest aktywne
          if (user.is_active === false) {
            return null;
          }

          // Sprawdź hasło
          let isPasswordValid = false;
          const inputPassword = credentials.password.trim();
          const storedHash = user.password_hash?.trim() || '';

          if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
            // Bcrypt hash
            try {
              isPasswordValid = await bcrypt.compare(inputPassword, storedHash);
            } catch (bcryptError) {
              console.error('Bcrypt error:', bcryptError);
              isPasswordValid = false;
            }
          } else {
            // Plain text comparison (backward compatibility)
            isPasswordValid = inputPassword === storedHash;
          }

          if (!isPasswordValid) {
            return null;
          }
          
          // Opcjonalnie: zaktualizuj last_login
          try {
            await db.query(
              'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
              [user.id]
            );
          } catch (updateError) {
            console.warn('Failed to update last_login:', updateError);
          }

          // Przygotuj dane użytkownika
          const userData = {
            id: user.id.toString(),
            email: user.email,
            name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Użytkownik',
            // Dodatkowe dane
            firstName: user.first_name || null,
            lastName: user.last_name || null,
            role: user.role || 'inne',
            marketRegion: user.market_region || null,
          };

          return userData;

        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 godzin
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        console.log('🎫 JWT callback - storing user data in token');
        token.id = user.id;
        token.role = (user as any).role;
        token.marketRegion = (user as any).marketRegion;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        console.log('🎫 Session callback - adding user data to session');
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).marketRegion = token.marketRegion;
        (session.user as any).firstName = token.firstName;
        (session.user as any).lastName = token.lastName;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

// Funkcje pomocnicze dla ról
export const hasRole = (session: any, allowedRoles: string[]): boolean => {
  return session?.user?.role && allowedRoles.includes(session.user.role);
};

export const isHandlowiec = (session: any): boolean => {
  return session?.user?.role === 'handlowiec';
};

export const isZarzad = (session: any): boolean => {
  return session?.user?.role === 'zarząd';
};

export const canAccessAllData = (session: any): boolean => {
  // Zarząd i centrum elektryczne mogą widzieć dane wszystkich
  return ['zarząd', 'centrum elektryczne'].includes(session?.user?.role);
};

export const getMarketRegion = (session: any): string | null => {
  return session?.user?.marketRegion || null;
};

export const getUserRole = (session: any): string => {
  return session?.user?.role || 'inne';
};

export const canManageUsers = (session: any): boolean => {
  return session?.user?.role === 'zarząd';
};

// Debug helper
export const debugSession = (session: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🐛 Session debug:', {
      userId: session?.user?.id,
      email: session?.user?.email,
      role: session?.user?.role,
      marketRegion: session?.user?.marketRegion
    });
  }
};
