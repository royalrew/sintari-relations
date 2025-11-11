import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromCookies, updateUser } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const user = await getCurrentUserFromCookies(cookieStore);
    
    if (!user) {
      return NextResponse.json({ error: 'Ej autentiserad' }, { status: 401 });
    }

    // Returnera användardata (utan lösenord)
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      subscription: user.subscription,
      consent: user.consent,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Ett fel uppstod' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const user = await getCurrentUserFromCookies(cookieStore);
    
    if (!user) {
      return NextResponse.json({ error: 'Ej autentiserad' }, { status: 401 });
    }

    const body = await req.json();
    const updates: any = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.consent !== undefined) {
      updates.consent = {
        ...user.consent,
        ...body.consent,
        ...(body.consent.termsAccepted && !user.consent?.termsAcceptedAt && {
          termsAcceptedAt: new Date().toISOString(),
        }),
        ...(body.consent.privacyAccepted && !user.consent?.privacyAcceptedAt && {
          privacyAcceptedAt: new Date().toISOString(),
        }),
      };
    }

    const updatedUser = await updateUser(user.id, updates);
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'Kunde inte uppdatera användare' }, { status: 500 });
    }

    return NextResponse.json({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      subscription: updatedUser.subscription,
      consent: updatedUser.consent,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Ett fel uppstod' }, { status: 500 });
  }
}

