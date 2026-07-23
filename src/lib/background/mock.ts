// MockBackgroundProvider — dev-only simulation.
// Controls via query param or env var:
//   ?mock=pass               → outcome: pass, credit score from MOCK_CREDIT_SCORE
//   ?mock=no_match           → outcome: no_match
//   ?mock=inconclusive       → outcome: inconclusive
//   ?mock=technical_failure  → outcome: technical_failure
//   MOCK_BG_CHECK_RESULT=pass|no_match|inconclusive|technical_failure (env fallback)
// The vendorRef encodes the desired outcome so processResult can read it back
// (same trick as MockIdentityProvider).

import type { BackgroundCheckOutcome, BackgroundCheckProvider, BackgroundCheckResult } from './index';

const OUTCOMES: BackgroundCheckOutcome[] = ['pass', 'no_match', 'inconclusive', 'technical_failure'];

export class MockBackgroundProvider implements BackgroundCheckProvider {
  async startCheck(params: {
    seekerId: string;
    legalName: string;
    dob: string;
    ssn: string;
  }): Promise<{ vendorRef: string }> {
    const requested = process.env.MOCK_BG_CHECK_RESULT ?? 'pass';
    const outcome = OUTCOMES.includes(requested as BackgroundCheckOutcome) ? requested : 'pass';
    const vendorRef = `mock_bg_${outcome}_${params.seekerId.slice(0, 8)}_${Date.now()}`;
    return { vendorRef };
  }

  async processResult(vendorRef: string): Promise<BackgroundCheckResult> {
    const outcome = OUTCOMES.find((o) => vendorRef.startsWith(`mock_bg_${o}_`)) ?? 'pass';
    if (outcome === 'pass') {
      const creditScore = Number(process.env.MOCK_CREDIT_SCORE ?? 680);
      return { outcome, vendorRef, creditScore };
    }
    return { outcome, vendorRef };
  }
}
