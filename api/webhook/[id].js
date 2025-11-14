// api/webhook/[id].js
import { kvList, kvGet } from "../../lib/upstash.js";
import { runWorkflow } from "../../lib/executor.js";

export default async function handler(req, res) {
  const { id } = req.query; // dynamic param from route
  // search for workflow with webhookId or path matching id
  // naive approach: list all workflows and find the one referencing webhook path id
  const list = await kvList("workflow:");
  if (!list || !list.results) return res.status(404).send("No workflows");
  let foundWorkflow = null;
  for (const item of list.results) {
    const raw = await kvGet(item.name);
    const wf = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!wf) continue;
    // find webhook nodes
    const webhookNode = (wf.nodes||[]).find(n => {
      if (!n.type) return false;
      const isWebhook = n.type.includes("webhook") || n.name?.toLowerCase().includes("input");
      if (!isWebhook) return false;
      if (n.parameters?.path && n.parameters.path === id) return true;
      if (n.webhookId && n.webhookId === id) return true;
      return false;
    });
    if (webhookNode) { foundWorkflow = wf; break; }
  }

  if (!foundWorkflow) {
    return res.status(404).send("No workflow with that webhook id/path");
  }

  // run workflow with the incoming payload
  const input = { body: req.body, headers: req.headers, query: req.query };
  try {
    const result = await runWorkflow(foundWorkflow, input);
    // if the workflow produced a respondToWebhook node, attempt to find it and return its content
    // search results for 'Respond With JSON' type or respondToWebhook node name
    const respNodeName = Object.keys(result.context.results).find(k => k.toLowerCase().includes("respond"));
    if (respNodeName) {
      const out = result.context.results[respNodeName][0]?.json || {};
      // If out has "body" or direct object
      if (out && out.body) {
        // if body is a JSON-string, try parse
        try { return res.json(JSON.parse(out.body)); } catch(e) { return res.send(out.body); }
      } else {
        return res.json(out);
      }
    }
    return res.json({ ok: true, context: result.context });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
