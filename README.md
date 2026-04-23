# 🚀 AI Instagram SaaS (Viral Content Forensics & Generator)

A powerful Next.js application designed to deconstruct viral short-form videos (Instagram Reels, TikToks, YouTube Shorts) and generate high-converting scripts, AI video prompts, and viral blueprints. Built with modern web standards, advanced AI routing, and a state-of-the-art UI.

---

## 🌟 Core Features & Functionality

### 1. 🔍 Viral Video Forensics (The Analyzer)
Paste any URL from Instagram, TikTok, or YouTube Shorts to run a 5-layer deep forensic analysis of why the video works.
*   **Scene-by-Scene Script Reconstruction**: Breaks the video down into 6-10 distinct scenes detailing narration (voiceover/text overlay), shot composition, camera movement, and editing notes.
*   **Viral Factors & View Magnets**: Identifies the psychological hooks and specific timestamps that keep viewers retained. Metric scorecard out of 10 for Hook Strength, Retention, Shareability, and Replay Value.
*   **Character Extraction for AI**: Generates 50+ word multimodal image prompts mapped to the *actual* subjects/characters seen in the video, ready to be pasted into Midjourney or Flux.
*   **Replication Blueprint**: Gives the user a core step-by-step formula on shooting, editing, sound design, and niche variations.

### 2. 🪄 Remix & Generate (Video AI Engine)
Take any analyzed viral video and instruct the AI to spin it into a new niche or style.
*   **Context-Aware**: Uses the original viral blueprint to maintain the core retention structure while modifying the subject matter.
*   **Video Generation Prompts**: Outputs a completely new script where *every single scene* includes a highly detailed AI Video generation prompt (40-80 words). These prompts are formatted specifically to be copy-pasted directly into AI video tools like **Runway Gen-3, Kling, Pika, and Sora**.

### 3. 🧠 Smart AI Routing & Vision Support
The backend utilizes a highly resilient, cost-effective AI router:
*   **Primary Engine (OpenAI `gpt-4o`)**: Attempts to pass the raw `video_url` directly to OpenAI, allowing the model to physically watch the public video content for 100% accurate visual analysis.
*   **Fallback Engine (OpenRouter `gemini-2.0-flash-001`)**: If the platform blocks direct video access, the backend seamlessly falls back to OpenRouter. It scrapes and compiles up to 5 high-res frames/thumbnails from the video and passes them as a multimodal image array.
*   **Anti-Hallucination Measures**: Strict system prompts forbid the AI from inventing human characters if they are not visually confirmed in the frames.

### 4. ⚡ Intelligent Caching System
*   **LRU Cache**: An in-memory cache system saves API costs by storing recent AI analyses for up to 30 minutes.
*   **User Control**: Includes a "Re-analyze (Fresh)" button on the frontend that bypasses the cache (`skipCache: true`) to force a brand new API execution when desired.

### 5. 🔐 Authentication & Session Management
*   **Supabase Auth**: Secure user authentication via Supabase `@supabase/ssr`. 
*   **Smart Header**: Dynamically updates to show the User's Avatar, Name, and current subscription Tier (e.g., "Pro Plan") instead of generic login buttons.

---

## 🛠 Tech Stack

*   **Framework**: Next.js 15 (App Router), React 19
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS (with highly customized glassmorphism aesthetics)
*   **Animations**: Framer Motion (micro-animations, layout transitions, loading skeletons)
*   **Icons**: Lucide React
*   **AI Integration**: OpenAI Native SDK & OpenRouter API
*   **Auth / Database**: Supabase
*   **Scraping**: `link-preview-js` (Thumbnail extraction)

---

## 📁 Project Architecture & Key Files

| File/Folder | Purpose |
| :--- | :--- |
| `src/app/api/analyze/route.ts` | The core Forensic AI endpoint. Implements API routing (OpenAI -> Gemini Fallback), video thumbnail scraping, and JSON restructuring. |
| `src/app/api/remix/route.ts` | Parses user tweak instructions against an existing video blueprint to generate scene-by-scene AI video prompts. |
| `src/components/VideoAnalyzer.tsx` | Main interactive UI for URL input, loading animations, error handling, and orchestration. |
| `src/components/AnalysisResultPanel.tsx` | The tabbed UI interface (Script, Viral Factors, Characters, Blueprint, Remix) that maps out the rich JSON responses. |
| `src/lib/cache.ts` | Custom, lightweight LRU cache restricting redundant AI executions. |
| `src/lib/openrouter.ts` | Manages AI client initialization and connection timeouts for long-running prompts. |
| `src/lib/supabase.ts` | Server-Side Rendering compatible Supabase client instantiation. |

---

## 🎨 UI/UX Design Philosophy

*   **Dark Mode Premium**: The UI utilizes deep, sleek dark tones enhanced by subtle `primary` (purple/indigo) glowing gradients and glassmorphism panels.
*   **Zero Loading Anxiety**: Long-running AI tasks feature rotating loader rings and pulsating text states ("Analyzing Video DNA...", "Running 5-layer deep forensic analysis") to keep the user engaged.
*   **Cost-Effective Data**: The AI outputs highly compact, short-key JSON payloads (e.g., `{"s":{"sc":...}}`) to limit output token costs, which are successfully expanded into readable formats server-side before reaching the frontend.

---

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Ensure you have configured your `.env` file with the following keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
   OPENROUTER_API_KEY="your-openrouter-key"
   OPENAI_API_KEY="your-openai-key"
   ```

3. **Run the Development Server**
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.*
