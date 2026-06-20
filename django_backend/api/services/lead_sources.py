# django_backend/api/services/lead_sources.py
import requests
import json
import time
import hashlib
from datetime import datetime, timedelta
from django.utils import timezone
from api.models import SourceCache

CATEGORY_MAPPING = {
    "restaurant": {
        "osmTags": [
            ["amenity", "restaurant"],
            ["amenity", "fast_food"],
            ["shop", "bakery"]
        ],
        "keywords": ["restaurant", "food", "cafe"]
    },
    "real estate": {
        "osmTags": [
            ["office", "estate_agent"]
        ],
        "keywords": ["property", "real estate", "estate agent"]
    },
    "solar": {
        "osmTags": [
            ["shop", "energy"],
            ["office", "company"]
        ],
        "keywords": ["solar", "energy", "renewable"]
    }
}

class BaseLeadSource:
    def fetch_leads(self, category: str, location: str, limit: int = 20) -> list:
        raise NotImplementedError("Subclasses must implement fetch_leads")

class GooglePlacesSource(BaseLeadSource):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def fetch_leads(self, category: str, location: str, limit: int = 20) -> list:
        if not self.api_key:
            return []

        # Check local cache first
        cache_key = f"google_{category.lower()}_{location.lower()}_{limit}"
        cached = SourceCache.objects.filter(cache_key=cache_key, expires_at__gt=timezone.now()).first()
        if cached:
            return cached.result_json

        leads = []
        try:
            url = 'https://places.googleapis.com/v1/places:searchText'
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': self.api_key,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.location'
            }
            body = {
                'textQuery': f"{category} in {location}",
                'pageSize': min(limit, 20)
            }
            
            response = requests.post(url, headers=headers, json=body, timeout=10)
            if response.status_code == 200:
                data = response.json()
                places = data.get('places', [])
                
                for place in places:
                    loc = place.get('location', {})
                    lat = loc.get('latitude')
                    lng = loc.get('longitude')
                    
                    # Compute confidence score based on contact completeness
                    conf = 50
                    if place.get('websiteUri'): conf += 20
                    if place.get('nationalPhoneNumber'): conf += 15
                    if place.get('rating'): conf += 15

                    leads.append({
                        'businessName': place.get('displayName', {}).get('text', ''),
                        'ownerName': None,
                        'email': None,
                        'phone': place.get('nationalPhoneNumber'),
                        'website': place.get('websiteUri'),
                        'address': place.get('formattedAddress'),
                        'city': location.split(',')[0].strip(),
                        'country': location.split(',')[-1].strip(),
                        'category': category,
                        'rating': float(place.get('rating')) if place.get('rating') else None,
                        'source': 'google_places',
                        'sourceId': place.get('id'),
                        'latitude': lat,
                        'longitude': lng,
                        'confidenceScore': conf,
                        'rawData': place
                    })
                
                # Cache results for 3 days
                SourceCache.objects.update_or_create(
                    cache_key=cache_key,
                    defaults={
                        'source': 'google_places',
                        'query': json.dumps(body),
                        'location': location,
                        'result_json': leads,
                        'expires_at': timezone.now() + timedelta(days=3)
                    }
                )
        except Exception as e:
            print("Google Places API error:", e)

        return leads

