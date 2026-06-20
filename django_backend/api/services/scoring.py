# django_backend/api/services/scoring.py

def calculate_lead_score(lead, has_duplicate=False, contact_page_found=False, social_links_found=False):
    """
    Calculates the quality score of a lead based on completeness of profiles, verification,
    and extra indicators.
    Returns:
        int: The calculated lead score (clamped between 0 and 100).
    """
    score = 0

    # 1. Website exists (+20)
    if lead.website:
        score += 20

    # 2. Phone exists (+10)
    if lead.phone:
        score += 10

    # 3. Verified email exists (+30)
    if lead.email and lead.email_status == 'verified':
        score += 30

    # 4. Email confidence >= 75 (+15)
    if lead.email_confidence >= 75:
        score += 15

    # 5. Rating >= 4.0 (+10)
    try:
        if lead.rating and float(lead.rating) >= 4.0:
            score += 10
    except (ValueError, TypeError):
        pass

    # 6. Address complete (+10)
    # Simple heuristic: complete address usually contains commas separating components (street, city, state)
    if lead.address and len(lead.address.strip()) > 15:
        score += 10

    # 7. Category exact match (+10)
    # Since category is tracked, we give it a baseline match bonus if present
    if lead.category:
        score += 10

    # 8. Contact page found (+10)
    if contact_page_found:
        score += 10

    # 9. Social links found (+5)
    if social_links_found:
        score += 5

    # 10. Duplicate detected (-50)
    if has_duplicate:
        score -= 50

    # 11. Missing website AND email (-20)
    if not lead.website and not lead.email:
        score -= 20

    # Clamp score between 0 and 100
    return max(0, min(100, score))


def get_lead_quality_label(score):
    """
    Returns the quality classification label based on the lead score.
    """
    if score >= 80:
        return "Hot Lead"
    elif score >= 60:
        return "Good Lead"
    elif score >= 40:
        return "Weak Lead"
    else:
        return "Needs Enrichment"
