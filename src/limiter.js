// Concurrency gate for the shared model server: at most `max` calls in flight, a bounded queue behind them; beyond that, fail fast
// (callers fall back to the rules parser / answerer) so one busy hour never piles up unbounded work.
export function limiter(max = 8, maxQueue = 64) {
  let active = 0; const q = [];
  const pump = () => { while (active < max && q.length) { const { fn, res, rej } = q.shift(); active++; fn().then(res, rej).finally(() => { active--; pump(); }); } };
  const run = (fn) => new Promise((res, rej) => { if (q.length >= maxQueue) return rej(new Error("model busy")); q.push({ fn, res, rej }); pump(); });
  run.stats = () => ({ active, queued: q.length }); return run;
}
export const llmGate = limiter(+process.env.LLM_CONCURRENCY || 8, +process.env.LLM_QUEUE || 64);
