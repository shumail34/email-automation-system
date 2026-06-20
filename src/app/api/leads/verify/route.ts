import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json();
    const { email, leadIds } = body;

    if (!email || !leadIds || !Array.isArray(leadIds)) {
      return NextResponse.json({ error: 'Email and leadIds list are required' }, { status: 400 });
    }

    const djResponse = await fetch(`${BACKEND_URL}/api/jobs/verify/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
      body: JSON.stringify({
        user_email: email,
        lead_ids: leadIds,
      }),
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: data.error || 'Failed to start verification job' }, { status: djResponse.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Verify Job Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
export async function GET(req: NextRequest) {
  // Fetch verification job status by passing jobId query param
  try {
    const authHeader = req.headers.get('Authorization');
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId query parameter is required' }, { status: 400 });
    }

    const djResponse = await fetch(`${BACKEND_URL}/api/jobs/verify/${jobId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch verification job status' }, { status: djResponse.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Get Verify Status Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
export async function PUT(req: NextRequest) {
  // Cancel verification job
  try {
    const authHeader = req.headers.get('Authorization');
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId query parameter is required' }, { status: 400 });
    }

    const djResponse = await fetch(`${BACKEND_URL}/api/jobs/verify/${jobId}/cancel/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: 'Failed to cancel verification job' }, { status: djResponse.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Cancel Verify Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
