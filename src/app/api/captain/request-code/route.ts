import { after, NextResponse } from "next/server";
import { requestCaptainAccess } from "@/lib/auth/captainAuth";
import { allowCodeRequest } from "@/lib/auth/otp";
import { clientIp } from "@/lib/auth/rateLimit";
import { challengeForRequest, readCodeRequest, setChallengeCookie } from "@/lib/auth/signInRequest";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  const { email } = await readCodeRequest(request);
  if (!(await allowCodeRequest(clientIp(request)))) {
    return NextResponse.json({ error: "Too many sign-in requests from this network, or the server is busy. Wait a minute and try again." }, { status: 429 });
  }
  // The code is bound to this browser: only a browser holding this challenge cookie can use it.
  const challengeId = await challengeForRequest();
  // The lookup and email happen after the response, so its timing can't reveal who is on the roster.
  after(() => requestCaptainAccess(email, challengeId).catch((error) => console.error("[captain] code request failed", error)));
  const response = NextResponse.json({ ok: true, message: "If that email belongs to a Captain, a code is on its way. It can take a minute to arrive. Enter it in this same browser." });
  setChallengeCookie(response, challengeId, request);
  return response;
}
