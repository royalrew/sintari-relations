"use server";

export async function createCheckoutSession(data: {
  person1: string;
  person2: string;
  description: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const successUrl = `${baseUrl}/analyze?payment_success=true&session_id={CHECKOUT_SESSION_ID}&person1=${encodeURIComponent(data.person1)}&person2=${encodeURIComponent(data.person2)}&description=${encodeURIComponent(data.description)}`;
  const cancelUrl = `${baseUrl}/analyze`;

  try {
    const response = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        person1: data.person1,
        person2: data.person2,
        successUrl,
        cancelUrl,
      }),
    });

    if (!response.ok) {
      throw new Error('Checkout failed');
    }

    const result = await response.json();
    return { 
      ok: true, 
      sessionId: result.sessionId, 
      checkoutUrl: result.checkoutUrl 
    };
  } catch (error) {
    console.error('Checkout error:', error);
    return { ok: false, error: 'Failed to create checkout session' };
  }
}
