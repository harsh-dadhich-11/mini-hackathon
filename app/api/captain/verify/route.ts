import { NextResponse } from "next/server";
import { sessionCookie, verifyCaptainCode } from "@/lib/captain-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; code?: string };
    const token = await verifyCaptainCode(String(body.email ?? ""), String(body.code ?? ""));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token, request));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status: 400 });
  }
}
