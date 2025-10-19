import { NextRequest, NextResponse } from 'next/server';

// Dynamic import to avoid build issues
let Stripe: any;
let stripe: any;

async function getStripe() {
  if (!stripe) {
    if (!Stripe) {
      Stripe = (await import('stripe')).default;
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia',
    });
  }
  return stripe;
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { person1, person2, successUrl, cancelUrl } = body;

    if (!successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: 'Missing successUrl or cancelUrl' },
        { status: 400 }
      );
    }

    // Use Price ID if available, otherwise fallback to price_data
    const priceId = process.env.STRIPE_PRICE_ID;
    const stripe = await getStripe();
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: priceId ? [
        {
          price: priceId,
          quantity: 1,
        },
      ] : [
        {
          price_data: {
            currency: 'sek',
            product_data: {
              name: 'Sintari Relation Analysis',
              description: 'AI-powered relation analysis with PDF export',
            },
            unit_amount: 4900, // 49 SEK
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        person1: person1 || '',
        person2: person2 || '',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ 
      sessionId: session.id,
      checkoutUrl: session.url 
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
