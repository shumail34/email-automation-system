# django_backend/api/services/enrichment.py
import re
import socket
import urllib.robotparser
import requests
from urllib.parse import urlparse, urljoin
from api.models import Lead

# Regex patterns
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+')
PHONE_REGEX = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
SOCIAL_PLATFORMS = ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'x.com']

def is_safe_url(url):
    """
    Validates a URL to prevent SSRF (Server-Side Request Forgery).
    Blocks requests to internal, loopback, or private IP spaces.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
            
        hostname = parsed.hostname
        if not hostname:
            return False

        # Resolve to IP address
        ip = socket.gethostbyname(hostname)
        
        # Split IP into octets
        octets = list(map(int, ip.split('.')))
        if len(octets) != 4:
            return False
            
        # Check private ranges:
        # Loopback: 127.0.0.0/8
        # Private Class A: 10.0.0.0/8
        # Private Class B: 172.16.0.0/12
        # Private Class C: 192.168.0.0/16
        # Link-Local: 169.254.0.0/16
        # Unspecified/Broadcast: 0.0.0.0/8 or 255.255.255.255
        if octets[0] == 127:
            return False
        if octets[0] == 10:
            return False
        if octets[0] == 172 and (16 <= octets[1] <= 31):
            return False
        if octets[0] == 192 and octets[1] == 168:
            return False
        if octets[0] == 169 and octets[1] == 254:
            return False
        if octets[0] == 0:
            return False
            
        return True
    except Exception:
        return False

def can_crawl(url, user_agent='OutreachPro/2.0'):
    """
    Checks robots.txt for a website to respect crawling rules.
    Does not raise exceptions; defaults to True if inaccessible.
    """
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True

def clean_url(url):
    if not url:
        return ""
    url = url.strip()
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    return url

def crawl_and_enrich_lead(lead):
    """
    Crawls a lead's website to discover contact details:
      - emails (mailto & visible text)
      - phone numbers
      - social media profiles
      - contact page existence
    Updates the Lead object with the discovered data.
    """
    if not lead.website:
        lead.enrichment_status = 'failed'
        lead.save(update_fields=['enrichment_status'])
        return lead

    url = clean_url(lead.website)
    if not is_safe_url(url):
        lead.enrichment_status = 'failed'
        lead.save(update_fields=['enrichment_status'])
        return lead

    # Check robots.txt rules
    if not can_crawl(url):
        lead.enrichment_status = 'failed'
        lead.save(update_fields=['enrichment_status'])
        return lead

    base_domain = urlparse(url).netloc.lower()
    
    # Compile a list of candidate pages to check
    pages_to_check = [url]
    paths = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/support']
    for p in paths:
        pages_to_check.append(urljoin(url, p))

    headers = {
        'User-Agent': 'OutreachPro/2.0 (B2B Lead Enrichment Engine; Crawler)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    emails_found = set()
    phones_found = set()
    socials_found = set()
    contact_page_found = False
    
    # Crawl each page in the list (max 3 successful pages)
    successful_crawls = 0
    
    for page_url in pages_to_check:
        if successful_crawls >= 3:
            break
            
        try:
            # Prevent off-domain crawling
            if urlparse(page_url).netloc.lower() != base_domain:
                continue
                
            response = requests.get(page_url, headers=headers, timeout=5, allow_redirects=True)
            if response.status_code != 200:
                continue
                
            successful_crawls += 1
            
            # Simple check if this resolves as a contact page
            if any(term in page_url.lower() for term in ['contact', 'support']):
                contact_page_found = True
                
            text = response.text
            
            # 1. Extract mailto: links (highly confident)
            mailtos = re.findall(r'href=[\'"]mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)[\'"]', text, re.IGNORECASE)
            for email in mailtos:
                emails_found.add(email.lower().strip())
                
            # 2. Extract raw text emails
            raw_emails = EMAIL_REGEX.findall(text)
            for email in raw_emails:
                emails_found.add(email.lower().strip())
                
            # 3. Extract phone numbers
            phones = PHONE_REGEX.findall(text)
            for p in phones:
                phones_found.add(p.strip())
                
            # 4. Extract social links
            for platform in SOCIAL_PLATFORMS:
                matches = re.findall(rf'href=[\'"](https?://(?:www\.)?{platform}/[a-zA-Z0-9_.-]+)[\'"]', text, re.IGNORECASE)
                for link in matches:
                    socials_found.add(link.strip())
                    
        except Exception:
            continue

    # Filter invalid/unwanted emails
    filtered_emails = []
    excluded_prefixes = {'sentry', 'no-reply', 'noreply', 'example', 'test', 'username'}
    excluded_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.css', '.js', '.svg', '.woff', '.woff2'}
    
    for email in emails_found:
        prefix = email.split('@')[0] if '@' in email else ''
        if prefix in excluded_prefixes:
            continue
        if any(email.endswith(ext) for ext in excluded_extensions):
            continue
        if re.search(r'\d+x\.(?:png|jpg|jpeg)$', email):
            continue
        filtered_emails.append(email)

    # Update Lead Info
    updated = False
    
    if filtered_emails:
        # Prioritize info@, contact@, sales@ etc.
        priority_prefixes = ['info', 'contact', 'hello', 'support', 'sales', 'office', 'admin']
        best_email = filtered_emails[0]
        
        for email in filtered_emails:
            prefix = email.split('@')[0]
            if prefix in priority_prefixes:
                best_email = email
                break
                
        lead.email = best_email
        lead.email_status = 'verified'
        lead.email_confidence = 80
        updated = True
    else:
        # Do not use hardcoded fallback guesses as verified!
        # Infer instead, but flag it as low confidence
        inferred = f"info@{base_domain.replace('www.', '')}"
        lead.email = inferred
        lead.email_status = 'inferred'
        lead.email_confidence = 40
        updated = True

    if phones_found and not lead.phone:
        lead.phone = list(phones_found)[0]
        updated = True
        
    lead.enrichment_status = 'completed'
    
    # Recalculate lead quality score
    from api.services.scoring import calculate_lead_score
    lead.lead_score = calculate_lead_score(
        lead, 
        contact_page_found=contact_page_found, 
        social_links_found=len(socials_found) > 0
    )
    
    lead.save()
    return lead
