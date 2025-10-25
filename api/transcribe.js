// ... existing imports and ALLOWED_MIME_TYPES/EXT_BY_MIME definitions remain ...

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        const { audioBase64, mimeType } = req.body || {};

        if (typeof audioBase64 !== "string" || audioBase64.trim() === "") {
            res.status(400).json({ error: "Invalid audio payload" });
            return;
        }

+       // Normalize mimeType: strip any codec suffix (e.g., "audio/mp4;codecs=mp4a.40.2")
+       const rawMimeType = mimeType || "";
+       const baseMimeType = rawMimeType.split(";")[0].trim().toLowerCase();

-       if (!ALLOWED_MIME_TYPES.has(mimeType)) {
-           res.status(400).json({ error: "Unsupported audio format", mimeType });
+       // Check against the base type instead of the raw string
+       if (!ALLOWED_MIME_TYPES.has(baseMimeType)) {
+           res.status(400).json({ error: "Unsupported audio format", mimeType: rawMimeType });
            return;
        }

        let audioBuffer;
        try {
            audioBuffer = Buffer.from(audioBase64, "base64");
        } catch {
            res.status(400).json({ error: "Unable to decode audio" });
            return;
        }

        if (!audioBuffer || audioBuffer.length === 0) {
            res.status(400).json({ error: "Empty audio data" });
            return;
        }

-       const extension = EXT_BY_MIME[mimeType] || "mp4";
-       const file = await toFile(audioBuffer, `audio.${extension}`, { type: mimeType });
+       // Use the normalized baseMimeType for file extension and content type
+       const extension = EXT_BY_MIME[baseMimeType] || "mp4";
+       const file = await toFile(audioBuffer, `audio.${extension}`, { type: baseMimeType });

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

        const result = await client.audio.transcriptions.create({
            file,
            model: STT_MODEL
        });

        const transcript = result?.text || "";

        res.status(200).json({
            text: transcript,
            transcript
        });
    } catch (error) {
        console.error("/api/transcribe error", error);
        res.status(500).json({ error: "Failed to transcribe audio" });
    }
}
