# django_backend/api/services/deduplication.py
import re
from urllib.parse import urlparse
from api.models import Lead

def normalize_text(text):
    if not text:
        return ""
    # Convert to lowercase and remove all non-alphanumeric characters
    return re.sub(r'[^a-z0-9]', '', text.lower().strip())

def extract_domain(url):
    if not url:
        return ""
    try:
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except Exception:
        return ""

def generate_duplicate_key(business_name, phone, website, city):
    """
    Creates a unique signature key from business name, phone, website, and city
    to perform strict deduplication.
    """
    norm_name = normalize_text(business_name)
    norm_phone = normalize_text(phone)
    norm_domain = extract_domain(website)
    norm_city = normalize_text(city)
    
    return f"{norm_name}_{norm_phone}_{norm_domain}_{norm_city}"

def check_duplicate_exists(user, business_name, phone=None, website=None, city=None, email=None, source_id=None, exclude_id=None):
    """
    Checks if a lead with similar traits already exists in the user's lead list.
    Deduplicates based on:
      - duplicate_key
      - non-empty email
      - non-empty phone
      - non-empty domain
      - non-empty source_id
    """
    qs = Lead.objects.filter(user=user)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)

    # 1. Match by duplicate_key
    dup_key = generate_duplicate_key(business_name, phone, website, city)
    if qs.filter(duplicate_key=dup_key).exists():
        return True

    # 2. Match by same source_id (if provided)
    if source_id and qs.filter(source_id=source_id).exists():
        return True

    # 3. Match by same email (if provided and non-empty)
    if email and email.strip():
        if qs.filter(email__iexact=email.strip()).exists():
            return True

    # 4. Match by same phone (if provided and non-empty)
    if phone and phone.strip():
        cleaned_phone = normalize_text(phone)
        if cleaned_phone:
            # We can perform a fallback search on normalized phone values if needed,
            # or exact phone match
            if qs.filter(phone=phone.strip()).exists():
                return True

    # 5. Match by same website domain (if provided and non-empty)
    domain = extract_domain(website)
    if domain:
        # Check if any existing lead shares the same website domain
        # Filter for website URLs containing the domain
        # A simple check:
        for existing in qs.filter(website__isnull=False).exclude(website=''):
            if extract_domain(existing.website) == domain:
                return True

    return False
