import { readCharterDocumentRecords } from "../../../lib/charter/documentStore.js";

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { id: charterIdParam } = req.query ?? {};
  const charterId = Array.isArray(charterIdParam)
    ? charterIdParam[0]
    : charterIdParam;

  if (!charterId || typeof charterId !== "string") {
    res.status(400).json({ error: "charter_id_required" });
    return;
  }

  try {
    const records = await readCharterDocumentRecords(charterId);
    res.status(200).json({ documents: records });
  } catch (error) {
    console.error("failed to load charter documents", error);
    res.status(500).json({ error: "failed_to_load_documents" });
  }
}
