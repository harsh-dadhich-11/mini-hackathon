import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Viewer } from "@/lib/event-store";

export async function currentViewer(): Promise<Viewer | null> {
  const user = await getChatGPTUser();
  return user ? { email: user.email, displayName: user.displayName } : null;
}
