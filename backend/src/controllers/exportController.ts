import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import pool from '../config/db';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { google } from 'googleapis';

export const exportCSV = async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.user?.workspaceId;
  try {
    const result = await pool.query('SELECT * FROM leads WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    const leads = result.rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');

    // Simple CSV construction
    const headers = 'Name,Business Name,Email,Phone,Website,Address,LinkedIn,Source URL,Extraction Date\n';
    const rows = leads.map(l => {
      return `"${(l.name || '').replace(/"/g, '""')}",` +
             `"${(l.business_name || '').replace(/"/g, '""')}",` +
             `"${(l.email || '').replace(/"/g, '""')}",` +
             `"${(l.phone || '').replace(/"/g, '""')}",` +
             `"${(l.website || '').replace(/"/g, '""')}",` +
             `"${(l.address || '').replace(/"/g, '""')}",` +
             `"${(l.linkedin_url || '').replace(/"/g, '""')}",` +
             `"${(l.source_url || '').replace(/"/g, '""')}",` +
             `"${l.created_at.toISOString()}"`;
    }).join('\n');

    return res.send(headers + rows);
  } catch (error) {
    console.error('CSV export error:', error);
    return res.status(500).json({ error: 'Failed to generate CSV' });
  }
};

export const exportXLSX = async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.user?.workspaceId;
  try {
    const result = await pool.query('SELECT * FROM leads WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    const leads = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Business Name', key: 'business_name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Website', key: 'website', width: 25 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'LinkedIn', key: 'linkedin_url', width: 35 },
      { header: 'Source URL', key: 'source_url', width: 35 },
      { header: 'Date Extracted', key: 'created_at', width: 20 }
    ];

    leads.forEach(l => {
      worksheet.addRow({
        name: l.name,
        business_name: l.business_name,
        email: l.email,
        phone: l.phone,
        website: l.website,
        address: l.address,
        linkedin_url: l.linkedin_url,
        source_url: l.source_url,
        created_at: l.created_at.toISOString().split('T')[0]
      });
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' } // Primary branding blue
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.xlsx');

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('XLSX export error:', error);
    return res.status(500).json({ error: 'Failed to generate Excel file' });
  }
};

export const exportPDF = async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.user?.workspaceId;
  try {
    const result = await pool.query('SELECT * FROM leads WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    const leads = result.rows;

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.pdf');
    doc.pipe(res);

    // Header Design
    doc.fillColor('#1E293B').fontSize(24).font('Helvetica-Bold').text('Leadsilly Export Report', 30, 30);
    doc.fontSize(10).font('Helvetica').fillColor('#64748B').text(`Exported Date: ${new Date().toLocaleDateString()}`, 30, 60);
    doc.text(`Total Records: ${leads.length}`, 30, 75);

    // Table settings
    const tableTop = 110;
    const itemHeight = 25;
    const colWidths = [120, 150, 150, 110, 120, 100]; // Total: 750

    // Draw header background
    doc.rect(30, tableTop, 750, 20).fill('#3B82F6');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10);
    doc.text('Name', 35, tableTop + 5);
    doc.text('Business Name', 155, tableTop + 5);
    doc.text('Email', 305, tableTop + 5);
    doc.text('Phone', 455, tableTop + 5);
    doc.text('Website', 565, tableTop + 5);
    doc.text('Status', 685, tableTop + 5);

    // Draw rows
    let currentY = tableTop + 20;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');

    leads.forEach((l, idx) => {
      // Alternating row colors
      if (idx % 2 === 1) {
        doc.rect(30, currentY, 750, itemHeight).fill('#F8FAFC');
        doc.fillColor('#334155');
      }

      doc.text(l.name || 'N/A', 35, currentY + 7, { width: 115, lineBreak: false });
      doc.text(l.business_name || 'N/A', 155, currentY + 7, { width: 145, lineBreak: false });
      doc.text(l.email || 'N/A', 305, currentY + 7, { width: 145, lineBreak: false });
      doc.text(l.phone || 'N/A', 455, currentY + 7, { width: 105, lineBreak: false });
      doc.text(l.website || 'N/A', 565, currentY + 7, { width: 115, lineBreak: false });
      doc.text(l.status || 'New', 685, currentY + 7, { width: 95, lineBreak: false });

      // Draw thin bottom divider line
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(30, currentY + itemHeight).lineTo(780, currentY + itemHeight).stroke();

      currentY += itemHeight;

      // New Page Condition
      if (currentY > 520) {
        doc.addPage({ layout: 'landscape', margin: 30 });
        currentY = 40;
      }
    });

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

export const exportGoogleSheets = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const workspaceId = req.user?.workspaceId;
  const { spreadsheetId, append = false } = req.body;

  try {
    // 1. Fetch leads for sheet update
    const result = await pool.query('SELECT * FROM leads WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    const leads = result.rows;

    if (leads.length === 0) {
      return res.status(400).json({ error: 'No leads available to export' });
    }

    // 2. Fetch Google Sheets Auth Creds
    const tokenRes = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [userId, 'google']);
    if (tokenRes.rows.length === 0) {
      return res.status(401).json({ error: 'Google Account not linked. Please authenticate first.' });
    }

    const { access_token, refresh_token } = tokenRes.rows[0];

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`
    );

    oauth2Client.setCredentials({
      access_token,
      refresh_token,
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const values = leads.map(l => [
      l.name || '',
      l.business_name || '',
      l.email || '',
      l.phone || '',
      l.website || '',
      l.address || '',
      l.linkedin_url || '',
      l.source_url || '',
      l.created_at.toISOString()
    ]);

    let targetSpreadsheetId = spreadsheetId;

    if (!targetSpreadsheetId) {
      // Create a brand new spreadsheet
      const newSheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `Leadsilly Extracted Leads - ${new Date().toLocaleDateString()}` }
        }
      });
      targetSpreadsheetId = newSheet.data.spreadsheetId;

      // Write headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSpreadsheetId!,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Name', 'Business Name', 'Email', 'Phone', 'Website', 'Address', 'LinkedIn', 'Source URL', 'Date Extracted']]
        }
      });
    }

    if (append) {
      // Append leads values
      await sheets.spreadsheets.values.append({
        spreadsheetId: targetSpreadsheetId,
        range: 'Sheet1!A2',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    } else {
      // Overwrite/Rewrite values starting from row 2
      await sheets.spreadsheets.values.update({
        spreadsheetId: targetSpreadsheetId,
        range: 'Sheet1!A2',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }

    return res.json({
      success: true,
      message: append ? 'Leads appended successfully!' : 'Leads exported successfully!',
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}`
    });

  } catch (error: any) {
    console.error('Google Sheets Sync error:', error);
    return res.status(500).json({ error: error.message || 'Failed to sync to Google Sheets' });
  }
};
