# django_backend/api/services/verification.py
import re
import socket
from urllib.parse import urlparse
from api.models import EmailVerification, Lead

# Basic list of common disposable email domains
DISPOSABLE_DOMAINS = {
    'mailinator.com', 'yopmail.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com',
    'sharklasers.com', 'dispostable.com', 'getairmail.com', 'maildrop.cc', 'temp-mail.org',
    'fakeinbox.com', 'throwawaymail.com', 'burnermail.io', 'minuteinbox.com', 'trashmail.com'
}

# Role-based prefixes
ROLE_PREFIXES = {
    'admin', 'administrator', 'support', 'info', 'sales', 'hello', 'contact', 'billing',
    'jobs', 'careers', 'help', 'team', 'office', 'service', 'marketing', 'media', 'press',
    'privacy', 'security', 'abuse', 'webmaster', 'hostmaster', 'postmaster'
}

def check_syntax(email):
    # Regex syntax check
    pattern = r'^([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)$'
    return bool(re.match(pattern, email))

def check_mx_records(domain):
    """
    Checks if the domain has valid mail exchanger (MX) records.
    Uses dnspython if installed, otherwise falls back to socket getaddrinfo
    to check general domain resolution.
    """
    try:
        import dns.resolver
        try:
            answers = dns.resolver.resolve(domain, 'MX')
            return len(answers) > 0
        except Exception:
            return False
    except ImportError:
        # Fallback to general socket host resolution (checks if domain resolves)
        try:
            socket.gethostbyname(domain)
            return True
        except socket.gaierror:
            return False

def check_disposable(domain):
    return domain.lower() in DISPOSABLE_DOMAINS

def check_role_based(email):
    prefix = email.split('@')[0].lower().strip()
    return prefix in ROLE_PREFIXES

def verify_lead_email(lead):
    """
    Runs the email verification pipeline on a Lead object.
    Saves and returns the EmailVerification record and updates Lead statuses.
    """
    if not lead.email:
        lead.email_status = 'unknown'
        lead.email_confidence = 0
        lead.verification_status = 'completed'
        lead.save(update_fields=['email_status', 'email_confidence', 'verification_status'])
        return None

    email = lead.email.lower().strip()
    domain = email.split('@')[1] if '@' in email else ''
    
    # 1. Syntax Check
    syntax_ok = check_syntax(email)
    if not syntax_ok:
        lead.email_status = 'invalid'
        lead.email_confidence = 0
        lead.verification_status = 'completed'
        lead.save(update_fields=['email_status', 'email_confidence', 'verification_status'])
        
        verification, _ = EmailVerification.objects.update_or_create(
            lead=lead,
            defaults={
                'email': email,
                'syntax_valid': False,
                'mx_valid': False,
                'smtp_status': 'Syntax failure',
                'disposable': False,
                'role_based': False,
                'status': 'invalid',
                'confidence': 0
            }
        )
        return verification

    # 2. Disposable Check
    is_disposable = check_disposable(domain)
    
    # 3. Role-based Check
    is_role = check_role_based(email)
    
    # 4. MX Record Check
    mx_ok = check_mx_records(domain)
    
    # 5. Website Domain Match Check
    domain_matches_website = False
    if lead.website:
        try:
            parsed_url = urlparse(lead.website)
            web_domain = parsed_url.netloc.lower()
            if web_domain.startswith('www.'):
                web_domain = web_domain[4:]
            if domain == web_domain or domain.endswith('.' + web_domain) or web_domain.endswith('.' + domain):
                domain_matches_website = True
        except Exception:
            pass

    # 6. Determine final status & confidence
    # Base confidence score
    confidence = 0
    status = 'unknown'
    smtp_status = 'MX resolution successful' if mx_ok else 'MX lookup failed'

    if not mx_ok:
        status = 'invalid'
        confidence = 10
    else:
        confidence = 50  # base score for syntax + MX valid
        if domain_matches_website:
            confidence += 25  # +25 for domain match with business website
        if not is_disposable:
            confidence += 15  # +15 for non-disposable
        if not is_role:
            confidence += 10  # +10 for personal account (non-role-based)
        else:
            confidence -= 10  # -10 for role-based account
        
        # Clamp confidence
        confidence = max(0, min(100, confidence))
        
        # Decide status based on metrics
        if is_disposable:
            status = 'risky'
        elif confidence >= 75:
            status = 'verified'
        elif confidence >= 40:
            status = 'inferred' if lead.enrichment_status == 'inferred' else 'unknown'
        else:
            status = 'risky'

    # Save details
    lead.email_status = status
    lead.email_confidence = confidence
    lead.verification_status = 'completed'
    lead.save(update_fields=['email_status', 'email_confidence', 'verification_status'])

    verification, _ = EmailVerification.objects.update_or_create(
        lead=lead,
        defaults={
            'email': email,
            'syntax_valid': True,
            'mx_valid': mx_ok,
            'smtp_status': smtp_status,
            'disposable': is_disposable,
            'role_based': is_role,
            'status': status,
            'confidence': confidence
        }
    )
    return verification
