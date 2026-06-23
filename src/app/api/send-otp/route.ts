import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ message: 'email and otp are required' }, { status: 400 });
    }

    // Fetch SMTP config from Django server-side (password never exposed to browser)
    let config: any = null;
    try {
      const configRes = await fetch(`${BACKEND_URL}/api/smtp-config/`, {
        cache: 'no-store'
      });
      if (configRes.ok) {
        config = await configRes.json();
      }
    } catch (fetchErr) {
      console.error('Failed to fetch SMTP config:', fetchErr);
    }

    if (!config || !config.configured) {
      return NextResponse.json({ message: 'Global SMTP not configured. Ask admin to set SMTP settings.' }, { status: 500 });
    }

    const port = parseInt(config.port) || 465;
    const isSecure = port === 465;

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: port,
      secure: isSecure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 8000,
      socketTimeout: 8000,
      greetingTimeout: 8000,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        servername: config.host
      }
    });

    const senderName = config.senderName || 'OutreachPro';
    const html = `
      <div style="font-family:sans-serif; padding:20px; color:#1e293b;">
        <h2 style="color:#10b981;">Email Verification</h2>
        <p>Your verification code is:</p>
        <p style="font-size:32px; font-weight:bold; color:#10b981; letter-spacing:6px; margin:20px 0;">${otp}</p>
        <p style="font-size:12px; color:#64748b;">This code will expire in 2 minutes. Do not share it with anyone.</p>
      </div>
    `;

    try {
      await Promise.race([
        transporter.sendMail({
          from: `"${senderName}" <${config.user}>`,
          to: email,
          subject: `OutreachPro Verification Code: ${otp}`,
          text: `Your OutreachPro verification code is: ${otp}\nThis code will expire in 2 minutes.`,
          html
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Email send timed out after 8s')), 8000)
        )
      ]);
    } catch (sendErr: any) {
      // Try fallback port
      const fallbackPort = port === 465 ? 587 : 465;
      const fallbackTransporter = nodemailer.createTransport({
        host: config.host,
        port: fallbackPort,
        secure: fallbackPort === 465,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 8000,
        socketTimeout: 8000,
        tls: { rejectUnauthorized: false, servername: config.host }
      });

      await fallbackTransporter.sendMail({
        from: `"${senderName}" <${config.user}>`,
        to: email,
        subject: `OutreachPro Verification Code: ${otp}`,
        text: `Your OutreachPro verification code is: ${otp}\nThis code will expire in 2 minutes.`,
        html
      });
    }

    return NextResponse.json({ message: 'OTP sent' });
  } catch (error: any) {
    console.error('OTP send error:', error);
    return NextResponse.json(
      { message: `Failed to send verification code: ${error.message}` },
      { status: 500 }
    );
  }
}
