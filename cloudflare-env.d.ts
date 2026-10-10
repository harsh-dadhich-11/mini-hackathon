declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
  }
}
