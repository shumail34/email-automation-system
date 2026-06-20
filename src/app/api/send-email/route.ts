import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import dns from 'dns';

// Basic in-memory rate limiter (per server instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // max requests per minute per IP
const RATE_WINDOW = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ message: 'Too many requests. Please slow down.' }, { status: 429 });
    }

    // Payload size guard (max ~5MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      return NextResponse.json({ message: 'Payload too large.' }, { status: 413 });
    }

    const { config, to, subject, body, saveToSent, attachments, testOnly } = await request.json();

    // Input validation
    if (!config?.user || !config?.pass || !config?.host) {
      return NextResponse.json({ message: 'SMTP credentials missing' }, { status: 400 });
    }
    
    if (!testOnly) {
      if (!to || typeof to !== 'string' || !to.includes('@')) {
        return NextResponse.json({ message: 'Invalid recipient email' }, { status: 400 });
      }
      if (!subject || typeof subject !== 'string' || subject.length > 500) {
        return NextResponse.json({ message: 'Invalid subject' }, { status: 400 });
      }
      if (!body || typeof body !== 'string' || body.length > 200000) {
        return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
      }
    }
    // Prevent SMTP header injection
    const safeSubject = (subject || '').replace(/[\r\n]/g, '');
    const safeFrom = (config.senderName || '').replace(/[\r\n<>]/g, '');

    const port = parseInt(config.port) || 465;
    const isSecure = port === 465;

    // Resolve hostname to IPv4 to prevent slow IPv6 lookup timeout on Windows
    let resolvedHost = config.host || 'smtp.gmail.com';
    try {
      const dnsResult = await dns.promises.lookup(resolvedHost, { family: 4 });
      if (dnsResult && dnsResult.address) {
        resolvedHost = dnsResult.address;
      }
    } catch (dnsErr) {
      console.warn('DNS lookup failed for SMTP host, falling back to original:', dnsErr);
    }

    const transporter = nodemailer.createTransport({
      host: resolvedHost,
      port: port,
      secure: isSecure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 15000,   // increased to 15s
      socketTimeout: 15000,       // increased to 15s
      greetingTimeout: 15000,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        servername: config.host || 'smtp.gmail.com'
      },
    });

    // Verify connection with a hard 15s timeout
    try {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out. Check your gateway host.')), 15000))
      ]);
      
      // If it's just a test, return now
      if (testOnly) {
        return NextResponse.json({ message: 'SMTP connection verified successfully' });
      }
    } catch (verifyError: any) {
      return NextResponse.json({ message: 'Mail server connection failed. Please verify your transmission credentials.' }, { status: 401 });
    }

    const fingerprint = `<div style="display:none; font-size:1px; color:#ffffff; opacity:0; visibility:hidden; height:0; width:0;">${Math.random().toString(36).substring(7)}</div>`;
    const htmlBody = body; // Already HTML from ReactQuill

    const mailOptions: any = {
      from: `"${safeFrom}" <${config.user}>`,
      to,
      replyTo: config.user,
      subject: safeSubject,
      text: body.replace(/<[^>]+>/g, ''), // Strip HTML for plain text fallback
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: sans-serif; line-height: 1.6; color: #1a1a1a; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto;">
              ${body}
              ${fingerprint}
            </div>
          </body>
        </html>
      `,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att: any) => ({
        filename: att.name,
        content: att.content,
        encoding: 'base64'
      }));
    }


    // Send the email via SMTP
    const info = await transporter.sendMail(mailOptions);
    
    if (!info.accepted || info.accepted.length === 0) {
      throw new Error('Email was rejected by the server');
    }

    // Sync to Sent folder (Only for non-Gmail, as Gmail does this automatically)
    const isGmail = config.host.toLowerCase().includes('gmail');
    
    if (saveToSent && !isGmail) {
      try {
        let imapHost = config.host;
        if (imapHost.includes('smtp.')) {
          imapHost = imapHost.replace('smtp.', 'imap.');
        } else if (!imapHost.includes('imap.')) {
          const parts = imapHost.split('.');
          if (parts.length >= 2) {
            imapHost = 'imap.' + parts.slice(-2).join('.');
          }
        }

        // Resolve IMAP hostname to IPv4
        let resolvedImapHost = imapHost;
        try {
          const dnsResult = await dns.promises.lookup(imapHost, { family: 4 });
          if (dnsResult && dnsResult.address) {
            resolvedImapHost = dnsResult.address;
          }
        } catch (dnsErr) {
          console.warn('DNS lookup failed for IMAP host, falling back to original:', dnsErr);
        }

        const client = new ImapFlow({
          host: resolvedImapHost,
          port: 993,
          secure: true,
          auth: {
            user: config.user,
            pass: config.pass,
          },
          logger: false,
          connectionTimeout: 5000,
          tls: {
            rejectUnauthorized: false,
            servername: imapHost
          }
        });

        await client.connect();
        
        const list = await client.list();
        const sentFolder = list.find(f => 
          f.name.toLowerCase().includes('sent') || 
          f.path.toLowerCase().includes('sent') ||
          f.specialUse === '\\Sent'
        )?.path || 'Sent';

        const messageId = `<${Math.random().toString(36).substring(2)}@${config.user.split('@')[1]}>`;
        const date = new Date().toUTCString();

        const rawContent = [
          `From: "${config.senderName}" <${config.user}>`,
          `To: ${to}`,
          `Subject: ${subject}`,
          `Date: ${date}`,
          `Message-ID: ${messageId}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=utf-8`,
          '',
          `<!DOCTYPE html><html><body>${htmlBody}${fingerprint}</body></html>`
        ].join('\r\n');

        await client.append(sentFolder, rawContent);
        await client.logout();
      } catch (imapError) {
        console.error('IMAP Sync Error (Seamless):', imapError);
      }
    }

    return NextResponse.json({ message: 'Email sent successfully' });
  } catch (error: any) {
    // Don't leak internal error details to client
    return NextResponse.json(
      { message: 'Failed to send email. Please check your SMTP settings.' },
      { status: 500 }
    );
  }
}
