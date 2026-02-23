// =============================================================================
// AR Module — Custom error classes
// =============================================================================

/**
 * Thrown when an imported file's date range overlaps with an existing batch.
 * Carries the existing batch ID so the API route can include it in the 409 response.
 */
export class DuplicateBatchError extends Error {
  public readonly existingBatchId: string;

  constructor(existingBatchId: string) {
    super(`Arquivo com mesmo período já importado (batch ${existingBatchId})`);
    this.name = "DuplicateBatchError";
    this.existingBatchId = existingBatchId;
  }
}
