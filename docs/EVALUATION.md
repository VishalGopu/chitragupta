# Chitragupta – PromptWars x DevSphere Hacks: Evaluation & Win Plan

Source codebase (untouched, reference only): `../jarvis-shop`
This folder is the NEW clean project that becomes the public GitHub repo.

## 1. Hard submission rules (pass/fail)
- [ ] Public GitHub repo
- [ ] Exactly ONE branch (`main`), no other local/remote branches
- [ ] Repo size < 10 MB (no APKs, no node_modules, no media; `.gitignore` them)
- [ ] Max 2 submission attempts, so do a full dry run before the first one
- [ ] Google Antigravity installed and used for the build (mention it in the README)
- [ ] Deployed link live (Google Cloud Run), opens with no login
- [ ] LinkedIn post link (demo video, screenshot, repo link, hackathon tags)

Submission form fields (no spaces in links): category, GitHub link, deployed link, LinkedIn link.

## 2. AI evaluator rubric: our target for each
| Criterion | What we do | Done |
|---|---|---|
| Code quality | Small modules, JSDoc, lint config, clear README with architecture diagram | [ ] |
| Efficiency | Few dependencies, caching, no blocking calls, lean Docker image | [ ] |
| Security | No secrets in repo, `.env.example`, input validation, rate limiting, security headers, no hard-coded creds | [ ] |
| Testing | `node --test` suite, coverage report, GitHub Actions CI | [ ] |
| Accessibility | ARIA labels, keyboard nav, contrast, `lang`, focus states, alt text, Lighthouse a11y 95+ | [ ] |
| Problem statement alignment | Quote the exact problem statement in the README, map each feature to it | [ ] |
| Google services integration | 3-5 services used in real roles (see below) | [ ] |

## 3. Google services plan
Core (confirmed):
- **Gemini API**: order parsing and shop copilot (replaces Groq)
- **Firestore**: orders and shop data storage

Deployment:
- **Cloud Run** if a Google Cloud project with billing is available (preferred, scores Google integration)
- **AWS EC2** as fallback (same Dockerfile; the deployed link still counts, but we lose the Cloud Run point)

Stretch (only if time allows):
- **Firebase Auth (Google Sign-In)**: shopkeeper login
- **Speech-to-Text / Text-to-Speech**: voice ordering

## 4. Carry over from jarvis-shop (selectively)
- Order parsing, copilot, insights, kitchen and kirana flows
- Tests (port to `node --test`)
- Leave behind: `apk/`, `android/`, `voice-lab/`, Paytm and Exotel-specific code, probe scripts

## 5. Open questions
- [ ] Challenge category and problem statement (paste from the event page)
- [ ] GitHub repo URL (user will create it and share it)
- [ ] Cloud project and billing available for Cloud Run? (else EC2)

## 6. Build order
1. Get the problem statement, pick the category
2. Scaffold the repo: README, `.gitignore`, `.env.example`, Dockerfile, CI
3. Port the core logic and swap in Gemini
4. Add Firestore, Auth and Speech
5. Tests + security + accessibility pass
6. Deploy to Cloud Run, verify the URL
7. Dry run: fresh clone, install, test; check size and branch count
8. Record the demo, publish the LinkedIn post
9. Submit (attempt 1), read the AI feedback, fix, submit (attempt 2 only if needed)
