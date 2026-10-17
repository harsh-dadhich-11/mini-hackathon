import { redirect } from "next/navigation";

/** The shared link is for Captains; Masters go to /master directly. */
export default function Home() {
  redirect("/team");
}
