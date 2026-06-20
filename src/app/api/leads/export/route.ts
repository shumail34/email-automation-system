import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const { leads, format } = await req.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
    }

    // Format leads for export
    const exportData = leads.map((lead: any) => ({
      'Business Name': lead.business_name || '',
      'Owner Name': lead.owner_name || '',
      'Email': lead.email || '',
      'Phone': lead.phone || '',
      'Website': lead.website || '',
      'Address': lead.address || '',
      'Category': lead.category || '',
      'Rating': lead.rating || '',
      'Lead Score': lead.lead_score || 0,
      'Source': lead.source || '',
    }));

    if (format === 'csv') {
      const csvContent = [
        Object.keys(exportData[0]).join(','),
        ...exportData.map(row => 
          Object.values(row).map(value => 
            // Escape quotes and wrap in quotes if contains comma
            typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))
              ? `"${value.replace(/"/g, '""')}"`
              : value
          ).join(',')
        )
      ].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="leads_export.csv"',
        },
      });
    } else if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="leads_export.xlsx"',
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Export Leads Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
