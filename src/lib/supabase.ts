import { createClient } from "@supabase/supabase-js";
import type { Item } from "./types";

// Browser client: the anon key only reaches what the database rules allow for the signed-in reviewer.
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Images live under <base>/<folder>/<item id>/<file>: the app's own /folders today, a Cloudflare R2 URL later.
const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE || "/folders";
export const imageUrl = (folder: string, item: string, file: string) =>
  `${IMAGE_BASE}/${encodeURIComponent(folder)}/${encodeURIComponent(item)}/${encodeURIComponent(file)}`;

export type ItemRow = { folder_id: string; item_id: string; title: string | null; attributes: Record<string, string>; images: string[] };

export const toItem = (r: ItemRow): Item => ({
  id: r.item_id,
  title: r.title ?? r.item_id,
  attributes: r.attributes,
  images: r.images.map((f) => ({ url: imageUrl(r.folder_id, r.item_id, f), label: f })),
});
