import { redirect } from "next/navigation"

// Language selection has moved to the home page (/).
// This route is kept to avoid broken links.
export default function LanguageSelectPage() {
  redirect("/")
}
