import "server-only";

const SEND_TIMEOUT_MS = 5000;

/**
 * Sends an access email through the Resend HTTP API.
 * Without RESEND_API_KEY / RESEND_FROM_EMAIL (local dev, or no secret on the host), or when Resend fails or is slow,
 * it reports `delivered: false` so the caller can drop the unsent code and the Master console can warn.
 */
async function sendEmail(input: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    // Never disclose an OTP through server logs. The Master console receives only a delivery failure.
    console.warn("[mailer] RESEND_API_KEY/RESEND_FROM_EMAIL not set; access code was not delivered.");
    return { delivered: false };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[mailer] Resend rejected the email (${response.status}).`);
    return { delivered: response.ok };
  } catch (error) {
    console.error("[mailer] Resend could not be reached.", error instanceof Error ? error.name : error);
    return { delivered: false };
  }
}

export async function sendCaptainAccessEmail(input: { to: string; teamName: string; code: string }) {
  return sendEmail({
    to: input.to,
    subject: `Boardroom Challenge · Captain access for ${input.teamName}`,
    text: [
      `You're the Captain for ${input.teamName}.`,
      "",
      `Your sign-in code: ${input.code}`,
      "",
      "Open the Boardroom Challenge team sign-in page, enter your rostered email, and use this code. It expires in 10 minutes and can be used once. If you didn't expect this, ignore it.",
    ].join("\n"),
  });
}

export async function sendMasterAccessEmail(input: { to: string; code: string }) {
  return sendEmail({
    to: input.to,
    subject: "Boardroom Challenge · Master sign-in code",
    text: [
      `Your Master sign-in code: ${input.code}`,
      "",
      "Enter it on the Boardroom Challenge /master page. It expires in 10 minutes and can be used once. If you didn't request it, ignore this email.",
    ].join("\n"),
  });
}
