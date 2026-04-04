export interface TwitterMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number; // retweets
  clicks: number;
  videoViews: number;
}

/**
 * Fetch public metrics for an X/Twitter post.
 * Uses the v2 API with public_metrics field.
 * Requires scope: tweet.read (already granted in our OAuth flow)
 */
export async function fetchTwitterPostMetrics(
  accessToken: string,
  tweetId: string
): Promise<TwitterMetrics> {
  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    // non_public_metrics may require OAuth 1.0a; fall back to public_metrics
    return fetchTwitterPublicMetrics(accessToken, tweetId);
  }

  const data = await res.json();
  const tweet = data.data;

  const pub = tweet?.public_metrics ?? {};
  const nonPub = tweet?.non_public_metrics ?? {};
  const organic = tweet?.organic_metrics ?? {};

  return {
    impressions: nonPub.impression_count ?? organic.impression_count ?? pub.impression_count ?? 0,
    likes: pub.like_count ?? 0,
    comments: pub.reply_count ?? 0,
    shares: pub.retweet_count ?? 0,
    clicks: nonPub.url_link_clicks ?? organic.url_link_clicks ?? 0,
    videoViews: nonPub.video_view_count ?? organic.video_view_count ?? 0,
  };
}

async function fetchTwitterPublicMetrics(
  accessToken: string,
  tweetId: string
): Promise<TwitterMetrics> {
  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    console.warn("[twitter-metrics] Could not fetch metrics for tweet", tweetId, await res.text());
    return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 };
  }

  const data = await res.json();
  const pub = data.data?.public_metrics ?? {};

  return {
    impressions: pub.impression_count ?? 0,
    likes: pub.like_count ?? 0,
    comments: pub.reply_count ?? 0,
    shares: pub.retweet_count ?? 0,
    clicks: 0,
    videoViews: 0,
  };
}
