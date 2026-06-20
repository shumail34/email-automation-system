import { NextResponse } from 'next/server';
import dns from 'dns/promises';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ host: '', port: '465' });
    }

    const domain = email.split('@')[1].toLowerCase();

    // 1. Check well-known providers
    if (domain === 'gmail.com') return NextResponse.json({ host: 'smtp.gmail.com', port: '465' });
    if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
      return NextResponse.json({ host: 'smtp.office365.com', port: '587' });
    }
    if (domain === 'yahoo.com') return NextResponse.json({ host: 'smtp.mail.yahoo.com', port: '465' });
    if (domain === 'zoho.com' || domain === 'zoho.in') return NextResponse.json({ host: 'smtp.zoho.com', port: '465' });
    if (domain === 'icloud.com' || domain === 'me.com') return NextResponse.json({ host: 'smtp.mail.me.com', port: '587' });

    // 2. Check MX Records to detect providers
    try {
      const mxRecords = await dns.resolveMx(domain);
      const exchanges = mxRecords.map(r => r.exchange.toLowerCase());
      
      if (exchanges.some(e => e.includes('google.com') || e.includes('googlemail.com'))) {
        return NextResponse.json({ host: 'smtp.gmail.com', port: '465', provider: 'Google Workspace' });
      }
      if (exchanges.some(e => e.includes('outlook.com') || e.includes('messaging.microsoft.com'))) {
        return NextResponse.json({ host: 'smtp.office365.com', port: '587', provider: 'Microsoft 365' });
      }
      if (exchanges.some(e => e.includes('hostinger.com'))) {
        return NextResponse.json({ host: 'smtp.hostinger.com', port: '465', provider: 'Hostinger' });
      }
      if (exchanges.some(e => e.includes('zoho.com') || e.includes('zoho.eu'))) {
        return NextResponse.json({ host: 'smtp.zoho.com', port: '465', provider: 'Zoho Mail' });
      }
      if (exchanges.some(e => e.includes('secureserver.net'))) {
        return NextResponse.json({ host: 'smtpout.secureserver.net', port: '465', provider: 'GoDaddy' });
      }
      if (exchanges.some(e => e.includes('protection.outlook.com'))) {
        return NextResponse.json({ host: 'smtp.office365.com', port: '587', provider: 'Microsoft 365' });
      }
    } catch (dnsErr) {
      console.error('DNS Lookup Error:', dnsErr);
    }

    // 3. Try standard patterns
    // We can't verify these without connecting, but we return the most likely one
    return NextResponse.json({ 
      host: `smtp.${domain}`, 
      port: '465', 
      isGuess: true 
    });

  } catch (error) {
    return NextResponse.json({ host: '', port: '465' }, { status: 500 });
  }
}
