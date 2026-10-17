import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/captainAuth";
import { MASTER_COOKIE, verifyMasterCode } from "@/lib/auth/masterAuth";
import { clientIp } from "@/lib/auth/rateLimit";
import { clearChallengeCookie, currentChallenge, readVerify } from "@/lib/auth/signInRequest";
import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  try {
    const { email, code } = await readVerify(request);
    const token = await verifyMasterCode(email, code, clientIp(request), await currentChallenge());
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token, request, MASTER_COOKIE));
    clearChallengeCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, "master-auth/verify");
  }
}
