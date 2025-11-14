// api/receive.js
export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Only POST");
  res.status(200).json({ status: "received", data: req.body });
}
