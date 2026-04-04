export interface LinkedInMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

/**
 * Fetch engagement metrics for a LinkedIn post.
 * The postUrn is the URN returned when publishing (e.g. "urn:li:share:1234567890").
 * Requires scope: r_member_social
 */
export async function fetchLinkedInPostMetrics(
  accessToken: string,
  postUrn: string
): Promise<LinkedInMetrics> {
  const encodedUrn = encodeURIComponent(postUrn);

  // Try ugcPost stats first (personal posts)
  const url = `https://api.linkedin.com/v2/socialActions/${encodedUrn}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!res.ok) {
    // Fall back to shareStatistics endpoint
    return fetchLinkedInShareStats(accessToken, postUrn);
  }

  const data = await res.json();

  return {
    impressions: 0, // Not available via socialActions
    likes: data.likesSummary?.totalLikes ?? 0,
    comments: data.commentsSummary?.totalFirstLevelComments ?? 0,
    shares: data.shareStatistics?.shareCount ?? 0,
    clicks: 0,
  };
}

async function fetchLinkedInShareStats(
  accessToken: string,
  postUrn: string
): Promise<LinkedInMetrics> {
  // Use the analytics API for impression/click data
  const encodedUrn = encodeURIComponent(postUrn);
  const url = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodedUrn}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!res.ok) {
    console.warn("[linkedin-metrics] Could not fetch share stats:", await res.text());
    return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
  }

  const data = await res.json();
  const stats = data.elements?.[0]?.totalShareStatistics ?? {};

  return {
    impressions: stats.impressionCount ?? 0,
    likes: stats.likeCount ?? 0,
    comments: stats.commentCount ?? 0,
    shares: stats.shareCount ?? 0,
    clicks: stats.clickCount ?? 0,
  };
}

/**
 * Fetch metrics for a personal ugcPost using the member social API.
 */
export async function fetchLinkedInUgcPostMetrics(
  accessToken: string,
  ugcPostUrn: string
): Promise<LinkedInMetrics> {
  const encodedUrn = encodeURIComponent(ugcPostUrn);
  const url = `https://api.linkedin.com/v2/socialMetadata/${encodedUrn}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!res.ok) {
    return fetchLinkedInPostMetrics(accessToken, ugcPostUrn);
  }

  const data = await res.json();

  return {
    impressions: data.impressionCount ?? 0,
    likes: data.likesSummary?.totalLikes ?? 0,
    comments: data.commentsSummary?.totalFirstLevelComments ?? 0,
    shares: 0,
    clicks: data.clickCount ?? 0,
  };
}
