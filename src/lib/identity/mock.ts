// MockIdentityProvider — dev-only simulation.
// Controls via query param or env var:
//   ?mock_kyc=success   → verified, age 30
//   ?mock_kyc=fail      → failed, reason: document_mismatch
//   ?mock_kyc=underage  → failed, reason: age_under_18
//   MOCK_KYC_RESULT=success|fail|underage (env fallback)
// The vendorRef encodes the desired outcome so processResult can read it back.

import type { IdentityProvider, VerificationResult } from './index';

export class MockIdentityProvider implements IdentityProvider {
  async startVerification(userId: string): Promise<{ vendorRef: string }> {
    // In dev the result is determined at process time, not at start time.
    // We issue a vendorRef that will be resolved when processResult is called.
    const outcome = process.env.MOCK_KYC_RESULT ?? 'success';
    const vendorRef = `mock_${outcome}_${userId.slice(0, 8)}_${Date.now()}`;
    return { vendorRef };
  }

  async processResult(vendorRef: string): Promise<VerificationResult> {
    // Parse outcome from the vendorRef prefix
    if (vendorRef.startsWith('mock_fail_')) {
      return { status: 'failed', failureReason: 'document_mismatch', vendorRef };
    }
    if (vendorRef.startsWith('mock_underage_')) {
      return { status: 'failed', failureReason: 'age_under_18', vendorRef };
    }
    // Default: success with age 30
    return { status: 'verified', age: 30, vendorRef };
  }
}
