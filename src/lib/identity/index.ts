// IdentityProvider interface + factory
// To swap in a real provider (e.g. Stripe Identity), set:
//   IDENTITY_PROVIDER=stripe   in .env.local
// and implement StripeIdentityProvider in ./stripe.ts.
// Default is 'mock' — simulates success/failure in dev via query params.

export type VerificationResult = {
  status: 'verified' | 'failed';
  age?: number;           // derived from DOB; never store full DOB
  vendorRef?: string;     // provider inquiry/session id
  failureReason?: string;
};

export interface IdentityProvider {
  /** Kick off verification for a user. Returns a vendor ref to poll/await. */
  startVerification(userId: string): Promise<{ vendorRef: string }>;

  /** Process a completed verification (called from webhook or mock callback). */
  processResult(vendorRef: string): Promise<VerificationResult>;
}

// Factory — reads IDENTITY_PROVIDER env var; defaults to mock.
export async function getIdentityProvider(): Promise<IdentityProvider> {
  const provider = process.env.IDENTITY_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    const { MockIdentityProvider } = await import('./mock');
    return new MockIdentityProvider();
  }
  // Future: if (provider === 'stripe') { ... }
  throw new Error(`Unknown IDENTITY_PROVIDER: ${provider}`);
}
