# Chitragupta

AI order assistant for small shops, built for PromptWars x DevSphere Hacks.

> Status: scaffold only. Problem statement, architecture and setup instructions will be added as the project is built.

## Google services
- Gemini API: order parsing and shop copilot
- Firestore: orders and shop data
- Cloud Run: deployment (EC2 fallback)

## Setup
```bash
cp .env.example .env   # fill in your keys
npm install
npm test
npm start
```

See [docs/EVALUATION.md](docs/EVALUATION.md) for the plan and evaluation checklist.
