import { Prisma } from "@prisma/client";
import { accessGrantingSubscriptionWhere, isAccessGrantingSubscription } from "../auth/jwt-payload.builder";

/**
 * Status of a user on the admin users page:
 * - ACTIVE: the account is enabled and at least one subscription grants access
 *   (status ACTIVE and end date not passed, the same rule as content access)
 * - DEACTIVATED: an admin deactivated the account, whatever its subscriptions
 * - NON_ACTIVE: everyone else (no subscription, or only pending, expired,
 *   cancelled or lapsed ones)
 * Deactivated users count as non-active, so active + non-active = every user.
 */
export type UserStatus = 'ACTIVE' | 'NON_ACTIVE' | 'DEACTIVATED';

/** Values of the `status` filter of GET /admin/users; non_active includes deactivated */
export const USER_STATUS_FILTERS = ['active', 'non_active', 'deactivated'] as const;
export type UserStatusFilter = typeof USER_STATUS_FILTERS[number];

export function isUserStatusFilter(value: unknown): value is UserStatusFilter {
  return (USER_STATUS_FILTERS as readonly unknown[]).includes(value);
}

export function userStatus(
  user: { isActive: boolean; subscriptions: { status: string; endDate: Date }[] },
  now: Date
): UserStatus {
  if (!user.isActive) return 'DEACTIVATED';
  return user.subscriptions.some(sub => isAccessGrantingSubscription(sub, now)) ? 'ACTIVE' : 'NON_ACTIVE';
}

/** Users that userStatus() puts in the group, for the same `now` */
export function userStatusWhere(filter: UserStatusFilter, now: Date): Prisma.UserWhereInput {
  const grantsAccess = accessGrantingSubscriptionWhere(now);
  switch (filter) {
    case 'active':
      return { isActive: true, subscriptions: { some: grantsAccess } };
    case 'non_active':
      return { OR: [{ isActive: false }, { subscriptions: { none: grantsAccess } }] };
    case 'deactivated':
      return { isActive: false };
  }
}
