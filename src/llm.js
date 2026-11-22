// Owner-copilot text generation. Gemini only; throws when unavailable so the caller can fall back to the rules answerer.
import { ask as gemini, geminiEnabled } from "./google.js";
import { llmGate } from "./limiter.js";
import { allowed, track } from "./usage.js";
const clean = (s) => (s || "").replace(/\*\*|__|`|^#+\s*/gm, "").replace(/\s+\n/g, "\n").trim();
export const llmProvider = () => (geminiEnabled() ? "gemini" : null);

export async function ask(system, user, maxTokens = 400) {
  if (!llmProvider()) throw new Error("no LLM configured");
  if (!allowed("llm")) throw new Error("daily model limit reached");
  const out = await llmGate(() => gemini(system, user, { maxTokens }));
  track("llm"); return clean(out);
}
