"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const languages = [
  { code: "en", nativeName: "English",    englishName: "English",    flag: "🇬🇧" },
  { code: "ar", nativeName: "العربية",    englishName: "Arabic",     flag: "🇸🇦" },
  { code: "zh", nativeName: "中文",        englishName: "Chinese",    flag: "🇨🇳" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch",      flag: "🇳🇱" },
  { code: "fr", nativeName: "Français",   englishName: "French",     flag: "🇫🇷" },
  { code: "de", nativeName: "Deutsch",    englishName: "German",     flag: "🇩🇪" },
  { code: "hi", nativeName: "हिन्दी",      englishName: "Hindi",      flag: "🇮🇳" },
  { code: "ja", nativeName: "日本語",      englishName: "Japanese",   flag: "🇯🇵" },
  { code: "pt", nativeName: "Português",  englishName: "Portuguese", flag: "🇵🇹" },
  { code: "es", nativeName: "Español",    englishName: "Spanish",    flag: "🇪🇸" },
  { code: "tr", nativeName: "Türkçe",     englishName: "Turkish",    flag: "🇹🇷" },
] as const

type LanguageCode = (typeof languages)[number]["code"]

export default function HomePage() {
  const router = useRouter()
  const [selectedCode, setSelectedCode] = useState<LanguageCode | null>(null)

  useEffect(() => {
    localStorage.clear()
  }, [])

  const handleLanguageSelect = (code: LanguageCode) => {
    if (selectedCode) return
    setSelectedCode(code)
    localStorage.setItem("selectedLanguage", code)
    setTimeout(() => router.push("/voice-chat"), 500)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 gap-10 animate-fade-in">

      {/* Wordmark */}
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Custom Voice AI<br />Passenger Service
        </h1>
        <p className="text-base text-foreground/80 mt-4">
          Request PRM support, get directions and make enquiries<br />
          through <strong>a spoken conversation with AI</strong>.
        </p>
      </div>

      {/* Language list — vertical flagship style */}
      <div className="w-full max-w-xl divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {languages.map((lang, index) => {
          const isSelected = selectedCode === lang.code
          return (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              aria-label={`Select language: ${lang.nativeName}`}
              className={`
                w-full flex items-center gap-5 px-7 py-5
                transition-colors duration-150 text-left
                animate-slide-up
                ${isSelected ? "bg-secondary" : "bg-card hover:bg-secondary active:bg-secondary/80"}
              `}
              style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
            >
              <span className="text-lg leading-none shrink-0">{lang.flag}</span>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className={`font-playfair text-xl leading-tight tracking-[0.01em] ${isSelected ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                  {lang.nativeName}
                </span>
                <span className="text-xs font-light text-muted-foreground tracking-[0.08em] uppercase">
                  {lang.englishName}
                </span>
              </div>
              {isSelected && (
                <span className="w-2.5 h-2.5 rounded-full bg-foreground shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      <p className="text-lg font-semibold text-foreground">
        Select your language to start the conversation.
      </p>

      <p className="text-xs text-muted-foreground tracking-wide text-center">
        Your audio will not be stored and transcripts will be anonymized.
      </p>

    </div>
  )
}
