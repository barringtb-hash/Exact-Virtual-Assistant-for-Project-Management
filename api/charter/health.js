export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const hasSecret = Boolean(process.env.FILES_LINK_SECRET);
  return res.status(200).json({ ok: true, hasSecret });
}
