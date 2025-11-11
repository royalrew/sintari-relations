import { NextRequest, NextResponse } from 'next/server';
import { createUser, authenticateUser, createResetToken, resetPassword, getUserByEmail, updateUser } from '@/lib/auth';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, password, name, token, newPassword, consent } = body;

    switch (action) {
      case 'register': {
        if (!email || !password) {
          return NextResponse.json({ error: 'E-post och lösenord krävs' }, { status: 400 });
        }

        try {
          const user = await createUser(email, password, name);
          
          // Spara samtycke direkt om det finns
          if (consent) {
            await updateUser(user.id, {
              consent: {
                termsAccepted: consent.termsAccepted || false,
                termsAcceptedAt: consent.termsAccepted ? new Date().toISOString() : undefined,
                privacyAccepted: consent.privacyAccepted || false,
                privacyAcceptedAt: consent.privacyAccepted ? new Date().toISOString() : undefined,
                marketingConsent: consent.marketingConsent || false,
              },
            });
          }
          
          const cookieStore = await cookies();
          const sessionToken = crypto.randomBytes(32).toString('hex');
          
          cookieStore.set('session_token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 dagar
          });
          
          cookieStore.set('user_id', user.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
          });
          
          return NextResponse.json({ 
            success: true, 
            user: { id: user.id, email: user.email, name: user.name } 
          });
        } catch (error: any) {
          return NextResponse.json({ error: error.message || 'Registrering misslyckades' }, { status: 400 });
        }
      }

      case 'login': {
        if (!email || !password) {
          return NextResponse.json({ error: 'E-post och lösenord krävs' }, { status: 400 });
        }

        const user = await authenticateUser(email, password);
        if (!user) {
          return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 });
        }

        const cookieStore = await cookies();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        cookieStore.set('session_token', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 dagar
        });
        
        cookieStore.set('user_id', user.id, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
        });
        
        return NextResponse.json({ 
          success: true, 
          user: { id: user.id, email: user.email, name: user.name, subscription: user.subscription } 
        });
      }

      case 'logout': {
        const cookieStore = await cookies();
        cookieStore.delete('session_token');
        cookieStore.delete('user_id');
        return NextResponse.json({ success: true });
      }

      case 'forgot-password': {
        if (!email) {
          return NextResponse.json({ error: 'E-post krävs' }, { status: 400 });
        }

        const resetToken = await createResetToken(email);
        if (!resetToken) {
          // Returnera success även om användaren inte finns (säkerhet)
          return NextResponse.json({ success: true, message: 'Om e-posten finns kommer ett återställningsmeddelande att skickas' });
        }

        // I produktion: skicka e-post här
        console.log(`Reset token for ${email}: ${resetToken}`);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Om e-posten finns kommer ett återställningsmeddelande att skickas',
          // I utveckling: returnera token för testning
          ...(process.env.NODE_ENV === 'development' && { token: resetToken })
        });
      }

      case 'reset-password': {
        if (!token || !newPassword) {
          return NextResponse.json({ error: 'Token och nytt lösenord krävs' }, { status: 400 });
        }

        if (newPassword.length < 8) {
          return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken' }, { status: 400 });
        }

        const success = await resetPassword(token, newPassword);
        if (!success) {
          return NextResponse.json({ error: 'Ogiltig eller utgången token' }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'Lösenordet har återställts' });
      }

      default:
        return NextResponse.json({ error: 'Ogiltig åtgärd' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth API error:', error);
    return NextResponse.json({ error: 'Ett fel uppstod' }, { status: 500 });
  }
}

