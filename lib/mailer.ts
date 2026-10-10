import { env } from "cloudflare:workers";

/**
 * Sends a Captain access email through the Resend HTTP API.
 * Without RESEND_API_KEY / MAIL_FROM (local dev, or no secret on the host) it logs instead
 * and reports `delivered: false` for a visible Master-console warning.
 */
export async function sendCaptainAccessEmail(input: { to: string; teamName: string; code: string }) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.MAIL_FROM;
  if (!apiKey || !from) {
    // Never disclose an OTP through server logs. The Master console receives only a delivery failure.
    console.warn("[mailer] RESEND_API_KEY/MAIL_FROM not set; Captain OTP was not delivered.");
    return { delivered: false };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Boardroom Challenge · Captain access for ${input.teamName}`,
      text: [
        `You're the Captain for ${input.teamName}.`,
        "",
        `Your sign-in code: ${input.code}`,
        "",
        "Open the Boardroom Challenge team sign-in page, enter your rostered email, and use this code. It expires in 10 minutes and can be used once. If you didn't expect this, ignore it.",
      ].join("\n"),
    }),
  });
  if (!response.ok) console.log(`[mailer] Resend rejected the email (${response.status}).`);
  return { delivered: response.ok };
}
