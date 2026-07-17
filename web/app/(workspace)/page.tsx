import { redirect } from "next/navigation";

// The course creator is the product's front door. Canonical URL is /course
// (what the sidebar, e2e suite, and shared links use); the bare origin
// redirects there.
export default function HomePage() {
  redirect("/course");
}
