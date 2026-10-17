import { NextResponse } from "next/server";

/**
 * An error whose message is written for the person using the app. Only these messages reach the client;
 * anything else (database, network, bugs) is logged and answered with a generic message.
 */
export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "UserError";
  }
}

/** The JSON error response for a route handler's catch block. */
export function errorResponse(error: unknown, scope: string) {
  if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`[${scope}]`, error);
  return NextResponse.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
}
