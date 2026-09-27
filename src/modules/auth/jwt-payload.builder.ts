import { UserRole, YearLevel } from "@prisma/client";
import { TJwtPayload } from "../../types/types";

const ALL_YEAR_LEVELS: YearLevel[] = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'] as YearLevel[];

/**
 * The only subscriptions that grant access: status ACTIVE and endDate in the future.
 * Use this in Prisma queries that load a user's subscriptions for access decisions.
 */
export function accessGrantingSubscriptionWhere() {
  return { status: 'ACTIVE' as const, endDate: { gt: new Date() } };
}

export function isAccessGrantingSubscription(sub: { status?: string; endDate: Date | string }, now: Date = new Date()): boolean {
  return sub.status === 'ACTIVE' && new Date(sub.endDate) > now;
}

/**
 * The user fields and subscriptions the payload is built from. Subscriptions
 * must include studyPack { name, type, yearNumber }; any that do not grant
 * access (see isAccessGrantingSubscription) are ignored.
 */
export type JwtPayloadSource = {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  universityId?: number | null;
  specialtyId?: number | null;
  currentYear?: YearLevel | null;
  emailVerified: boolean;
  isActive: boolean;
  tokenVersion?: number;
  subscriptions?: any[];
};

/**
 * Build the auth payload (access-token claims and req.user) from the database
 * user. Shared by password login, refresh, Google login and authMiddleware so
 * every path applies the same rules.
 */
export async function buildJwtPayload(
  user: JwtPayloadSource,
  getAllStudyPackIds: () => Promise<number[]>
): Promise<TJwtPayload> {
  const now = new Date();
  const activeSubscriptions = (user.subscriptions || []).filter(
    (sub: any) => sub.studyPack && isAccessGrantingSubscription(sub, now)
  );

  // Collect primary year levels from active subscriptions for currentYear determination
  const primaryYearLevels = new Set<YearLevel>();

  const subscriptions = activeSubscriptions.map((sub: any) => {
    const endDate = new Date(sub.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let accessibleYearLevels: YearLevel[];

    if (sub.studyPack.type === 'RESIDENCY') {
      // Residency subscriptions have access to all year levels
      accessibleYearLevels = [...ALL_YEAR_LEVELS];
    } else if (sub.studyPack.type === 'YEAR' && sub.studyPack.yearNumber) {
      // Year-specific packs grant access only to their own year level
      const primaryYearLevel = sub.studyPack.yearNumber as YearLevel;
      primaryYearLevels.add(primaryYearLevel);
      accessibleYearLevels = [primaryYearLevel];
    } else {
      // Year pack without a year, or unknown pack type: all years (fallback)
      accessibleYearLevels = [...ALL_YEAR_LEVELS];
    }

    return {
      id: sub.id,
      study_pack_id: sub.studyPackId,
      pack_name: sub.studyPack.name,
      pack_type: String(sub.studyPack.type).toLowerCase(),
      year_number: sub.studyPack.yearNumber,
      end_date: endDate.toISOString(),
      days_remaining: Math.max(0, daysRemaining),
      accessible_year_levels: accessibleYearLevels
    };
  });

  // Admin and Employee users don't need subscriptions - they have full access
  const isAdminOrEmployee = user.role === UserRole.ADMIN || user.role === UserRole.EMPLOYEE;
  const hasActiveSubscription = isAdminOrEmployee || activeSubscriptions.length > 0;
  const paymentStatus = hasActiveSubscription ? 'active' : 'pending';

  let accessibleStudyPacks: number[];
  if (isAdminOrEmployee) {
    accessibleStudyPacks = await getAllStudyPackIds();
    primaryYearLevels.add('SEVEN');
  } else {
    // A pack can have more than one granting subscription (e.g. a paid renewal)
    accessibleStudyPacks = Array.from(new Set<number>(activeSubscriptions.map((sub: any) => sub.studyPackId)));
  }

  // currentYear follows the subscriptions; the user's own (editable) value is
  // only a fallback when no year subscription decides it
  const currentYear = determineCurrentYearFromSubscriptions(primaryYearLevels, user.currentYear || 'ONE');

  return {
    user_data: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      universityId: user.universityId || undefined,
      specialtyId: user.specialtyId || undefined,
      currentYear,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
    },
    subscriptions,
    payment_status: paymentStatus,
    has_active_subscription: hasActiveSubscription,
    accessible_study_packs: accessibleStudyPacks,
    token_version: user.tokenVersion ?? 0,
  };
}

/**
 * Determine the currentYear field based on active subscription year levels.
 */
function determineCurrentYearFromSubscriptions(allYearLevels: Set<YearLevel>, fallbackYear: YearLevel): YearLevel {
  if (allYearLevels.size === 0) {
    return fallbackYear;
  }

  const yearLevelsArray = Array.from(allYearLevels);
  if (yearLevelsArray.length === 1) {
    return yearLevelsArray[0];
  }

  // Several year levels: keep the user's own year if it is one of them
  if (allYearLevels.has(fallbackYear)) {
    return fallbackYear;
  }

  // Otherwise the highest year level
  const yearOrder: { [key in YearLevel]: number } = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
    'SIX': 6,
    'SEVEN': 7
  };
  return yearLevelsArray.reduce((highest, current) =>
    yearOrder[current] > yearOrder[highest] ? current : highest
  );
}
