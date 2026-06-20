import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend';

export async function GET(req: NextRequest, props: { params: Promise<{ jobId: string }> }) {
  const params = await props.params;
  try {
    const authHeader = req.headers.get('Authorization');
    const jobId = params.jobId;

    const djResponse = await fetch(`${BACKEND_URL}/api/jobs/generate/${jobId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    const data = await djResponse.json();
    if (!djResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch job status' }, { status: djResponse.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('BFF Get Job Status Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
