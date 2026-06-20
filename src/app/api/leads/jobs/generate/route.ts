import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json();
    const { email, category, location, limit = 20, sourceMode = 'auto' } = body;

    if (!email || !category || !location) {
      return NextResponse.json({ error: 'Email, category, and location are required' }, { status: 400 });
    }

    const djResponse = await fetch(`${BACKEND_URL}/api/jobs/generate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
      body: JSON.stringify({
        user_email: email,
        category,
        location,
        requested_limit: limit,
        source_mode: sourceMode,
      }),
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: data.user_email || data.error || 'Failed to start generation job' }, { status: djResponse.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Generate Job Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
