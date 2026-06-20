import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    // Proxy search parameters to Django leads endpoint
    const queryParams = new URLSearchParams();
    queryParams.append('email', email);
    
    const filterKeys = ['category', 'city', 'location', 'source', 'email_status', 'min_score'];
    for (const key of filterKeys) {
      const val = searchParams.get(key);
      if (val) {
        queryParams.append(key, val);
      }
    }

    const djResponse = await fetch(`${BACKEND_URL}/api/leads/?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch leads list' }, { status: djResponse.status });
    }

    // Map fields from Django backend names back to what Next.js expects if they differ.
    // In our case, Lead model fields match:
    // business_name, owner_name, email, phone, website, address, category, rating, lead_score, source, etc.
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Get Leads Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
