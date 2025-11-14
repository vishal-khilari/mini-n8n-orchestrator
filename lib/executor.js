// lib/executor.js
import { v4 as uuidv4 } from "uuid";
import { base64ToBuffer, uploadToCloudinary, assemblyCreateTranscript, assemblyGetTranscript, callOpenAIChat, sleep } from "./helpers.js";

/**
 * nodesArr = workflow.nodes
 * input = { body: {...}, headers: {...}, query: {...} }
 * returns execution result (object)
 */
export async function runWorkflow(workflow, input = {}) {
  // map nodes by id
  const nodesById = {};
  (workflow.nodes || []).forEach(n => nodesById[n.id] = n);

  // find first node(s) triggered by input; in your workflows the 'input' webhook node is starting node
  // We will implement a BFS-style runner for nodes connected in workflow.connections

  // Build adjacency from workflow.connections
  const adj = {};
  const connections = workflow.connections || {};
  for (const [fromName, obj] of Object.entries(connections)) {
    // Each connection maps outputs to destinations
    const outs = obj.main || obj; // sometimes structure varies; robustly handle
    // The workflow exported from n8n uses node-name keys; we'll handle dynamic by node IDs.
  }

  // Simpler approach: run nodes by scanning nodes array in order, and execute nodes that match types
  // This is deterministic for our exported workflow where connections define flow logically.

  // We'll implement handling for a set of node types and follow simple chain where node types call next nodes by reading names in workflow.connections
  const connectionsByNodeName = {};
  for (const [nodeName, connObj] of Object.entries(workflow.connections || {})) {
    connectionsByNodeName[nodeName] = connObj;
  }

  // Helper to find node by name
  const findNodeByName = (name) => (workflow.nodes || []).find(n => n.name === name);

  // We'll start with node named "input" (your webhook node name) if present
  const startNode = (workflow.nodes || []).find(n => n.type?.includes("webhook") || n.name === "input");
  if (!startNode) throw new Error("No webhook/start node found in workflow");

  // Execution context - store outputs by node name so subsequent nodes can access
  const context = { input, results: {} };

  // Execute start node: webhook node simply passes input to next node(s)
  context.results[startNode.name] = [{ json: input.body || {}, headers: input.headers || {} }];

  // Depth-first walk using connectionsByNodeName
  const executed = new Set();
  async function executeNodeByName(nodeName) {
    if (!nodeName) return;
    if (executed.has(nodeName)) return;
    const node = findNodeByName(nodeName);
    if (!node) return;
    executed.add(nodeName);

    const inItems = context.results[nodeName] || [{ json: input.body || {} }];
    let outItems = [];

    const type = node.type || node.name || "";
    if (type.includes("webhook")) {
      // nothing to do — pass input
      outItems = inItems;
    } else if (type.includes("respondToWebhook")) {
      // respond with given responseBody; in serverless use this return
      // we support responseBody with simple expression: if it starts with "={{ $json..."
      const respBodyTemplate = node.parameters?.responseBody || "";
      // If responseBody is "={{ $json.output.result }}" we resolve from context
      const firstIn = inItems[0] || { json: {} };
      if (respBodyTemplate && respBodyTemplate.startsWith("={{")) {
        // naive evaluation: replace {{$json.<path>}} patterns — we'll just support $json.output.* and $json.* root
        let body = respBodyTemplate;
        body = body.replace(/=\{\{\s*\$json\.([^\}]+)\s*\}\}/g, (_, path) => {
          const val = path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), firstIn.json);
          return val !== undefined ? (typeof val === "object" ? JSON.stringify(val) : String(val)) : "";
        });
        outItems = [{ json: { body: body } }];
      } else {
        outItems = inItems;
      }
    } else if (type.includes("httpRequest")) {
      // perform HTTP call using node.parameters
      const params = node.parameters || {};
      const url = params.url || params.parameters?.url || "";
      const method = (params.method || "GET").toUpperCase();
      let body = null;
      if (params.specifyBody === "json" && params.jsonBody) {
        // basic template substitution for {{ $json.<path> }}
        const jb = params.jsonBody.replace(/=\{([\s\S]*)\}/, "$1");
        // replace {{ $json.x }} inside
        const firstIn = inItems[0] || { json: {} };
        body = jb.replace(/\{\{\s*\$json\.([^\}]+)\s*\}\}/g, (_, path) => {
          const val = path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), firstIn.json);
          return val !== undefined ? val : "";
        });
        try { body = JSON.parse(body); } catch (e) {}
      }
      // use axios
      const axios = (await import("axios")).default;
      const headers = (params.headerParameters && params.headerParameters.parameters) ? params.headerParameters.parameters.reduce((acc, cur) => { acc[cur.name]=cur.value; return acc; }, {}) : {};
      const res = await axios.request({ url, method, data: body, headers, timeout: 30000 });
      outItems = [{ json: res.data }];
    } else if (type.includes("convertToFile")) {
      // convert base64 from specified source property to an upload link (cloudinary)
      const sourceProperty = node.parameters?.sourceProperty || "body.file.base64";
      const firstIn = inItems[0] || { json: {} };
      // support nested property like body.file.base64
      const parts = sourceProperty.split(".");
      let b64 = parts.reduce((a,c) => (a && a[c] !== undefined ? a[c] : undefined), firstIn.json);
      if (!b64 && firstIn.json.file && firstIn.json.file.base64) b64 = firstIn.json.file.base64;
      if (!b64) throw new Error("No base64 found for convertToFile");
      // upload to Cloudinary
      const upload = await uploadToCloudinary(b64, node.parameters?.options?.fileName || "file.webm");
      outItems = [{ json: upload }];
    } else if (type.includes("wait")) {
      const amount = node.parameters?.amount || 5;
      await sleep((amount || 1) * 1000);
      outItems = inItems;
    } else if (type.includes("code")) {
      // for security reasons we only support two pre-authorized actions here:
      // if node.parameters.jsCode contains "base64" we attempt the binary conversion local simulated behavior
      // For real code nodes we'd need to eval user code — dangerous in serverless.
      outItems = inItems;
    } else if (type.includes("agent") || node.type?.includes("langchain")) {
      // AI agent: call OpenAI (or Gemini wrapper)
      const prompt = node.parameters?.text || JSON.stringify(inItems[0]?.json || "");
      const aiRes = await callOpenAIChat(prompt);
      // put in result
      outItems = [{ json: { output: aiRes?.choices?.[0]?.message?.content || aiRes } }];
    } else {
      // Unknown node: pass through
      outItems = inItems;
    }

    // store results
    context.results[nodeName] = outItems;

    // traverse connections from nodeName => next nodes by name
    const conn = workflow.connections?.[node.name];
    if (conn && conn.main) {
      const mains = conn.main;
      // mains is array of arrays of objects with node name target
      for (const slot of mains) {
        for (const target of slot) {
          const nextNodeName = target.node;
          if (nextNodeName) {
            await executeNodeByName(nextNodeName);
          }
        }
      }
    }
  }

  // Kick off from start node
  await executeNodeByName(startNode.name);

  return { context };
}
