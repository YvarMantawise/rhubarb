# Schiphol Voice Assistant

A Next.js application that provides AI-powered voice assistance for Schiphol Airport travelers.

## Context
This app will be used in a departure hall of an airport. It is specifically for Passengers with Reduced Mobility and needs to be designed as easy as possible. It is going to be used on an iPad.

## 🚀 **Tech Stack**
- **Next.js 13+** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** for components
- **Elevenlabs** for voice interactions

## 📁 **Project Structure**

```
schiphol-voice-assistant/
├── app/                    # Main application pages and API routes
│   ├── page.tsx           # Homepage (landing page)
│   ├── language-select/   # Language selection page
│   ├── flight-info/       # Flight information form
│   ├── voice-chat/        # Voice assistant interface
│   ├── api/               # Backend API routes
│   │   ├── elevenlabs/    # Elevenlabs integration
│   │   └── schiphol/      # Flight data API
│   ├── layout.tsx         # Root layout wrapper
│   └── globals.css        # Global styling
├── components/            # Reusable UI components
│   └── ui/               # shadcn/ui components
├── hooks/                # Custom React hooks
│   ├── use-mobile.tsx    # Mobile device detection
│   └── use-toast.ts      # Toast notifications
├── lib/                  # Utility functions
│   └── utils.ts          # Helper functions
├── public/               # Static assets
└── styles/               # Global CSS
```

## 🔄 **User Flow**

1. **Homepage** → User clicks "Start Now"
2. **Language Selection** → User chooses preferred language
3. **Flight Information** → User enters flight name
4. **Voice Chat** → User talks with AI assistant about their flight

## 🎯 **Key Features**

- **Multi-language support** (7 languages)
- **Real-time voice conversations** with AI
- **Flight information integration**
- **Mobile-responsive design**
- **Progressive web app structure**

## 🧩 **Component Architecture**

### Pages (User Interface):
- **`app/page.tsx`** - Landing page with call-to-action
- **`app/language-select/page.tsx`** - Language selection interface and flight number
- **`app/voice-chat/page.tsx`** - Voice assistant interface

### API Routes (Backend Logic):
- **`app/api/elevenlabs/create-session/route.ts`** - Creates voice sessions with ElevenLabs AI
- **`app/api/elevenlabs/get-signed-url/route.ts`** - Gets signed URLs for private agents
- **`app/api/schiphol/route.ts`** - Fetches flight data with full airport names

### Reusable Components:
All UI components are built with **shadcn/ui** and include:
- Buttons, Cards, Inputs, Selects
- Form components, Navigation
- Toast notifications, Modals

## 🛠️ **Development Notes**

### State Management:
- Uses **React hooks** (useState, useEffect) for local state
- **localStorage** for persisting user selections between pages
- **Retell SDK** for voice call management

### Styling:
- **Tailwind CSS** for utility-first styling
- **CSS custom properties** for theming
- **Responsive design** with mobile-first approach

### Voice Integration:
- **Retell AI SDK** for voice conversations
- Real-time transcript display
- Call state management (connecting, active, ended)

# ElevenLabs AI Agent Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
NEXT_PUBLIC_USE_PUBLIC_AGENT=true_or_false

# Language-specific agents
NEXT_PUBLIC_ELEVENLABS_AGENT_EN=your_english_agent_id
NEXT_PUBLIC_ELEVENLABS_AGENT_NL=your_dutch_agent_id  
NEXT_PUBLIC_ELEVENLABS_AGENT_ZH=your_chinese_agent_id
NEXT_PUBLIC_ELEVENLABS_AGENT_HI=your_hindi_agent_id
NEXT_PUBLIC_ELEVENLABS_AGENT_ES=your_spanish_agent_id
NEXT_PUBLIC_ELEVENLABS_AGENT_FR=your_french_agent_id
NEXT_PUBLIC_ELEVENLABS_AGENT_AR=your_arabic_agent_id

# Fallback agent (if language-specific not available)
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_fallback_agent_id

# Schiphol API (for production)
SCHIPHOL_APP_ID=your_schiphol_app_id
SCHIPHOL_APP_KEY=your_schiphol_app_key

## 🔍 **For Developers**

### File Types:
- **`.tsx` files** = React components with JSX
- **`.ts` files** = TypeScript logic without UI
- **`.css` files** = Styling
- **`route.ts` files** = Next.js API endpoints

### Key Dependencies:
- **@elevenlabs/react** - Voice AI integration
- **lucide-react** - Icon library

## 🎯 **Architecture Benefits**

- **Separation of concerns** - Pages, components, and API logic are separated
- **Reusable components** - UI elements can be used across multiple pages
- **Type safety** - TypeScript prevents common errors
- **Modern React patterns** - Uses hooks and functional components
- **Scalable structure** - Easy to add new features and pages

## 📱 **Responsive Design**

The app is built mobile-first and includes:
- Touch-friendly interface
- Optimized voice controls for mobile
- Progressive enhancement for desktop

---

**Note for AI Assistants:** This README provides the complete structure and context for the Schiphol Voice Assistant codebase. Use this information to provide accurate, contextual assistance with any development questions.
