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
          
          const result = await db.query(
            'SELECT id, email, password_hash, name FROM users WHERE email = $1',
            [credentials.email]
          );

          if (result.rows.length === 0) {
            console.log('User not found');
            return null;
          }

          const user = result.rows[0];
          console.log('Found user:', user.email);
          
          // NAPRAWKA: Sprawdź czy hasło to plaintext czy hash
          let isPasswordValid = false;
          
          if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
            // To jest zahashowane hasło - użyj bcrypt
            isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);
            console.log('Using bcrypt comparison');
          } else {
            // To jest zwykły tekst - porównaj bezpośrednio (tylko dla testów!)
            isPasswordValid = credentials.password === user.password_hash;
            console.log('Using plain text comparison');
          }

          if (!isPasswordValid) {
            console.log('Invalid password');
            return null;
          }

          console.log('Authentication successful');
          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
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
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development', // Włącz debug logi
};
