import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/captain-auth";
import { MASTER_COOKIE, verifyMasterCode } from "@/lib/master-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; code?: string };
    const token = await verifyMasterCode(String(body.email ?? ""), String(body.code ?? ""));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token, request, MASTER_COOKIE));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status: 400 });
  }
}
