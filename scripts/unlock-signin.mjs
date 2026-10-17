// Emergency: clears the sign-in limits for one email (Master or Captain) straight in the database, for when nobody
// can get into the Master console to press Reset. Usage:
//   DIRECT_URL=postgresql://…:5432/postgres npm run unlock-signin -- someone@botconsulting.io
import pg from "pg";

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!email || !email.includes("@")) { console.error("Usage: npm run unlock-signin -- <email>"); process.exit(1); }
if (!url) { console.error("Set DIRECT_URL (or DATABASE_URL) to the event database."); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
await client.connect();
const limits = await client.query("DELETE FROM rate_limits WHERE key = ANY($1) OR key LIKE $2", [[`otp-fail:${email}`, `otp-send:${email}`], `otp-send-b:${email}:%`]);
const codes = await client.query("DELETE FROM login_codes WHERE email = $1 AND used_at IS NULL", [email]);
await client.end();
console.log(`Unlocked ${email}: ${limits.rowCount} limit counter(s) and ${codes.rowCount} unused code(s) cleared. Request a new code now.`);
