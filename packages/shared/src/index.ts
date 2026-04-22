import { z } from "zod";

export const UserRoleSchema = z.enum(["fan", "athlete", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** `GET /me` — current authenticated user. */
export const UserMeSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable().optional(),
  role: UserRoleSchema,
  socialProvider: z.string().nullable().optional(),
  zkloginSubject: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
  /** API: string (serde-human-readable) or legacy tuple from older `time` builds. */
  createdAt: z.union([z.string(), z.array(z.unknown())]).optional(),
});
export type UserMe = z.infer<typeof UserMeSchema>;

export const AthleteProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  bio: z.string().nullable(),
  sport: z.string().nullable(),
  verified: z.boolean(),
  avatarUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  verificationRequestedAt: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  socialLinks: z.record(z.string(), z.unknown()).nullable().optional(),
  verificationMetadata: z.unknown().optional(),
  createdAt: z.union([z.string(), z.array(z.unknown())]).optional(),
});
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;

export const AthleteListItemSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  sport: z.string().nullable(),
  bio: z.string().nullable(),
  verified: z.boolean(),
  avatarUrl: z.string().nullable().optional(),
  followerCount: z.coerce.number().int().nonnegative(),
});
export type AthleteListItem = z.infer<typeof AthleteListItemSchema>;

export const AthleteStatsSchema = z.object({
  userId: z.string().uuid(),
  followerCount: z.coerce.number().int().nonnegative(),
  activeSubscriberCount: z.coerce.number().int().nonnegative(),
  contentCount: z.coerce.number().int().nonnegative(),
  isFollowing: z.boolean(),
  activeSubscriptionTierIds: z.array(z.string().uuid()),
});
export type AthleteStats = z.infer<typeof AthleteStatsSchema>;

export const SubscriptionTierSchema = z.object({
  id: z.string().uuid(),
  athleteUserId: z.string().uuid(),
  name: z.string(),
  priceMist: z.coerce.number(),
  billingPeriodDays: z.number().int().positive(),
  perksJson: z.unknown().optional(),
  onchainTierId: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.array(z.unknown())]).optional(),
});
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const FanSubscriptionSchema = z.object({
  id: z.string().uuid(),
  tierId: z.string().uuid(),
  tierName: z.string().optional(),
  athleteUserId: z.string().uuid().optional(),
  athleteDisplayName: z.string().nullable().optional(),
  validUntil: z.string(),
  status: z.enum(["active", "expired", "cancelled"]),
});
export type FanSubscription = z.infer<typeof FanSubscriptionSchema>;

export const LiveSessionSchema = z.object({
  id: z.string().uuid(),
  athleteUserId: z.string().uuid(),
  title: z.string(),
  startsAt: z.union([z.string(), z.array(z.unknown())]),
  providerRoomId: z.string().nullable().optional(),
  visibilityTierId: z.string().uuid().nullable().optional(),
  status: z.string().default("scheduled"),
  endedAt: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.array(z.unknown())]).optional(),
});
export type LiveSession = z.infer<typeof LiveSessionSchema>;

export const ContentTypeSchema = z.enum(["post", "clip", "file", "replay"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const AccessRuleSchema = z.enum(["free", "tier", "live_replay"]);
export type AccessRule = z.infer<typeof AccessRuleSchema>;

export const ContentItemSchema = z.object({
  id: z.string().uuid(),
  athleteUserId: z.string().uuid(),
  type: ContentTypeSchema,
  title: z.string(),
  mediaUrl: z.string().nullable(),
  accessRule: AccessRuleSchema,
  requiredTierId: z.string().uuid().nullable(),
  createdAt: z.union([z.string(), z.array(z.unknown())]),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  payloadJson: z.unknown(),
  readAt: z.string().nullable().optional(),
  deliveryState: z.string(),
  createdAt: z.union([z.string(), z.array(z.unknown())]),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function parseAthleteProfile(data: unknown): AthleteProfile | null {
  const r = AthleteProfileSchema.safeParse(data);
  return r.success ? r.data : null;
}

export function parseContentItems(data: unknown): ContentItem[] | null {
  const r = z.array(ContentItemSchema).safeParse(data);
  return r.success ? r.data : null;
}
