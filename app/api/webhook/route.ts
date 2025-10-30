import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Dynamic import to avoid build issues
let Stripe: any;
let stripe: any;

async function getStripe() {
  if (!stripe) {
    if (!Stripe) {
      Stripe = (await import('stripe')).default;
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });
  }
  return stripe;
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;

  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment succeeded:', {
        sessionId: session.id,
        customerEmail: session.customer_details?.email,
        metadata: session.metadata,
        amountTotal: session.amount_total,
      });

      // Here you would typically:
      // 1. Save payment record to database
      // 2. Trigger relation analysis via email/webhook
      // 3. Send confirmation email
      // 4. Update user permissions/access

      try {
        // Example: Trigger relation analysis
        const { person1, person2 } = session.metadata || {};
        if (person1 && person2) {
          // You could call your analyzeRelation function here
          console.log(`Payment completed for analysis: ${person1} & ${person2}`);
        }
      } catch (error) {
        console.error('Error processing payment:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
