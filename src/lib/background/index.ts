// BackgroundCheckProvider interface + factory
// To swap in a real provider (e.g. TransUnion SmartMove), set:
//   BACKGROUND_CHECK_PROVIDER=smartmove   in .env.local
// and implement SmartMoveProvider in ./smartmove.ts.
// Default is 'mock' — simulates outcomes in dev via query params.
//
// Locked decision: this screens identity + credit score ONLY. No criminal or
// eviction data is requested, returned, or stored anywhere in this interface.

export type BackgroundCheckOutcome = 'pass' | 'no_match' | 'inconclusive' | 'technical_failure';

export type BackgroundCheckResult = {
  outcome: BackgroundCheckOutcome;
  vendorRef: string;
  creditScore?: number;   // present only when outcome === 'pass'
};

export interface BackgroundCheckProvider {
  /** Kick off a check. SSN is passed through to the vendor only — never stored. */
  startCheck(params: {
    seekerId: string;
    legalName: string;
    dob: string;
    ssn: string;
  }): Promise<{ vendorRef: string }>;

  /** Process a completed check (called from webhook or mock callback). */
  processResult(vendorRef: string): Promise<BackgroundCheckResult>;
}

// Factory — reads BACKGROUND_CHECK_PROVIDER env var; defaults to mock.
export async function getBackgroundProvider(): Promise<BackgroundCheckProvider> {
  const provider = process.env.BACKGROUND_CHECK_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    const { MockBackgroundProvider } = await import('./mock');
    return new MockBackgroundProvider();
  }
  // Future: if (provider === 'smartmove') { ... }
  throw new Error(`Unknown BACKGROUND_CHECK_PROVIDER: ${provider}`);
}
