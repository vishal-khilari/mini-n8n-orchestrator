// lib/upstash.js
import { KV } from "@upstash/kv";

const kv = new KV({
  url: process.env.UPSTASH_KV_REST_URL,
  token: process.env.UPSTASH_KV_REST_TOKEN,
});

export async function kvGet(key) {
  return kv.get(key);
}
export async function kvSet(key, value) {
  return kv.set(key, value);
}
export async function kvDel(key) {
  return kv.del(key);
}
export async function kvList(prefix) {
  return kv.list({ prefix });
}
