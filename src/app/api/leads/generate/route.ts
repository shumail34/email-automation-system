import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, location, limit = 20, minRating, onlyWebsite, onlyEmail } = body;

    if (!category || !location) {
      return NextResponse.json({ error: 'Category and location are required' }, { status: 400 });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    let leads: any[] = [];
    let warning = '';

    if (googleApiKey) {
      // ── Google Places API ──
      try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleApiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount',
          },
          body: JSON.stringify({ textQuery: `${category} in ${location}`, pageSize: Math.min(limit, 20) }),
        });

        if (response.ok) {
          const data = await response.json();
          const places = data.places || [];
          if (places.length === 0) {
            warning = 'The lead generation engine returned 0 results for this query.';
          }
          for (const place of places) {
            if (minRating && (place.rating || 0) < minRating) continue;
            if (onlyWebsite && !place.websiteUri) continue;
            let score = 0;
            if (place.websiteUri) score += 20;
            if (place.nationalPhoneNumber) score += 10;
            if ((place.rating || 0) >= 4.0) score += 10;
            if (place.websiteUri && place.nationalPhoneNumber) score += 20;
            leads.push({
              business_name: place.displayName?.text || '',
              owner_name: '',
              email: '',
              phone: place.nationalPhoneNumber || '',
              website: place.websiteUri || '',
              address: place.formattedAddress || '',
              category,
              rating: place.rating ? String(place.rating) : '',
              lead_score: score,
              source: 'google_places',
            });
          }
        } else {
          const result = await fetchOsmLeads(category, location, limit);
          leads = result.leads;
          warning = result.warning || 'Primary search engine timeout, utilized backup index.';
        }
      } catch (err: any) {
        const result = await fetchOsmLeads(category, location, limit);
        leads = result.leads;
        warning = result.warning || 'Primary search engine error, utilized backup index.';
      }
    } else {
      const result = await fetchOsmLeads(category, location, limit);
      leads = result.leads;
      warning = result.warning || '';
    }

    const initialCount = leads.length;

    // Apply filters
    if (onlyWebsite) leads = leads.filter(l => l.website);
    if (onlyEmail) leads = leads.filter(l => l.email);
    if (minRating) leads = leads.filter(l => !l.rating || parseFloat(l.rating) >= minRating);

    // If leads were filtered out, warn the user
    if (initialCount > 0 && leads.length === 0) {
      if (onlyEmail && onlyWebsite) {
        warning = `Found ${initialCount} matching businesses, but all of them were filtered out because they do not have a website or email listed. Try unchecking some filters.`;
      } else if (onlyEmail) {
        warning = `Found ${initialCount} matching businesses, but all of them were filtered out because they do not have an email listed. Try unchecking "Must have email".`;
      } else if (onlyWebsite) {
        warning = `Found ${initialCount} matching businesses, but all of them were filtered out because they do not have a website listed. Try unchecking "Must have website".`;
      } else {
        warning = `Found ${initialCount} matching businesses, but they were filtered out by your current search filters.`;
      }
    }

    // Sort by score and apply limit
    leads.sort((a, b) => b.lead_score - a.lead_score);
    leads = leads.slice(0, limit);

    return NextResponse.json({ 
      leads, 
      total: leads.length, 
      source: leads[0]?.source || 'none',
      warning 
    });
  } catch (error: any) {
    console.error('Generate Leads Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function fetchOsmLeads(
  category: string,
  location: string,
  limit: number = 20
): Promise<{ leads: any[]; warning?: string }> {
  try {
    // Step 1: Geocode location via Nominatim
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'OutreachPro/1.0', 'Accept': 'application/json' } }
    );
    const geoData = await geoRes.json();
    if (!geoData?.length) {
      console.warn('[LeadGen] Geocoding returned no results for:', location);
      return { leads: [], warning: `Could not determine exact geographic coordinates for "${location}". Please try a more specific city and state.` };
    }

    const [s, n, w, e] = geoData[0].boundingbox;
    console.log('[LeadGen] BBox:', s, n, w, e);

    // Step 2: Build Overpass query
    const timeoutMs = process.env.OSM_TIMEOUT ? parseInt(process.env.OSM_TIMEOUT) : 30000;
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    const overpassQuery = buildOverpassQuery(category, s, w, n, e, timeoutSec);

    // Try multiple Overpass mirrors in order
    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter',
    ];

    let elements: any[] = [];
    let queryFailed = false;
    let queryErrorMsg = '';

    for (const mirror of mirrors) {
      try {
        console.log(`[LeadGen] Trying mirror: ${mirror}`);
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'OutreachPro/1.0',
          },
          body: 'data=' + encodeURIComponent(overpassQuery),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await res.text();
        console.log(`[LeadGen] ${mirror} → HTTP ${res.status} | preview: ${text.slice(0, 100)}`);

        if (text.trim().startsWith('{')) {
          const data = JSON.parse(text);
          if (data.remark) {
            console.warn(`[LeadGen] Mirror ${mirror} returned remark: ${data.remark}`);
            queryFailed = true;
            queryErrorMsg = data.remark;
            continue; // Try next mirror
          }
          elements = data.elements || [];
          console.log(`[LeadGen] ✓ ${elements.length} elements from ${mirror}`);
          queryFailed = false;
          break;
        }
        // Non-JSON response (HTML error) — try next mirror
        queryFailed = true;
        queryErrorMsg = `HTTP ${res.status}`;
      } catch (err: any) {
        console.warn(`[LeadGen] Mirror ${mirror} error: ${err.message}`);
        queryFailed = true;
        queryErrorMsg = err.message;
      }
    }

    if (queryFailed && elements.length === 0) {
      return { 
        leads: [], 
        warning: `The global lead index timed out due to high query volume (${queryErrorMsg}). Please try again in a few moments or use a more specific location.` 
      };
    }

    // Step 3: Convert elements to lead objects
    const seen = new Set<string>();
    const leads: any[] = [];

    for (const el of elements) {
      if (leads.length >= limit) break;
      if (!el.tags?.name) continue;
      if (seen.has(el.tags.name)) continue;
      seen.add(el.tags.name);

      let score = 0;
      if (el.tags.website) score += 20;
      if (el.tags.phone) score += 10;
      if (el.tags.website && el.tags.phone) score += 20;
      if (el.tags.email) score += 15;

      const parts: string[] = [];
      if (el.tags['addr:housenumber']) parts.push(el.tags['addr:housenumber']);
      if (el.tags['addr:street']) parts.push(el.tags['addr:street']);
      if (el.tags['addr:city']) parts.push(el.tags['addr:city']);
      if (el.tags['addr:country']) parts.push(el.tags['addr:country']);

      leads.push({
        business_name: el.tags.name,
        owner_name: '',
        email: el.tags.email || '',
        phone: el.tags.phone || el.tags['contact:phone'] || '',
        website: el.tags.website || el.tags['contact:website'] || '',
        address: parts.join(', ') || location,
        category,
        rating: '',
        lead_score: score,
        source: 'osm',
      });
    }

    console.log(`[LeadGen] Final leads count: ${leads.length}`);
    return { leads, warning: '' };
  } catch (err: any) {
    console.error('[LeadGen] Fetch Error:', err);
    return { leads: [], warning: `Failed to fetch leads: an unexpected network error occurred.` };
  }
}

