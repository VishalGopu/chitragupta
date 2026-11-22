// Business insights for the owner: facts computed from the order log, deterministic suggestions, a spoken briefing,
// and a rules-based answerer (used when no language model is reachable). All numbers come from here, never from a model.
import { orders, menu, soldOut, isOut } from "./orders.js";
import { fmtQty } from "../public/units.js";
const Tm = (o) => o.startedAt || o.paidAt;       // when the work began (pay-first: payment; pay-after: order taken)

const DAY = 86400000;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const label = (t) => new Date(t).toLocaleDateString("en-US", { weekday: "short" });

function agg(list) {
  const items = {}; let revenue = 0;
  for (const o of list) { revenue += o.total; for (const l of o.lines) { const x = (items[l.id] ||= { id: l.id, name: l.name, qty: 0, revenue: 0 }); if (l.unavailable) continue; x.qty = Math.round((x.qty + l.qty) * 100) / 100; x.revenue += l.amount ?? l.qty * l.price; } }
  return { orders: list.length, revenue, items: Object.values(items).sort((a, b) => b.qty - a.qty) };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const friendly = (n) => (n < 8 ? Math.max(1, Math.ceil(n)) : Math.round(n / 5) * 5);

export function facts(now = Date.now()) {
  const t0 = startOfDay(now), all = orders.filter((o) => o.paidAt && (o.shop || "canteen") === menu.id);
  const within = (a, b) => all.filter((o) => o.paidAt >= a && o.paidAt < b);
  const today = within(t0, t0 + DAY), yest = within(t0 - DAY, t0), week = within(t0 - 6 * DAY, t0 + DAY);
  const yestSoFar = within(t0 - DAY, now - DAY);                       // yesterday up to this time of day: fair comparison
  const A = agg(today), Y = agg(yest), W = agg(week), YS = agg(yestSoFar);

  const hourly = Array(24).fill(0); week.forEach((o) => hourly[new Date(Tm(o)).getHours()]++);
  const peakHour = Math.max(...hourly) > 0 ? hourly.indexOf(Math.max(...hourly)) : null;
  const waitsByHour = {}; week.filter((o) => o.readyAt).forEach((o) => (waitsByHour[new Date(Tm(o)).getHours()] ||= []).push((o.readyAt - Tm(o)) / 60000));
  const slowest = Object.entries(waitsByHour).filter(([, v]) => v.length >= 3).map(([h, v]) => ({ hour: +h, minutes: r1(avg(v)) })).sort((a, b) => b.minutes - a.minutes)[0] || null;

  const perDay = []; for (let i = 6; i >= 0; i--) { const a = t0 - i * DAY, g = agg(within(a, a + DAY)); perDay.push({ date: new Date(a).toLocaleDateString("en-CA"), label: label(a), orders: g.orders, revenue: g.revenue }); }
  const wq = Object.fromEntries(W.items.map((i) => [i.id, i.qty]));
  const slow = W.orders ? menu.items.filter((m) => !isOut(m.id)).map((m) => ({ id: m.id, name: m.name, qty: wq[m.id] || 0 })).sort((a, b) => a.qty - b.qty).slice(0, 2) : [];

  // tomorrow's prep: same weekday in the previous 4 weeks if we have it, otherwise the 7-day average per active day
  const tom = t0 + DAY; const sameDays = [1, 2, 3, 4].map((k) => agg(within(tom - k * 7 * DAY, tom - k * 7 * DAY + DAY))).filter((g) => g.orders > 0);
  const base = sameDays.length ? sameDays : perDay.map((d, i) => agg(within(t0 - (6 - i) * DAY, t0 - (6 - i) * DAY + DAY))).filter((g) => g.orders > 0);
  const tot = {}; base.forEach((g) => g.items.forEach((i) => (tot[i.name] = (tot[i.name] || 0) + i.qty)));
  const prep = base.length ? Object.entries(tot).map(([name, q]) => ({ name, qty: friendly(q / base.length) })).sort((a, b) => b.qty - a.qty).slice(0, 4) : [];

  // stock left and how long it lasts at this week's pace (only for items the owner tracks)
  const stock = menu.items.filter((i) => i.stock != null).map((i) => { const perDay = (wq[i.id] || 0) / 7; return { name: i.name, unit: i.unit, stock: i.stock, perDay: r1(perDay), daysLeft: perDay > 0 ? r1(i.stock / perDay) : null }; }).sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
  return {
    shop: menu.shop, kind: menu.kindLabel, fulfil: menu.fulfil, generatedAt: now, stock,
    today: { orders: A.orders, revenue: A.revenue, avgOrder: A.orders ? Math.round(A.revenue / A.orders) : 0, avgWaitMin: r1(avg(today.filter((o) => o.readyAt).map((o) => (o.readyAt - Tm(o)) / 60000))), top: A.items.slice(0, 3).map(({ name, qty }) => ({ name, qty })), cancelled: orders.filter((o) => o.status === "cancelled" && o.createdAt >= t0 && (o.shop || "canteen") === menu.id).length },
    yesterday: { orders: Y.orders, revenue: Y.revenue, ordersByNow: YS.orders, revenueByNow: YS.revenue },
    week: { orders: W.orders, revenue: W.revenue, perDay, top: W.items.slice(0, 3).map(({ name, qty, revenue }) => ({ name, qty, revenue })), slow, peakHour, hourly },
    tomorrow: { prep, basis: sameDays.length ? "same weekday" : "7-day average" },
    waitPeak: slowest, soldOut: menu.items.filter((m) => isOut(m.id)).map((m) => m.name),
    cooking: orders.filter((o) => o.status === "cooking").length,
  };
}

export function suggestions(f) {
  const s = [];
  const low = f.stock.filter((x) => x.stock <= 0 || (x.daysLeft != null && x.daysLeft <= 2)).slice(0, 3);
  if (low.length) s.push({ t: "restock", items: low });
  if (f.fulfil === "kitchen" && f.tomorrow.prep.length) s.push({ t: "prep", items: f.tomorrow.prep.slice(0, 3), hour: f.week.peakHour });
  if (f.week.orders >= 10 && f.week.slow[0]) s.push({ t: "slow", name: f.week.slow[0].name });
  if (f.waitPeak && f.waitPeak.minutes >= 8) s.push({ t: "wait", ...f.waitPeak });
  if (f.soldOut.length && !low.length) s.push({ t: "soldout", names: f.soldOut });
  return s;
}

// ---------------- wording (en / hi / te)
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);
const hourWord = { "en-IN": (h) => `${h12(h)} ${h < 12 ? "AM" : "PM"}`, "hi-IN": (h) => `${h12(h)} बजे`, "te-IN": (h) => `${h12(h)} గంటలకు` };
const L = {
  "en-IN": {
    noHear: "Sorry, I didn't catch that. Please ask again.", none: "There are no orders yet.", unknown: "I don't have enough data to answer that yet.",
    cmp: (p) => (p == null ? "" : Math.abs(p) < 3 ? ", about the same as this time yesterday" : p > 0 ? `, up ${p}% from this time yesterday` : `, down ${-p}% from this time yesterday`),
    today: (o, r, c) => `So far today you have ${o} orders and ${r} rupees in sales${c}.`, week: (o, r) => `In the last 7 days you made ${r} rupees from ${o} orders.`, yesterday: (o, r) => `Yesterday you had ${o} orders and ${r} rupees in sales.`,
    orders: (o) => `You have had ${o} orders today.`, top: (n, q) => `${n} is your best seller with ${q} sold.`, slowItem: (n) => `${n} sold the least this week.`,
    peak: (h) => `Your busiest hour is ${h}.`, wait: (m) => `Customers waited ${m} minutes on average after paying.`,
    prep: (it, h) => `For tomorrow, prepare about ${it}${h ? ` and be ready before ${h}` : ""}.`, slow: (n) => `${n} sold the least this week. Try a combo or a small offer.`,
    waitS: (m, h) => `Waits reach about ${m} minutes around ${h}. Consider an extra pair of hands then.`, soldout: (n) => `Marked sold out: ${n}. Remember to restock.`, noPrep: "I need a few more days of orders before I can suggest tomorrow's prep.",
    restock: (it) => `Running low: ${it}. Order more today.`, stockOk: "Nothing is running low right now.", noStock: "You are not tracking stock yet. Add stock counts in the catalog.",
  },
  "hi-IN": {
    noHear: "माफ़ कीजिए, मैं समझ नहीं पाया। कृपया दोबारा पूछिए।", none: "अभी तक कोई ऑर्डर नहीं आया है।", unknown: "इसका जवाब देने के लिए अभी मेरे पास पर्याप्त जानकारी नहीं है।",
    cmp: (p) => (p == null ? "" : Math.abs(p) < 3 ? ", कल इस समय के लगभग बराबर" : p > 0 ? `, कल इस समय से ${p}% ज़्यादा` : `, कल इस समय से ${-p}% कम`),
    today: (o, r, c) => `आज अब तक ${o} ऑर्डर आए हैं और ${r} रुपये की बिक्री हुई है${c}।`, week: (o, r) => `पिछले 7 दिनों में ${o} ऑर्डर से ${r} रुपये की बिक्री हुई।`, yesterday: (o, r) => `कल ${o} ऑर्डर आए और ${r} रुपये की बिक्री हुई।`,
    orders: (o) => `आज ${o} ऑर्डर आए हैं।`, top: (n, q) => `सबसे ज़्यादा ${n} बिका, ${q} बार।`, slowItem: (n) => `इस हफ़्ते ${n} सबसे कम बिका।`,
    peak: (h) => `सबसे ज़्यादा भीड़ ${h} रहती है।`, wait: (m) => `भुगतान के बाद ग्राहकों को औसतन ${m} मिनट इंतज़ार करना पड़ा।`,
    prep: (it, h) => `कल के लिए लगभग ${it} तैयार रखें${h ? ` और ${h} से पहले तैयारी कर लें` : ""}।`, slow: (n) => `इस हफ़्ते ${n} सबसे कम बिका। कॉम्बो या छोटा ऑफ़र आज़माएं।`,
    waitS: (m, h) => `${h} के आसपास इंतज़ार लगभग ${m} मिनट हो जाता है। उस समय एक और हाथ रखें।`, soldout: (n) => `बिक चुके चिह्नित: ${n}। दोबारा स्टॉक करना न भूलें।`, noPrep: "कल की तैयारी बताने के लिए मुझे कुछ और दिनों के ऑर्डर चाहिए।",
    restock: (it) => `स्टॉक कम हो रहा है: ${it}। आज और मंगवा लीजिए।`, stockOk: "अभी कुछ भी कम नहीं पड़ रहा।", noStock: "आप अभी स्टॉक ट्रैक नहीं कर रहे। कैटलॉग में स्टॉक की संख्या डालें।",
  },
  "te-IN": {
    noHear: "క్షమించండి, నాకు అర్థం కాలేదు. దయచేసి మళ్లీ అడగండి.", none: "ఇప్పటి వరకు ఆర్డర్లు ఏవీ లేవు.", unknown: "దీనికి సమాధానం ఇవ్వడానికి నా దగ్గర ఇంకా తగినంత సమాచారం లేదు.",
    cmp: (p) => (p == null ? "" : Math.abs(p) < 3 ? ", నిన్న ఈ సమయానికి దాదాపు సమానం" : p > 0 ? `, నిన్న ఈ సమయం కంటే ${p}% ఎక్కువ` : `, నిన్న ఈ సమయం కంటే ${-p}% తక్కువ`),
    today: (o, r, c) => `ఈరోజు ఇప్పటి వరకు ${o} ఆర్డర్లు, ${r} రూపాయల అమ్మకాలు${c}.`, week: (o, r) => `గత 7 రోజుల్లో ${o} ఆర్డర్ల నుండి ${r} రూపాయల అమ్మకాలు జరిగాయి.`, yesterday: (o, r) => `నిన్న ${o} ఆర్డర్లు, ${r} రూపాయల అమ్మకాలు జరిగాయి.`,
    orders: (o) => `ఈరోజు ${o} ఆర్డర్లు వచ్చాయి.`, top: (n, q) => `${n} ఎక్కువగా అమ్ముడైంది, ${q}.`, slowItem: (n) => `ఈ వారం ${n} అతి తక్కువగా అమ్ముడైంది.`,
    peak: (h) => `ఎక్కువ రద్దీ ${h} ఉంటుంది.`, wait: (m) => `చెల్లించిన తర్వాత కస్టమర్లు సగటున ${m} నిమిషాలు వేచి ఉన్నారు.`,
    prep: (it, h) => `రేపటికి సుమారు ${it} సిద్ధంగా ఉంచండి${h ? `, ${h} కంటే ముందు సిద్ధంగా ఉండండి` : ""}.`, slow: (n) => `ఈ వారం ${n} అతి తక్కువగా అమ్ముడైంది. కాంబో లేదా చిన్న ఆఫర్ ప్రయత్నించండి.`,
    waitS: (m, h) => `${h} సమయంలో వేచి ఉండే సమయం సుమారు ${m} నిమిషాలు. ఆ సమయంలో మరొకరిని ఉంచండి.`, soldout: (n) => `అయిపోయినవిగా గుర్తించినవి: ${n}. మళ్లీ స్టాక్ చేయడం మర్చిపోవద్దు.`, noPrep: "రేపటి తయారీ సూచించడానికి నాకు మరికొన్ని రోజుల ఆర్డర్లు కావాలి.",
    restock: (it) => `స్టాక్ తగ్గుతోంది: ${it}. ఈరోజే ఇంకా ఆర్డర్ చేయండి.`, stockOk: "ప్రస్తుతం ఏదీ తగ్గిపోవడం లేదు.", noStock: "మీరు ఇంకా స్టాక్ ట్రాక్ చేయడం లేదు. కేటలాగ్‌లో స్టాక్ సంఖ్యలు జోడించండి.",
  },
};
const T = (lang) => L[lang] || L["en-IN"];
const H = (lang, h) => (hourWord[lang] || hourWord["en-IN"])(h);

