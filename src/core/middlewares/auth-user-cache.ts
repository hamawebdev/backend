import { container } from "tsyringe";
import PrismaService from "../../config/db";
import { accessGrantingSubscriptionWhere } from "../../modules/auth/jwt-payload.builder";

/**
 * The user and subscriptions each request needs, kept for a few seconds so the
 * requests of one page share a single database read. Every successful write
 * request clears it (app.ts), so logout, password changes, subscription and
 * account changes apply to the next request; changes made outside the API
 * apply within AUTH_CACHE_TTL_MS. Not used under NODE_ENV=test.
 */
const AUTH_CACHE_TTL_MS = 20000;
const userCache = new Map<number, { user: Promise<any>; expires: number }>();

export function clearAuthUserCache(): void {
  userCache.clear();
}

export function loadAuthUser(userId: number): Promise<any> {
  const prisma = container.resolve(PrismaService).getClient();
  const query = () => prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      universityId: true,
      specialtyId: true,
      currentYear: true,
      emailVerified: true,
      isActive: true,
      tokenVersion: true,
      subscriptions: {
        where: accessGrantingSubscriptionWhere(),
        select: {
          id: true,
          studyPackId: true,
          status: true,
          endDate: true,
          studyPack: { select: { name: true, type: true, yearNumber: true } }
        }
      }
    }
  });
  if (process.env.NODE_ENV === 'test') {
    return query();
  }
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && cached.expires > now) {
    return cached.user;
  }
  const user = query();
  const entry = { user, expires: now + AUTH_CACHE_TTL_MS };
  userCache.set(userId, entry);
  // A failed read is not kept
  user.catch(() => { if (userCache.get(userId) === entry) userCache.delete(userId); });
  return user;
}
