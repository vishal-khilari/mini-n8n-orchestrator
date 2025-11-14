// api/run-workflow.js
import { kvGet } from "../lib/upstash.js";
import { runWorkflow } from "../lib/executor.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { workflowId, input } = req.body || {};
  if (!workflowId) return res.status(400).json({ error: "workflowId required" });

  const key = `workflow:${workflowId}`;
  const raw = await kvGet(key);
  if (!raw) return res.status(404).json({ error: "Workflow not found" });
  const workflow = typeof raw === "string" ? JSON.parse(raw) : raw;

  try {
    const result = await runWorkflow(workflow, input || {});
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
}
