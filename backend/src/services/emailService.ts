import nodemailer from 'nodemailer';

// ── SMTP Transporter ─────────────────────────────────────────────────────────
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your .env file.
// Works with Gmail (use App Password), Zoho, Brevo, Resend SMTP, etc.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

// ── Send OTP Verification Email ───────────────────────────────────────────────
export const sendOTPEmail = async (
  toEmail: string,
  toName: string,
  otp: string
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Leadsilly - Email Verification</title>
    </head>
    <body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);padding:32px 40px;text-align:center;">
                  <div style="font-size:32px;margin-bottom:8px;">🔍</div>
                  <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;letter-spacing:-0.5px;">Leadsilly</h1>
                  <p style="color:#bfdbfe;font-size:13px;margin:6px 0 0;">Contact Scraper Engine</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  <h2 style="color:#f1f5f9;font-size:18px;margin:0 0 12px;font-weight:600;">
                    Verify your email address
                  </h2>
                  <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
                    Hi <strong style="color:#e2e8f0;">${toName}</strong>, thanks for signing up!<br/>
                    Enter this 6-digit code in the Leadsilly extension to verify your email:
                  </p>

                  <!-- OTP Box -->
                  <div style="background:#0f172a;border:2px solid #f59e0b;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
                    <p style="color:#94a3b8;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">Your verification code</p>
                    <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#f59e0b;font-family:monospace;">
                      ${otp}
                    </div>
                    <p style="color:#64748b;font-size:11px;margin:12px 0 0;">Expires in <strong>10 minutes</strong></p>
                  </div>

                  <p style="color:#64748b;font-size:12px;line-height:1.6;margin:0;">
                    If you didn't request this, you can safely ignore this email.
                    Someone may have typed your email by mistake.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background:#0f172a;padding:20px 40px;text-align:center;border-top:1px solid #1e293b;">
                  <p style="color:#475569;font-size:11px;margin:0;">
                    © ${new Date().getFullYear()} Leadsilly · 
                    <a href="https://leadsilly.com" style="color:#3b82f6;text-decoration:none;">leadsilly.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Leadsilly" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${otp} — Your Leadsilly Verification Code`,
    html,
    text: `Your Leadsilly verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
  });
};
