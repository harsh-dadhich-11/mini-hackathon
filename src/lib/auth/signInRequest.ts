import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { CHALLENGE_COOKIE, CHALLENGE_MINUTES, cleanChallengeId, newChallengeId } from "@/lib/auth/otp";

// Shared by the Captain and Master sign-in routes: strict input parsing and the browser challenge cookie that each
// sign-in code is bound to.

const RequestBody = z.object({ email: z.string().trim().max(254) });
const VerifyBody = z.object({ email: z.string().trim().max(254), code: z.string().trim().max(12) });

export async function readCodeRequest(request: Request) {
  const parsed = RequestBody.safeParse(await request.json().catch(() => null));
  return parsed.success ? parsed.data : { email: "" };
}

export async function readVerify(request: Request) {
  const parsed = VerifyBody.safeParse(await request.json().catch(() => null));
  return parsed.success ? parsed.data : { email: "", code: "" };
}

/** This browser's sign-in challenge, if it has one. */
export async function currentChallenge() {
  return cleanChallengeId((await cookies()).get(CHALLENGE_COOKIE)?.value);
}

/** Reuses this browser's challenge (so "Resend code" keeps working) or starts a new one. */
export async function challengeForRequest() {
  return (await currentChallenge()) ?? newChallengeId();
}

export function setChallengeCookie(response: NextResponse, challengeId: string, request: Request) {
  response.cookies.set({
    name: CHALLENGE_COOKIE,
    value: challengeId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/api",
    maxAge: CHALLENGE_MINUTES * 60,
  });
}

export function clearChallengeCookie(response: NextResponse) {
  response.cookies.set({ name: CHALLENGE_COOKIE, value: "", path: "/api", maxAge: 0 });
}
