// Oferty „wiszące” zalogowanego handlowca (do rozliczenia: wygrana / przegrana / częściowo)
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';
import { overdueOffers } from '../../../../lib/offers-db';
import { OPEN_OFFERS_LIMIT } from '../../../../lib/offer-rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const offers = await overdueOffers(db, user.id);
    return NextResponse.json({
      offers,
      count: offers.length,
      limit: OPEN_OFFERS_LIMIT,
      blocked: !user.isManagement && offers.length >= OPEN_OFFERS_LIMIT,
    });
  } catch (error) {
    return serverError('Overdue offers error:', error);
  }
}
