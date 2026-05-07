export async function searchProductImage(query: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error('SERPAPI_KEY is not configured');
    return null;
  }

  // Sanitize query for better results
  const cleanQuery = query.replace(/\[.*?\]/g, '').trim();
  
  const params = new URLSearchParams({
    q: cleanQuery,
    tbm: 'isch',
    ijn: '0',
    api_key: apiKey,
    safe: 'active',
    num: '5' // Get a few results so we can pick a good one
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`SerpApi error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      // Filter out some common non-product domains if needed
      // For now, just take the first one
      return data.images_results[0].original;
    }

    return null;
  } catch (error) {
    console.error(`Error searching image for "${query}":`, error);
    return null;
  }
}