class OSMOverpassSource(BaseLeadSource):
    def __init__(self):
        self.mirrors = [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter'
        ]

    def geocode_location(self, location: str) -> tuple:
        """
        Resolves location coordinates using Nominatim API, with caching.
        """
        cache_key = f"nominatim_{hashlib.md5(location.lower().strip().encode('utf-8')).hexdigest()}"
        cached = SourceCache.objects.filter(cache_key=cache_key, expires_at__gt=timezone.now()).first()
        if cached:
            return tuple(cached.result_json)

        try:
            url = f"https://nominatim.openstreetmap.org/search?q={requests.utils.quote(location)}&format=json&limit=1"
            headers = {
                'User-Agent': 'OutreachPro/2.0 (B2B Lead Gen)',
                'Accept': 'application/json'
            }
            res = requests.get(url, headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                if data:
                    bbox = data[0].get('boundingbox') # [south, north, west, east]
                    if bbox:
                        coords = (bbox[0], bbox[2], bbox[1], bbox[3]) # (s, w, n, e)
                        
                        # Cache Nominatim result for 30 days
                        SourceCache.objects.update_or_create(
                            cache_key=cache_key,
                            defaults={
                                'source': 'Nominatim',
                                'query': location,
                                'location': location,
                                'result_json': coords,
                                'expires_at': timezone.now() + timedelta(days=30)
                            }
                        )
                        return coords
        except Exception as e:
            print("Geocoding resolution failed:", e)
        return None

    def fetch_leads(self, category: str, location: str, limit: int = 20) -> list:
        # Check cache
        cache_key = f"osm_{category.lower()}_{location.lower()}_{limit}"
        cached = SourceCache.objects.filter(cache_key=cache_key, expires_at__gt=timezone.now()).first()
        if cached:
            return cached.result_json

        coords = self.geocode_location(location)
        if not coords:
            return []

        s, w, n, e = coords
        
        # Determine OSM tags mapping based on category
        cat_key = category.lower().strip()
        mapping = CATEGORY_MAPPING.get(cat_key, {
            "osmTags": [["amenity", cat_key], ["shop", cat_key], ["office", cat_key]],
            "keywords": [cat_key]
        })
        
        bbox = f"({s},{w},{n},{e})"
        tag_lines = []
        for tag in mapping["osmTags"]:
            tag_lines.append(f'node["{tag[0]}"="{tag[1]}"]{bbox};')
            tag_lines.append(f'way["{tag[0]}"="{tag[1]}"]{bbox};')
            
        # Add basic name keyword line
        keyword = mapping["keywords"][0]
        tag_lines.append(f'node["name"~"{keyword}",i]{bbox};')
        tag_lines.append(f'way["name"~"{keyword}",i]{bbox};')

        query = f"""[out:json][timeout:15];
(
  {"  ".join(tag_lines)}
);
out body;
>;
out skel qt;"""

        elements = []
        # Query mirrors with failover rotation
        for mirror in self.mirrors:
            try:
                res = requests.post(mirror, data={'data': query}, headers={'User-Agent': 'OutreachPro/2.0'}, timeout=15)
                if res.status_code == 200:
                    data = res.json()
                    elements = data.get('elements', [])
                    if elements:
                        break
            except Exception:
                continue

        leads = []
        seen = set()
        
        for el in elements:
            tags = el.get('tags')
            if not tags or 'name' not in tags:
                continue
                
            name = tags.get('name')
            if name in seen:
                continue
            seen.add(name)

            if len(leads) >= limit:
                break

            # Parse address
            addr_parts = []
            if tags.get('addr:housenumber'): addr_parts.append(tags.get('addr:housenumber'))
            if tags.get('addr:street'): addr_parts.append(tags.get('addr:street'))
            if tags.get('addr:city'): addr_parts.append(tags.get('addr:city'))
            
            addr = ", ".join(addr_parts) if addr_parts else location
            
            # Compute confidence score
            conf = 30
            if tags.get('website'): conf += 20
            if tags.get('phone') or tags.get('contact:phone'): conf += 15
            if tags.get('email'): conf += 25

            leads.append({
                'businessName': name,
                'ownerName': None,
                'email': tags.get('email'),
                'phone': tags.get('phone') or tags.get('contact:phone'),
                'website': tags.get('website') or tags.get('contact:website'),
                'address': addr,
                'city': tags.get('addr:city') or location.split(',')[0].strip(),
                'country': tags.get('addr:country') or location.split(',')[-1].strip(),
                'category': category,
                'rating': None,
                'source': 'osm',
                'sourceId': str(el.get('id')),
                'latitude': el.get('lat') or (el.get('center', {}).get('lat') if 'center' in el else None),
                'longitude': el.get('lon') or (el.get('center', {}).get('lon') if 'center' in el else None),
                'confidenceScore': conf,
                'rawData': el
            })

        # Cache results for 7 days
        SourceCache.objects.update_or_create(
            cache_key=cache_key,
            defaults={
                'source': 'osm',
                'query': query,
                'location': location,
                'result_json': leads,
                'expires_at': timezone.now() + timedelta(days=7)
            }
        )

        return leads
