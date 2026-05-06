import sgMail from '@sendgrid/mail';

// Initialize SendGrid with API key from environment variables
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export async function sendVendorWelcome(vendor: {
  name: string;
  email: string;
  storeName: string;
}) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'onboarding@resend.dev'; // Fallback for safety

  const msg = {
    to: vendor.email,
    from: `NomadBite <${fromEmail}>`,
    subject: `You've been added as a vendor on NomadBite`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
        <h1 style="font-size:20px;font-weight:800;margin-bottom:4px">Welcome to NomadBite</h1>
        <p style="color:#666;font-size:13px;margin-top:0">Vendor onboarding</p>

        <p style="font-size:15px">Hi <strong>${vendor.name}</strong>,</p>
        <p style="font-size:15px;line-height:1.6">
          You've been registered as a vendor for <strong>${vendor.storeName}</strong> on the
          NomadBite platform. Your account is now active and ready to go.
        </p>

        <p style="font-size:15px;line-height:1.6">
          If you have any questions or didn't expect this message, please reach out to your
          store manager directly.
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
        <p style="font-size:12px;color:#999;margin:0">NomadBite · Nairobi, Kenya</p>
      </div>
    `,
  };

  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('[email] SENDGRID_API_KEY not set — skipping email');
      return;
    }
    await sgMail.send(msg);
    console.log(`[email] Vendor welcome sent to ${vendor.email}`);
  } catch (error) {
    console.error('[email] SendGrid error:', error);
    // Re-throw so the caller can handle or log it
    throw error;
  }
}
