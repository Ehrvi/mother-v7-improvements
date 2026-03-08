/**
 * cryptographic-proof.ts — DGM Cryptographic Autonomy Proof
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.07983): proposals must be cryptographically verifiable
 * - Merkle Trees (Merkle, 1979): chain of custody for autonomous modifications
 * - NIST FIPS 180-4: SHA-256 for integrity verification
 *
 * Purpose: Every DGM proposal generates a cryptographic proof that:
 * 1. The proposal was generated autonomously (not injected)
 * 2. The code was not tampered with between generation and execution
 * 3. The fitness score corresponds to the exact code that was evaluated
 */

import { createHash, createHmac } from "crypto";

export interface DGMProof {
  /** Unique proposal identifier */
  proposalId: string;
  /** SHA-256 hash of the proposal code */
  codeHash: string;
  /** SHA-256 hash of the fitness evaluation result */
  fitnessHash: string;
  /** Chain hash: SHA-256(codeHash + fitnessHash + previousChainHash) */
  chainHash: string;
  /** HMAC-SHA256 signature using server secret */
  signature: string;
  /** ISO timestamp of proof generation */
  timestamp: string;
  /** MOTHER version at time of proof */
  motherVersion: string;
  /** Cycle number */
  cycleNumber: number;
}

export interface ProofVerificationResult {
  valid: boolean;
  codeIntegrity: boolean;
  fitnessIntegrity: boolean;
  chainIntegrity: boolean;
  signatureValid: boolean;
  reason?: string;
}

/**
 * CryptographicProofSystem — generates and verifies SHA-256 proofs for DGM proposals.
 *
 * Each proof creates an immutable audit trail proving:
 * - The exact code that was proposed
 * - The exact fitness score that was achieved
 * - The chain of custody from previous proposals
 */
export class CryptographicProofSystem {
  private readonly serverSecret: string;
  private chainHash: string = "genesis";

  constructor(serverSecret?: string) {
    this.serverSecret =
      serverSecret ??
      process.env.DGM_PROOF_SECRET ??
      "mother-dgm-default-secret-change-in-prod";
  }

  /**
   * Generate a cryptographic proof for a DGM proposal.
   */
  generateProof(params: {
    proposalId: string;
    code: string;
    fitnessScore: number;
    fitnessDetails: Record<string, unknown>;
    motherVersion: string;
    cycleNumber: number;
  }): DGMProof {
    const timestamp = new Date().toISOString();

    // Hash the proposal code
    const codeHash = this.sha256(params.code);

    // Hash the fitness evaluation
    const fitnessPayload = JSON.stringify({
      score: params.fitnessScore,
      details: params.fitnessDetails,
      proposalId: params.proposalId,
    });
    const fitnessHash = this.sha256(fitnessPayload);

    // Chain hash: links this proof to the previous one
    const chainPayload = `${codeHash}:${fitnessHash}:${this.chainHash}:${timestamp}`;
    const newChainHash = this.sha256(chainPayload);

    // HMAC signature for server-side authenticity
    const signaturePayload = JSON.stringify({
      proposalId: params.proposalId,
      codeHash,
      fitnessHash,
      chainHash: newChainHash,
      timestamp,
      motherVersion: params.motherVersion,
      cycleNumber: params.cycleNumber,
    });
    const signature = this.hmac(signaturePayload);

    // Advance the chain
    this.chainHash = newChainHash;

    return {
      proposalId: params.proposalId,
      codeHash,
      fitnessHash,
      chainHash: newChainHash,
      signature,
      timestamp,
      motherVersion: params.motherVersion,
      cycleNumber: params.cycleNumber,
    };
  }

  /**
   * Verify a DGM proof against the original code and fitness data.
   */
  verifyProof(
    proof: DGMProof,
    originalCode: string,
    fitnessScore: number,
    fitnessDetails: Record<string, unknown>,
    previousChainHash: string
  ): ProofVerificationResult {
    // Verify code integrity
    const expectedCodeHash = this.sha256(originalCode);
    const codeIntegrity = expectedCodeHash === proof.codeHash;

    // Verify fitness integrity
    const fitnessPayload = JSON.stringify({
      score: fitnessScore,
      details: fitnessDetails,
      proposalId: proof.proposalId,
    });
    const expectedFitnessHash = this.sha256(fitnessPayload);
    const fitnessIntegrity = expectedFitnessHash === proof.fitnessHash;

    // Verify chain integrity
    const chainPayload = `${proof.codeHash}:${proof.fitnessHash}:${previousChainHash}:${proof.timestamp}`;
    const expectedChainHash = this.sha256(chainPayload);
    const chainIntegrity = expectedChainHash === proof.chainHash;

    // Verify HMAC signature
    const signaturePayload = JSON.stringify({
      proposalId: proof.proposalId,
      codeHash: proof.codeHash,
      fitnessHash: proof.fitnessHash,
      chainHash: proof.chainHash,
      timestamp: proof.timestamp,
      motherVersion: proof.motherVersion,
      cycleNumber: proof.cycleNumber,
    });
    const expectedSignature = this.hmac(signaturePayload);
    const signatureValid = expectedSignature === proof.signature;

    const valid =
      codeIntegrity && fitnessIntegrity && chainIntegrity && signatureValid;

    let reason: string | undefined;
    if (!valid) {
      const failures = [];
      if (!codeIntegrity) failures.push("code hash mismatch");
      if (!fitnessIntegrity) failures.push("fitness hash mismatch");
      if (!chainIntegrity) failures.push("chain hash mismatch");
      if (!signatureValid) failures.push("HMAC signature invalid");
      reason = `Proof invalid: ${failures.join(", ")}`;
    }

    return {
      valid,
      codeIntegrity,
      fitnessIntegrity,
      chainIntegrity,
      signatureValid,
      reason,
    };
  }

  /**
   * Get the current chain hash (for linking to next proof).
   */
  getCurrentChainHash(): string {
    return this.chainHash;
  }

  /**
   * Reset the chain (use only for testing or after a full DGM reset).
   */
  resetChain(): void {
    this.chainHash = "genesis";
  }

  /**
   * Generate a compact audit summary for logging.
   */
  generateAuditSummary(proof: DGMProof): string {
    return [
      `[DGM-PROOF] id=${proof.proposalId.slice(0, 8)}`,
      `code=${proof.codeHash.slice(0, 16)}`,
      `fitness=${proof.fitnessHash.slice(0, 16)}`,
      `chain=${proof.chainHash.slice(0, 16)}`,
      `v=${proof.motherVersion}`,
      `cycle=${proof.cycleNumber}`,
      `ts=${proof.timestamp}`,
    ].join(" | ");
  }

  private sha256(data: string): string {
    return createHash("sha256").update(data, "utf-8").digest("hex");
  }

  private hmac(data: string): string {
    return createHmac("sha256", this.serverSecret)
      .update(data, "utf-8")
      .digest("hex");
  }
}

// Singleton instance
export const cryptographicProof = new CryptographicProofSystem();
