// lib/helpers.js
import axios from "axios";
import FormData from "form-data";

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function base64ToBuffer(b64) {
  return Buffer.from(b64, "base64");
}

export async function uploadToCloudinary(base64Data, filename = "file.webm") {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars missing");
  }

  const form = new FormData();
  form.append("file", `data:application/octet-stream;base64,${base64Data}`);
  form.append("upload_preset", "unsigned"); // or use a preset you configured
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  const res = await axios.post(url, form, {
    headers: form.getHeaders()
  });
  return res.data;
}

export async function assemblyCreateTranscript(audioUrl) {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("AssemblyAI key missing");
  const res = await axios.post("https://api.assemblyai.com/v2/transcript", {
    audio_url: audioUrl
  }, {
    headers: { Authorization: key, "Content-Type": "application/json" }
  });
  return res.data;
}

export async function assemblyGetTranscript(id) {
  const key = process.env.ASSEMBLYAI_API_KEY;
  const res = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}`, {
    headers: { Authorization: key }
  });
  return res.data;
}

export async function callOpenAIChat(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI key missing");
  const res = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini", // change if needed
    messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: prompt }],
    max_tokens: 1200
  }, {
    headers: { Authorization: `Bearer ${key}` }
  });
  return res.data;
}

// You can add a Gemini wrapper here if you have a proxy or direct API.
