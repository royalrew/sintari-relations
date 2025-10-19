"use server";

function getBaseUrl(): string {
  // Production URL from environment
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  
  // Vercel automatic URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Local development fallback
  return 'http://localhost:3000';
}

export async function createCheckoutSession(data: {
  person1: string;
  person2: string;
  description: string;
}) {
  const baseUrl = getBaseUrl();
  
  const successUrl = `${baseUrl}/analyze?payment_success=true&session_id={CHECKOUT_SESSION_ID}&person1=${encodeURIComponent(data.person1)}&person2=${encodeURIComponent(data.person2)}&description=${encodeURIComponent(data.description)}`;
  const cancelUrl = `${baseUrl}/analyze`;

  console.log('Checkout baseUrl:', baseUrl); // Debug log

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
      const errorText = await response.text();
      console.error('Checkout API error:', response.status, errorText);
      throw new Error(`Checkout API failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.checkoutUrl) {
      console.error('No checkoutUrl in response:', result);
      throw new Error('No checkout URL received from Stripe');
    }
    
    return { 
      ok: true, 
      sessionId: result.sessionId, 
      checkoutUrl: result.checkoutUrl 
    };
  } catch (error) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: `Failed to create checkout session: ${errorMessage}` };
  }
}