export function renderSuggestion(s, lang) {
  const t = T(lang);
  if (s.t === "restock") return t.restock(s.items.map((i) => i.stock <= 0 ? `${i.name} (0)` : `${i.name} (${fmtQty(i.stock, i.unit, true)}${i.daysLeft != null ? `, ~${Math.max(1, Math.round(i.daysLeft))}d` : ""})`).join(", "));
  if (s.t === "prep") return t.prep(s.items.map((i) => `${i.qty} ${i.name}`).join(", "), s.hour != null ? H(lang, s.hour) : "");
  if (s.t === "slow") return t.slow(s.name);
  if (s.t === "wait") return t.waitS(s.minutes, H(lang, s.hour));
  if (s.t === "soldout") return t.soldout(s.names.join(", "));
  return "";
}
const pct = (now, then) => (then > 0 ? Math.round(((now - then) / then) * 100) : null);

// Spoken daily briefing: facts first, then at most two suggestions.
export function briefing(f, lang) {
  const t = T(lang), parts = [];
  if (f.today.orders === 0 && f.yesterday.orders === 0 && f.week.orders === 0) parts.push(t.none);
  else if (f.today.orders === 0) parts.push(t.yesterday(f.yesterday.orders, f.yesterday.revenue));
  else {
    parts.push(t.today(f.today.orders, f.today.revenue, t.cmp(pct(f.today.revenue, f.yesterday.revenueByNow))));
    if (f.today.top[0]) parts.push(t.top(f.today.top[0].name, f.today.top[0].qty));
    if (f.today.avgWaitMin != null) parts.push(t.wait(f.today.avgWaitMin));
  }
  if (f.week.peakHour != null) parts.push(t.peak(H(lang, f.week.peakHour)));
  const sug = suggestions(f).slice(0, 2).map((s) => renderSuggestion(s, lang)); parts.push(...sug);
  return { text: parts.join(" "), parts, suggestions: sug };
}

