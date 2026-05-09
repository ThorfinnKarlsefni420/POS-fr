interface SerpApiImageResult {
  original?: string;
  thumbnail?: string;
  original_width?: number;
  original_height?: number;
  source?: string;
}

interface SerpApiResponse {
  images_results?: SerpApiImageResult[];
  error?: string;
}

// Domains that consistently return unusable images for product searches
const BLOCKED_DOMAINS = ['pinterest.com', 'pinterest.co.uk', 'pinimg.com'];

export async function searchProductImage(query: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error('[image-search] SERPAPI_KEY not configured');
    return null;
  }

  // Strip bracketed tags (e.g. "[500g]", "[Pack of 6]") and trim
  const cleanQuery = query.replace(/\[.*?\]/g, '').trim();

  const params = new URLSearchParams({
    engine: 'google_images',
    q: `${cleanQuery} product`,
    api_key: apiKey,
    safe: 'active',
    imgsz: 'medium', // prefer reasonably-sized product shots
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SerpApi ${response.status}: ${text}`);
    }

    const data = await response.json() as SerpApiResponse;

    if (data.error) {
      throw new Error(`SerpApi error: ${data.error}`);
    }

    const results = data.images_results ?? [];

    // Pick the first result whose URL is from an unblocked domain and has a valid http(s) URL
    for (const img of results) {
      const url = img.original;
      if (!url || !url.startsWith('http')) continue;
      const domain = img.source ?? '';
      if (BLOCKED_DOMAINS.some((d) => domain.includes(d))) continue;
      return url;
    }

    return null;
  } catch (error) {
    console.error(`[image-search] Failed for "${cleanQuery}":`, error);
    return null;
  }
}
