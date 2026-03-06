# NSIB Call QA — Setup Guide

## Architecture
- **Frontend**: React (Vite) — upload UI + results display
- **Transcription**: Netlify Function → Groq Whisper (server-side, no CORS)
- **Analysis**: Claude API (Anthropic)

## Deploy to Netlify (5 minutes)

### 1. Push to GitHub
```
git init
git add .
git commit -m "NSIB Call QA"
git remote add origin https://github.com/YOUR_ORG/nsib-call-qa.git
git push -u origin main
```

### 2. Connect to Netlify
- Go to app.netlify.com → Add new site → Import from GitHub
- Select the repo
- Build command: `npm run build`
- Publish directory: `dist`
- Click Deploy

### 3. Add Environment Variables
In Netlify dashboard → Site settings → Environment variables → Add:

```
GROQ_API_KEY = your_groq_key_here
```

Get free Groq key at: **console.groq.com** → API Keys (no credit card, 100 hrs/day free)

### 4. Done
Your app will be live at: `https://your-site.netlify.app`

## How it works
1. User uploads WAV file from 3CX
2. Netlify function sends audio to Groq Whisper (server-side — no CORS)
3. Transcript returned to browser
4. Claude API scores the transcript against 6 QA criteria
5. Full report displayed with coaching tips, red flags, export

## File size limit
- Max 24MB per recording
- Typical 3CX WAV: ~1.4MB per minute (plenty of headroom)