// Rules answerer for common questions (English text from STT translate mode, plus a few Hindi/Telugu keywords).
export function answerRules(q, f, lang) {
  const t = T(lang), s = (q || "").toLowerCase(), has = (re) => re.test(s);
  if (f.week.orders === 0) return t.none;
  if (has(/yesterday|कल (कितना|कितने|क्या बिका)|నిన్న/)) return t.yesterday(f.yesterday.orders, f.yesterday.revenue);
  if (has(/week|7 days|हफ़्ते|हफ्ते|सप्ताह|వారం/)) return t.week(f.week.orders, f.week.revenue);
  if (has(/restock|running (low|out)|low on|out of|stock|reorder|order more|स्टॉक|खत्म|స్టాక్|అయిపో/)) { if (!f.stock.length) return t.noStock; const r = suggestions(f).find((x) => x.t === "restock"); return r ? renderSuggestion(r, lang) : t.stockOk; }
  if (f.fulfil !== "kitchen" && has(/tomorrow|prepare|buy|order|कल|రేపు/) && f.stock.length) { const r = suggestions(f).find((x) => x.t === "restock"); return r ? renderSuggestion(r, lang) : t.stockOk; }
  if (has(/tomorrow|prepare|prep\b|make more|बनाऊं|बनाना|तैयार|రేపు|సిద్ధం/)) { const p = suggestions(f).find((x) => x.t === "prep"); return p ? renderSuggestion(p, lang) : t.noPrep; }
  if (has(/slow|least|worst|not selling|कम बिका|తక్కువ/)) return f.week.slow[0] ? t.slowItem(f.week.slow[0].name) : t.unknown;
  if (has(/best|top|most|popular|favou?rite|सबसे ज़्यादा|सबसे ज्यादा|बिकता|ఎక్కువ/)) return f.today.top[0] ? t.top(f.today.top[0].name, f.today.top[0].qty) : f.week.top[0] ? t.top(f.week.top[0].name, f.week.top[0].qty) : t.unknown;
  if (has(/busi|peak|rush|crowd|भीड़|రద్దీ/)) return f.week.peakHour != null ? t.peak(H(lang, f.week.peakHour)) : t.unknown;
  if (has(/wait|delay|long time|how long|इंतज़ार|इंतजार|వేచి/)) return f.today.avgWaitMin != null ? t.wait(f.today.avgWaitMin) : t.unknown;
  if (has(/how many (orders|customers)|number of orders|orders|ऑर्डर|ఆర్డర్/)) return t.orders(f.today.orders);
  if (has(/earn|revenue|sales?|money|income|profit|made|कमाया|कमाई|बिक्री|ఆదాయం|సంపాద|అమ్మకాల/)) return t.today(f.today.orders, f.today.revenue, t.cmp(pct(f.today.revenue, f.yesterday.revenueByNow)));
  return null;                                   // no rule matched -> caller asks the language model
}
export const noHear = (lang) => T(lang).noHear;
export const LANG_NAMES = { "en-IN": "English", "hi-IN": "Hindi (Devanagari script)", "te-IN": "Telugu (Telugu script)" };
