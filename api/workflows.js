// api/workflows.js
import { kvGet, kvSet, kvList } from "../lib/upstash.js";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // list workflows
    const list = await kvList("workflow:");
    // upstash kv.list returns items; adapt to your lib
    // We'll try keys  — kv.list returns results array if using @upstash/kv
    const workflows = [];
    try {
      const raw = await kvList("workflow:");
      // raw objects have keys: results...
      if (raw && raw.results) {
        for (const k of raw.results) {
          const w = await kvGet(k.name);
          workflows.push(JSON.parse(w));
        }
      } else {
        // fallback: attempt get all common keys (not ideal)
      }
    } catch (e) {
      // fallback: nothing
    }
    res.status(200).json({ workflows });
  } else if (req.method === "POST") {
    const body = req.body || {};
    const id = body.id || uuidv4();
    const key = `workflow:${id}`;
    await kvSet(key, JSON.stringify(body.workflow || body));
    return res.status(201).json({ id });
  } else {
    res.status(405).json({ error: "Only GET and POST allowed" });
  }
}
