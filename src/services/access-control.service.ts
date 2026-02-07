import { YearLevel, PackType } from '@prisma/client';
import { TJwtPayload } from '../types/types';

export class AccessControlService {
  // No longer needs database access - all data comes from JWT token
  constructor() {
    // Removed Prisma client dependency for performance optimization
  }

  /**
   * Check if user has residency access (can access all year levels)
   * Residency access is granted if:
   * - pack_type is 'RESIDENCY' OR
   * - yearNumber is 'SEVEN' (Year 7 = Residency year)
   */
  hasResidencyAccess(user: TJwtPayload): boolean {
    if (!user.subscriptions || !Array.isArray(user.subscriptions)) {
      return false;
    }
    return user.subscriptions.some((sub: any) => {
      const packType = String(sub.pack_type || '').toUpperCase();
      const yearNumber = String(sub.year_number || sub.yearNumber || '').toUpperCase();
      return packType === 'RESIDENCY' || yearNumber === 'SEVEN';
    });
  }

  /**
   * Get accessible year levels for a user based on their subscription type
   * OPTIMIZED: Uses only JWT token data, no database queries
   */
  getAccessibleYearLevels(user: TJwtPayload): YearLevel[] {
    // Admin and Employee users have access to all year levels
    if (user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE') {
      return Object.values(YearLevel);
    }

    // Users with residency subscription have access to all year levels
    if (this.hasResidencyAccess(user)) {
      return Object.values(YearLevel);
    }

    // Regular students: get year levels from their subscriptions (already in JWT)
    const allAccessibleYearLevels = new Set<YearLevel>();

    // Check if subscriptions exist and collect year levels from all active subscriptions
    if (user.subscriptions && Array.isArray(user.subscriptions)) {
      user.subscriptions.forEach(subscription => {
        if (subscription.accessible_year_levels && Array.isArray(subscription.accessible_year_levels)) {
          subscription.accessible_year_levels.forEach(yearLevel => {
            allAccessibleYearLevels.add(yearLevel);
          });
        }
      });
    }

    const yearLevels = Array.from(allAccessibleYearLevels);

    // If no year levels found from subscriptions, fall back to user's current year
    // This ensures users can at least access content for their current year
    if (yearLevels.length === 0) {
      return [user.user_data.currentYear as YearLevel];
    }

    return yearLevels;
  }

  /**
   * Get year levels that should be used for filtering when none are explicitly provided
   * This is used by the validation middleware
   * OPTIMIZED: Uses only JWT token data, no database queries
   */
  getDefaultYearLevelsForFiltering(user: TJwtPayload): YearLevel[] {
    // For residency subscribers, don't apply any year level filtering by default
    // This allows them to access questions from all year levels
    if (this.hasResidencyAccess(user)) {
      return []; // Empty array means no year level filtering
    }

    // For regular students, get their accessible year levels
    const accessibleYearLevels = this.getAccessibleYearLevels(user);

    // If they have access to multiple year levels, don't restrict by default
    // Let them choose which year levels they want
    if (accessibleYearLevels.length > 1) {
      return []; // No default filtering, let user choose
    }

    // If they only have access to one year level, use it as default
    return accessibleYearLevels;
  }

  /**
   * Validate if user can access the specified year levels
   * OPTIMIZED: Uses only JWT token data, no database queries
   */
  validateYearLevelAccess(user: TJwtPayload, requestedYearLevels: YearLevel[]): boolean {
    const accessibleYearLevels = this.getAccessibleYearLevels(user);

    // Check if all requested year levels are accessible
    return requestedYearLevels.every(yearLevel =>
      accessibleYearLevels.includes(yearLevel)
    );
  }

  /**
   * Filter year levels to only include those accessible to the user
   * OPTIMIZED: Uses only JWT token data, no database queries
   */
  filterAccessibleYearLevels(user: TJwtPayload, yearLevels: YearLevel[]): YearLevel[] {
    const accessibleYearLevels = this.getAccessibleYearLevels(user);

    return yearLevels.filter(yearLevel =>
      accessibleYearLevels.includes(yearLevel)
    );
  }

  /**
   * Get study pack types for a user's subscriptions
   */
  getSubscriptionTypes(user: TJwtPayload): string[] {
    if (!user.subscriptions || !Array.isArray(user.subscriptions)) {
      return [];
    }
    return user.subscriptions.map((sub: any) => sub.pack_type);
  }

  /**
   * Check if user has any active subscription
   */
  hasActiveSubscription(user: TJwtPayload): boolean {
    return user.has_active_subscription;
  }

  /**
   * Get user's accessible study pack IDs
   */
  getAccessibleStudyPacks(user: TJwtPayload): number[] {
    return user.accessible_study_packs;
  }
}
