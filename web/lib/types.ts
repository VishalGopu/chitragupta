/** Shapes returned by the Chitragupta backend (src/server.js). */
export type Lang = "en-IN" | "hi-IN" | "te-IN";
export type Role = "counter" | "kitchen" | "owner";

export interface MenuItem {
  id: string; name: string; price: number; unit?: string; step?: number; stock?: number | null;
  soldOut?: boolean; aliases?: string[];
}
export interface Profile {
  id: string; kindLabel?: string; fulfil?: "kitchen" | "pack" | "instant"; payWhen?: "before" | "after";
  table?: boolean; words?: Record<string, string>; shops: { id: string; label: string }[];
}
export interface Config { menu: { shop: string; items: MenuItem[] }; profile: Profile; gemini: boolean; mock: boolean; parser: string }

export interface CartItem { id: string; qty: number; note?: string }
export interface Line { id: string; name: string; qty: number; price: number; unit?: string; note?: string; amount?: number; done?: number; chefId?: string }
export interface Order {
  id: string; number: number; lines: Line[]; total: number; status: string; paidAt?: number | null; startedAt?: number | null;
  lang?: Lang; table?: string; payLater?: boolean;
}
export interface TurnResponse {
  heard?: string; reply: string; lang: Lang; cart: CartItem[]; lines: Line[]; total: number; audio?: string | null;
  action?: "none" | "checkout" | "clear"; timings?: { stt?: number; parse?: number; via?: string; tts?: number }; error?: string;
}

export interface TaskItem { id: string; name: string; qty: number; total: number; done: number; unit?: string; note?: string; unavailable?: boolean }
export interface Chef {
  id: string; name: string; lang: Lang; online: boolean; skills: string[]; also?: string[]; helpAny?: boolean;
  task: { number: number; since: number; table?: string; items: TaskItem[] } | null;
  queued?: { number: number; from?: string; items: TaskItem[] }[];
}
export interface KitchenView { orders: Order[]; chefs: Chef[]; mode: "station" | "order"; fulfil?: string; words?: Record<string, string> }

export interface Facts {
  today: { orders: number; revenue: number; avgWaitMin: number | null };
  yesterday: { ordersByNow: number; revenueByNow: number };
  week: { peakHour: number | null; perDay: { label: string; revenue: number }[]; top: { name: string; qty: number }[] };
  stock?: { name: string; stock: number; unit?: string; daysLeft: number | null }[];
}
export interface ApiError { error: string }
