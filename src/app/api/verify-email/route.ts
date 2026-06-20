import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns/promises';

// Regex: RFC 5322-compliant email format check
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

// Known disposable/throwaway email domains to blacklist
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'fakeinbox.com', 'yopmail.com', 'maildrop.cc', 'trashmail.com',
  'dispostable.com', 'sharklasers.com', 'guerrillamailblock.com',
  'grr.la', 'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.net', 'guerrillamail.org', 'spam4.me', 'binkmail.com',
  'bob.email', 'clrmail.com', 'emlpro.com', 'emltmp.com',
]);

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ valid: false, reason: 'No email provided' });
    }

    const trimmed = email.trim().toLowerCase();

    // Step 1: Syntax check
    if (!EMAIL_REGEX.test(trimmed)) {
      return NextResponse.json({ valid: false, reason: 'Invalid email format' });
    }

    const domain = trimmed.split('@')[1];

    // Step 2: Disposable domain blacklist
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return NextResponse.json({ valid: false, reason: 'Disposable email domain' });
    }

    // Step 3: MX Record DNS lookup — the real check
    // If the domain has no MX records, no mail server exists there.
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return NextResponse.json({ valid: false, reason: 'No mail server found for domain' });
      }
      // Sort by priority (lower = higher priority), check if the top one is valid
      const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority);
      const topMx = sortedMx[0].exchange;

      if (!topMx || topMx.trim() === '' || topMx === '.') {
        return NextResponse.json({ valid: false, reason: 'Domain has no active mail exchange' });
      }

      return NextResponse.json({
        valid: true,
        reason: 'OK',
        mx: topMx,
      });
    } catch (dnsErr: any) {
      // ENOTFOUND or ENODATA = domain doesn't exist or has no MX
      if (dnsErr.code === 'ENOTFOUND' || dnsErr.code === 'ENODATA' || dnsErr.code === 'ENOENT') {
        return NextResponse.json({ valid: false, reason: 'Domain does not exist' });
      }
      // ETIMEOUT or other transient errors — mark as "unverified" (don't block, but flag it)
      return NextResponse.json({ valid: true, reason: 'DNS timeout — unverified', unverified: true });
    }
  } catch (err) {
    return NextResponse.json({ valid: true, reason: 'Verification error — skipped', unverified: true });
  }
}
