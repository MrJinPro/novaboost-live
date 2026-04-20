import type { SubscriptionPlanKey } from "@/lib/mock-platform";

export type StreamerSocialLinks = {
  telegram: string;
  instagram: string;
  facebook: string;
  twitter: string;
};

export type StreamerMembershipSettings = {
  paidEnabled: boolean;
  highlightedPlanKey: Exclude<SubscriptionPlanKey, "free">;
};

export const EMPTY_STREAMER_SOCIAL_LINKS: StreamerSocialLinks = {
  telegram: "",
  instagram: "",
  facebook: "",
  twitter: "",
};

export const DEFAULT_STREAMER_MEMBERSHIP_SETTINGS: StreamerMembershipSettings = {
  paidEnabled: false,
  highlightedPlanKey: "supporter",
};

export function parseStreamerSocialLinks(layout: unknown): StreamerSocialLinks {
  const socialLinks = layout && typeof layout === "object"
    ? (layout as { socialLinks?: Partial<StreamerSocialLinks> }).socialLinks
    : null;

  return {
    telegram: typeof socialLinks?.telegram === "string" ? socialLinks.telegram : "",
    instagram: typeof socialLinks?.instagram === "string" ? socialLinks.instagram : "",
    facebook: typeof socialLinks?.facebook === "string" ? socialLinks.facebook : "",
    twitter: typeof socialLinks?.twitter === "string" ? socialLinks.twitter : "",
  };
}

export function parseStreamerMembershipSettings(layout: unknown): StreamerMembershipSettings {
  const membership = layout && typeof layout === "object"
    ? (layout as { membership?: Partial<StreamerMembershipSettings> }).membership
    : null;

  const highlightedPlanKey = membership?.highlightedPlanKey === "supporter"
    || membership?.highlightedPlanKey === "superfan"
    || membership?.highlightedPlanKey === "legend"
    ? membership.highlightedPlanKey
    : DEFAULT_STREAMER_MEMBERSHIP_SETTINGS.highlightedPlanKey;

  return {
    paidEnabled: Boolean(membership?.paidEnabled),
    highlightedPlanKey,
  };
}

export function buildStreamerPageLayout(input: {
  currentLayout: Record<string, unknown>;
  socialLinks?: StreamerSocialLinks;
  membership?: StreamerMembershipSettings;
  tags?: string[];
}) {
  return {
    ...input.currentLayout,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.socialLinks ? { socialLinks: input.socialLinks } : {}),
    ...(input.membership ? { membership: input.membership } : {}),
  };
}

function trimValue(value: string) {
  return value.trim();
}

export function normalizeSocialLinks(input: StreamerSocialLinks): StreamerSocialLinks {
  return {
    telegram: trimValue(input.telegram),
    instagram: trimValue(input.instagram),
    facebook: trimValue(input.facebook),
    twitter: trimValue(input.twitter),
  };
}

export function resolveSocialLinkHref(platform: keyof StreamerSocialLinks, value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  switch (platform) {
    case "telegram":
      return `https://t.me/${trimmedValue.replace(/^@+/, "")}`;
    case "instagram":
      return `https://instagram.com/${trimmedValue.replace(/^@+/, "")}`;
    case "facebook":
      return `https://facebook.com/${trimmedValue.replace(/^@+/, "")}`;
    case "twitter":
      return `https://x.com/${trimmedValue.replace(/^@+/, "")}`;
  }
}