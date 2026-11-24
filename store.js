import { config } from "./config.js";

const guestKey = "nexonomy.guest-lists.v1";
const activeKey = "nexonomy.active-list.v1";

function browserStorage() {
  try {
    const store = window.localStorage;
    const probe = `${guestKey}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch { return null; }
}

const storage = browserStorage();
export const hasBrowserStorage = Boolean(storage);

export function readGuestLists() {
  try {
    const lists = JSON.parse(storage?.getItem(guestKey));
    if (Array.isArray(lists) && lists.every(list => typeof list.name === "string" && Array.isArray(list.assets))) return lists;
  } catch { /* Missing or invalid storage is treated as a fresh workspace. */ }
  return [{ id: "field-notes", name: "My field notes", assets: [] }];
}

export function writeGuestLists(lists) {
  storage?.setItem(guestKey, JSON.stringify(lists));
}
export function readGuestActiveId() {
  try { return storage?.getItem(activeKey); } catch { return null; }
}
export function writeGuestActiveId(id) {
  try { if (id) storage?.setItem(activeKey, id); } catch { /* Optional UI preference. */ }
}

export const accountsConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey);

export async function connectAccounts(onSession) {
  const supabaseUrl = new URL(config.supabaseUrl);
  if (supabaseUrl.protocol !== "https:") throw new Error("The account service must use an HTTPS URL.");
  if (config.supabasePublishableKey.startsWith("sb_secret_")) throw new Error("Use a Supabase publishable key, not a secret key.");
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./vendor/supabase.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the account client."));
    document.head.append(script);
  });
  const client = window.supabase.createClient(supabaseUrl.href, config.supabasePublishableKey, {
    auth: { persistSession: hasBrowserStorage, flowType: "pkce" },
  });
  client.auth.onAuthStateChange((_event, session) => {
    // Do not call async Supabase methods from inside the auth callback.
    setTimeout(() => onSession(session?.user ?? null), 0);
  });
  return client;
}

export async function readAccountLists(client) {
  const { data, error } = await client.from("nexonomy_lists")
    .select("id,name,nexonomy_list_assets(feature)").order("created_at");
  if (error) throw error;
  return data.map(row => ({ id: row.id, name: row.name, assets: row.nexonomy_list_assets.map(record => record.feature) }));
}

export async function createAccountList(client, userId, name) {
  const { data, error } = await client.from("nexonomy_lists")
    .insert({ user_id: userId, name }).select("id,name").single();
  if (error) throw error;
  return { ...data, assets: [] };
}

export async function addAccountAsset(client, userId, listId, asset) {
  const { error } = await client.from("nexonomy_list_assets")
    .upsert({ list_id: listId, user_id: userId, osm_id: asset.id, feature: asset }, { onConflict: "list_id,osm_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeAccountAsset(client, listId, assetId) {
  const { error } = await client.from("nexonomy_list_assets").delete().eq("list_id", listId).eq("osm_id", assetId);
  if (error) throw error;
}
