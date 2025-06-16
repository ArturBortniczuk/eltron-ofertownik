import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export async function GET(): Promise<NextResponse> {
  try {
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf');

    if (!fs.existsSync(fontPath)) {
      throw new Error('Brakuje pliku Roboto-Regular.ttf w public/fonts');
    }

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.font(fontPath);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', (err) => { throw err; });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    doc.fontSize(32)
       .text('Zażółć gęślą jaźń', 0, pageHeight / 2 - 16, {
         width: pageWidth,
         align: 'center'
       });

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', resolve));

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="test.pdf"',
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: `Błąd generowania PDF: ${error instanceof Error ? error.message : 'Nieznany błąd'}` },
      { status: 500 }
    );
  }
}
