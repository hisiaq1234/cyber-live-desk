import { freshItems } from "./_brief.mjs";

export const HEADLINE_FEED_URL = "https://news.google.com/rss?hl=en-NG&gl=NG&ceid=NG:en";
export const HEADLINE_WINDOW_HOURS = 12;

export function parseHeadlineFeed(xml, { now = Date.now() } = {}) {
  return freshItems(xml, now, HEADLINE_WINDOW_HOURS).slice(0, 6);
}

export async function fetchHeadlineFeed({ fetchFn = fetch, now = Date.now() } = {}) {
  const response = await fetchFn(HEADLINE_FEED_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CyberLiveDesk/1.0; headline reader)" },
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Headline RSS returned ${response.status}.`);
  const xml = (await response.text()).slice(0, 800_000);
  return {
    headlines: parseHeadlineFeed(xml, { now }),
    fetchedAt: new Date(now).toISOString(),
    freshnessHours: HEADLINE_WINDOW_HOURS,
    region: "Nigeria",
    source: "Google News RSS",
  };
}
