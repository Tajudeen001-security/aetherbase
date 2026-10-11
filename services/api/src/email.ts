const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

export async function sendOTPEmail(email: string, code: string) {
  if (!RESEND_API_KEY) {
    console.log(`[Email] No RESEND_API_KEY set. OTP for ${email}: ${code}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "KotahBase <onboarding@resend.dev>",
        to: [email],
        subject: "Your KotahBase verification code",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #7c3aed;">KotahBase</h2>
            <p>Your verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #111;">
              ${code}
            </div>
            <p style="color: #666;">This code expires in 10 minutes.</p>
            <p style="color: #999; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
          </div>
        `
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Email] Resend error:", err);
      return false;
    }

    console.log(`[Email] OTP sent to ${email}`);
    return true;
  } catch (err: any) {
    console.error("[Email] Failed to send:", err.message);
    return false;
  }
}
