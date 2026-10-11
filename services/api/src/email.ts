const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

export async function sendOTPEmail(email: string, code: string, type: "signup" | "reset" = "signup") {
  if (!RESEND_API_KEY) {
    console.log(`[Email] No RESEND_API_KEY. OTP for ${email}: ${code}`);
    return false;
  }

  const subject = type === "reset"
    ? "Reset your KotahBase password"
    : "Your KotahBase verification code";

  const title = type === "reset" ? "Password Reset" : "Verify your email";
  const message = type === "reset"
    ? "Use this code to reset your password:"
    : "Your verification code is:";

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
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #7c3aed;">KotahBase</h2>
            <p>${title}</p>
            <p>${message}</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #111;">
              ${code}
            </div>
            <p style="color: #666;">This code expires in 10 minutes.</p>
            <p style="color: #999; font-size: 13px;">If you didn't request this, ignore this email.</p>
          </div>
        `
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Email] Resend error:", err);
      return false;
    }

    console.log(`[Email] ${type} OTP sent to ${email}`);
    return true;
  } catch (err: any) {
    console.error("[Email] Failed:", err.message);
    return false;
  }
}