function buildOverpassQuery(category: string, s: string, w: string, n: string, e: string, timeout: number = 30): string {
  const bbox = `(${s},${w},${n},${e})`;
  let cat = category.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().toLowerCase();
  
  // Basic stemming for OSM: OSM tags are singular (e.g. "plumber", "restaurant")
  if (cat.endsWith('ies')) cat = cat.slice(0, -3) + 'y';
  else if (cat.endsWith('s') && !cat.endsWith('ss')) cat = cat.slice(0, -1);

  // Use exact match (=) for categories to use OSM indexes and prevent timeouts
  const exactTags: string[][] = [
    ['amenity', cat],
    ['shop', cat],
    ['office', cat],
    ['craft', cat],
    ['tourism', cat],
    ['healthcare', cat],
  ];

  const exactNodeLines = exactTags.map(([k, v]) => `node["${k}"="${v}"]${bbox};`).join('\n  ');
  const exactWayLines  = exactTags.map(([k, v]) => `way["${k}"="${v}"]${bbox};`).join('\n  ');

  // Only use case-insensitive regex (~"...",i) for the business name
  const nameNodeLine = `node["name"~"${cat}",i]${bbox};`;
  const nameWayLine  = `way["name"~"${cat}",i]${bbox};`;

  return `[out:json][timeout:${timeout}];
(
  ${exactNodeLines}
  ${exactWayLines}
  ${nameNodeLine}
  ${nameWayLine}
);
out body;
>;
out skel qt;`;
}

