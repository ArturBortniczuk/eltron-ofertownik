// lib/pdf-fonts.ts
import { jsPDF } from 'jspdf';

// Funkcja pomocnicza do konwersji polskich znaków (fallback)
export function convertPolishChars(text: string): string {
  if (!text) return '';
  
  const polishChars: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  
  return text.split('').map(char => polishChars[char] || char).join('');
}

// Funkcja do bezpiecznego dodawania tekstu z polskimi znakami
export function addPolishText(
  doc: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  options: any = {}
): void {
  try {
    if (!text) text = '';
    
    // Konwertuj polskie znaki
    const convertedText = convertPolishChars(String(text));
    
    doc.text(convertedText, x, y, {
      ...options,
      charSpace: 0.3
    });
  } catch (error) {
    console.error('Error adding Polish text:', text, error);
    // Fallback - dodaj tekst bez konwersji
    doc.text(String(text || ''), x, y, options);
  }
}

// Opcjonalnie: Dodaj czcionkę obsługującą polskie znaki
export function addPolishFont(doc: jsPDF): void {
  try {
    // Tutaj można dodać Base64 czcionki z polskimi znakami
    // Na razie używamy konwersji znaków
    
    // Ustaw domyślną czcionkę
    doc.setFont('helvetica', 'normal');
  } catch (error) {
    console.error('Error setting up Polish font:', error);
  }
}
