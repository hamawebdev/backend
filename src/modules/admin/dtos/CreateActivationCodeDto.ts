export interface CreateActivationCodeDto {
  /**
   * Optional description for the activation code
   */
  description?: string;

  /**
   * Duration in months for the subscription
   */
  durationMonths: number;

  /**
   * Maximum number of times this code can be used
   */
  maxUses: number;

  /**
   * Expiration date for the activation code
   */
  expiresAt: Date;

  /**
   * Array of study pack IDs that this code provides access to
   */
  studyPackIds?: number[];
}
