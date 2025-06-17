// lib/auth.ts - ZAKTUALIZOWANA WERSJA
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
          console.log('Trying to authenticate:', credentials.email);
          
          const result = await db.query(`
            SELECT 
              id, email, password_hash, name, first_name, last_name, 
              role, market_region, is_active 
            FROM users 
            WHERE email = $1 AND is_active = true
          `, [credentials.email.toLowerCase()]);

          if (result.rows.length === 0) {
            console.log('User not found or inactive');
            return null;
          }

          const user = result.rows[0];
          console.log('Found user:', user.email, 'Role:', user.role);
          
          // Sprawdź hasło - zawsze używaj bcrypt dla nowych użytkowników
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);

          if (!isPasswordValid) {
            console.log('Invalid password');
            return null;
          }

          console.log('Authentication successful');
          
          // Zaktualizuj last_login (opcjonalne)
          await db.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
          ).catch(console.error);

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name || `${user.first_name} ${user.last_name}`,
            // Dodatkowe dane użytkownika
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            marketRegion: user.market_region,
          };
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
        token.id = user.id;
        token.role = (user as any).role;
        token.marketRegion = (user as any).marketRegion;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
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
