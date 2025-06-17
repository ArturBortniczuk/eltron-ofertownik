// app/types/next-auth.d.ts - ROZSZERZONA WERSJA
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      // Dodatkowe pola dla Grupy Eltron
      firstName?: string | null
      lastName?: string | null
      role?: string | null
      marketRegion?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    // Dodatkowe pola
    firstName?: string | null
    lastName?: string | null
    role?: string | null
    marketRegion?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    marketRegion?: string
    firstName?: string
    lastName?: string
  }
}
