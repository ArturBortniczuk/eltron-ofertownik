import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

// Dodaj typy dla jsPDF
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}
declare module '@react-pdf/renderer' {
  export const Document: any;
  export const Page: any;
  export const Text: any;
  export const View: any;
  export const StyleSheet: any;
  export const pdf: any;
  export const Font: any;
}
