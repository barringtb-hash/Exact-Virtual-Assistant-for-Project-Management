import React, { useCallback, useEffect, useRef, useState } from "react";
import charterMapping from "../mappings/charter.json";
import ddpMapping from "../mappings/ddp.json";
import raidMapping from "../mappings/raid.json";

// --- Tiny inline icons (no external deps) ---
const IconUpload = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M12 16V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
  </svg>
);
const IconPaperclip = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M21.44 11.05L12 20.5a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.17 18.17" />
  </svg>
);
const IconSend = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);
const IconMic = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </svg>
);
const IconPlus = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const DOCUMENT_KEYS = ["charter", "ddp", "raid"];
const DOCUMENT_CONFIGS = {
  charter: { title: "Project Charter", mapping: charterMapping },
  ddp: { title: "Design & Development Plan", mapping: ddpMapping },
  raid: { title: "RAID Log Snapshot", mapping: raidMapping }
};

const createDocStateFromMapping = (mapping = []) => ({
  fields: mapping.map(({ label, required }) => ({ label, required: Boolean(required), value: "", source: null })),
  missingRequired: mapping.filter((field) => field.required).map((field) => field.label)
});

const createInitialDocState = () =>
  DOCUMENT_KEYS.reduce((acc, key) => {
    acc[key] = createDocStateFromMapping(DOCUMENT_CONFIGS[key]?.mapping);
    return acc;
  }, {});

// --- Seed messages ---
const seedMessages = [
  { id: 1, role: "assistant", text: "Hi! Attach files or paste in scope details. I’ll draft a Project Charter and DDP and ask quick follow‑ups for anything missing." },
  { id: 2, role: "assistant", text: "Who’s the Sponsor?" },
  { id: 3, role: "assistant", text: "Does this require approvals?" },
];

export default function ExactVirtualAssistantPM() {
  const [messages, setMessages] = useState(seedMessages);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [listening, setListening] = useState(false);
  const [rec, setRec] = useState(null);
  const [activePreview, setActivePreview] = useState("Charter");
  const [useLLM, setUseLLM] = useState(true);
  const [autoExtract, setAutoExtract] = useState(false);
  const [documentResults, setDocumentResults] = useState(() => createInitialDocState());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);
  const lastAnalysisRef = useRef({ text: "", useLLM: true });

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result.split(",")[1] || "");
        } else {
          reject(new Error("Unexpected FileReader result"));
        }
      };
      reader.onerror = () => reject(reader.error || new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

  const startRecording = async () => {
    if (rec) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported
          ? MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : ""
          : "";
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || preferredMime || "audio/webm" });
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64, mimeType: blob.type }),
          });
          const data = await res.json().catch(() => ({}));
          const transcript = data?.transcript || "";
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (error) {
          console.error("Transcription failed", error);
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          setRec(null);
          setListening(false);
        }
      };

      recorder.start();
      setRec(recorder);
      setListening(true);
    } catch (error) {
      console.error("Microphone access denied", error);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setRec(null);
      setListening(false);
    }
  };

  const stopRecording = () => {
    if (!rec) return;
    try {
      rec.stop();
      rec.stream?.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Error stopping recorder", error);
    } finally {
      setRec(null);
      setListening(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { id: Date.now(), role: "user", text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    let reply = "";
    if (useLLM) {
      try { reply = await callLLM(text, nextHistory); }
      catch (e) { reply = "LLM error (demo): " + (e?.message || "unknown"); }
    } else {
      reply = mockAssistantReply(text);
    }
    setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", text: reply }]);
  };

  const prettyBytes = (num) => {
    const units = ["B", "KB", "MB", "GB"]; let i = 0; let n = num;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
  };

  const uploadAndParseFile = useCallback(async (fileWrapper) => {
    if (!fileWrapper?.file) return "";

    const updateFile = (patch) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileWrapper.id ? { ...f, ...patch } : f))
      );
    };

    try {
      updateFile({ status: "uploading", error: null });

      const formData = new FormData();
      formData.append("file", fileWrapper.file, fileWrapper.name);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        throw new Error(uploadJson?.error || "Upload failed");
      }

      const { fileId, metadata } = uploadJson;
      updateFile({ metadata: metadata || null, status: "parsing" });

      const parseRes = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId })
      });
      const parseJson = await parseRes.json().catch(() => ({}));
      if (!parseRes.ok) {
        throw new Error(parseJson?.error || "Parsing failed");
      }

      const rawDocument = parseJson.rawDocument || { text: "" };
      updateFile({
        metadata: parseJson.metadata || metadata || null,
        rawDocument,
        rawText: rawDocument.text || "",
        status: "parsed",
        error: null
      });
      lastAnalysisRef.current.text = "";
      return rawDocument.text || "";
    } catch (error) {
      console.error("Auto-extract failed", error);
      updateFile({ status: "error", error: error?.message || "Extraction failed" });
      return "";
    }
  }, [setFiles]);

  const runAutoExtract = useCallback(async (targets = []) => {
    const queue = Array.isArray(targets) ? targets : [];
    for (const wrapper of queue) {
      if (!wrapper?.file) continue;
      if (wrapper.status === "uploading" || wrapper.status === "parsing") continue;
      if (wrapper.status === "parsed" && wrapper.rawText) continue;
      await uploadAndParseFile(wrapper);
    }
  }, [uploadAndParseFile]);

  const addPickedFiles = (list) => {
    if (!list || !list.length) return;
    const stamp = Date.now();
    const newFiles = Array.from(list).map((f, index) => ({
      id: `${stamp}-${index}`,
      name: f.name,
      size: prettyBytes(f.size),
      file: f,
      status: "pending",
      metadata: null,
      rawDocument: null,
      rawText: "",
      error: null
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    lastAnalysisRef.current.text = "";
    if (autoExtract) {
      setTimeout(() => runAutoExtract(newFiles), 0);
    }
  };

  const handleFilePick = (e) => {
    addPickedFiles(e.target.files);
    if (e.target) e.target.value = "";
  };

  const handleRemoveFile = (id) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (!next.some((file) => file.rawText)) {
        setDocumentResults(createInitialDocState());
        setIsAnalyzing(false);
      }
      lastAnalysisRef.current = { text: "", useLLM };
      return next;
    });
  };

  useEffect(() => {
    if (!autoExtract) return;
    const pending = files.filter(
      (file) =>
        file.file &&
        !file.rawText &&
        file.status !== "uploading" &&
        file.status !== "parsing"
    );
    if (pending.length) {
      runAutoExtract(pending);
    }
  }, [autoExtract, files, runAutoExtract]);

  const analyzeCombinedText = useCallback(async (combinedText) => {
    setIsAnalyzing(true);
    try {
      const nextState = {};
      for (const key of DOCUMENT_KEYS) {
        try {
          const res = await fetch(`/api/analyze/${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawDocument: { text: combinedText }, useLLM })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `Failed to analyze ${key}`);
          }
          nextState[key] = {
            fields: Array.isArray(data.fields) ? data.fields : createDocStateFromMapping(DOCUMENT_CONFIGS[key]?.mapping).fields,
            missingRequired: Array.isArray(data.missingRequired) ? data.missingRequired : []
          };
        } catch (err) {
          console.error(`/api/analyze/${key} error`, err);
          nextState[key] = createDocStateFromMapping(DOCUMENT_CONFIGS[key]?.mapping);
        }
      }
      setDocumentResults(nextState);
      lastAnalysisRef.current = { text: combinedText, useLLM };
    } finally {
      setIsAnalyzing(false);
    }
  }, [setDocumentResults, useLLM]);

  useEffect(() => {
    if (!autoExtract) return;
    const hasActive = files.some((file) => file.status === "uploading" || file.status === "parsing");
    if (hasActive) return;

    const combined = files
      .map((file) => (file.rawText || "").trim())
      .filter(Boolean)
      .join("\n\n");

    if (!combined) {
      if (lastAnalysisRef.current.text) {
        setDocumentResults(createInitialDocState());
        setIsAnalyzing(false);
        lastAnalysisRef.current = { text: "", useLLM };
      }
      return;
    }

    if (
      combined === lastAnalysisRef.current.text &&
      lastAnalysisRef.current.useLLM === useLLM
    ) {
      return;
    }

    analyzeCombinedText(combined);
  }, [autoExtract, files, useLLM, analyzeCombinedText]);

  return (
    <div className="min-h-screen w-full font-sans bg-gradient-to-br from-indigo-100 via-slate-100 to-sky-100 text-slate-800">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/60 border-b border-white/40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-600/90 text-white grid place-items-center font-bold shadow-sm">EX</div>
            <div className="text-slate-700 font-semibold">Exact Virtual Assistant for Project Management</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800">New Draft</button>
            <div className="px-3 py-1.5 rounded-xl bg-white/70 border border-white/50 text-sm shadow-sm">Guest</div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl px-3 sm:px-4 py-4 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          {/* Center Chat */}
          <section className="lg:col-span-8">
            <Panel title="Assistant Chat" right={<button className="p-1.5 rounded-lg hover:bg-white/60 border border-white/50"><IconPlus className="h-4 w-4" /></button>}>
              <div className="flex flex-col h-[480px] rounded-2xl border border-white/50 bg-white/60 backdrop-blur overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((m) => (
                    <ChatBubble key={m.id} role={m.role} text={m.text} />
                  ))}
                </div>
                <div className="border-t border-white/50 p-3">
                  <input type="file" multiple ref={fileInputRef} onChange={handleFilePick} className="hidden" />
                  <div className={`flex items-end gap-2 rounded-2xl bg-white/70 border border-white/60 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-300`}>
                    <textarea
                      placeholder="Type here… (paste scope or attach files)"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) { addPickedFiles(e.dataTransfer.files); } }}
                      onDragOver={(e) => e.preventDefault()}
                      className="min-h-[44px] max-h-40 flex-1 bg-transparent outline-none resize-none text-[15px] leading-6"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 p-2 rounded-xl border bg-white/80 border-white/60 text-slate-600"
                      title="Attach files"
                    >
                      <IconUpload className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => (listening ? stopRecording() : startRecording())}
                      className={`shrink-0 p-2 rounded-xl border ${listening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white/80 border-white/60 text-slate-600'} transition`}
                      title="Voice input (mock)"
                    >
                      <IconMic className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleSend}
                      className="shrink-0 p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                      title="Send"
                    >
                      <IconSend className="h-5 w-5" />
                    </button>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {files.map((f) => {
                        const statusLabelMap = {
                          pending: "Pending",
                          uploading: "Uploading…",
                          parsing: "Parsing…",
                          parsed: "Parsed",
                          error: "Failed"
                        };
                        const statusLabel = statusLabelMap[f.status] || "Pending";
                        const statusClass =
                          f.status === "parsed"
                            ? "text-emerald-600"
                            : f.status === "error"
                              ? "text-rose-500"
                              : f.status === "pending"
                                ? "text-slate-500"
                                : "text-indigo-500";
                        return (
                          <div
                            key={f.id}
                            className={["px-2 py-1 rounded-lg bg-white/80 border border-white/60", "text-xs flex flex-col gap-0.5 min-w-[160px] max-w-[220px]"].join(" ")}
                          >
                            <div className="flex items-center gap-2">
                              <IconPaperclip className="h-3 w-3" />
                              <span className="truncate flex-1">{f.name}</span>
                              <button
                                onClick={() => handleRemoveFile(f.id)}
                                className="ml-1 text-slate-500 hover:text-slate-700"
                              >
                                ×
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span>{f.size}</span>
                              <span className={`font-medium ${statusClass}`}>{statusLabel}</span>
                            </div>
                            {f.error && <div className="text-[10px] text-rose-500">{f.error}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {listening && (
                    <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Recording… (simulated)
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </section>

          {/* Right Preview */}
          <aside className="lg:col-span-4">
            <Panel title="Preview">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs bg-white/70 border border-white/60 rounded-xl px-2 py-1">
                  <input type="checkbox" checked={useLLM} onChange={(e)=>setUseLLM(e.target.checked)} />
                  <span>Use LLM (beta)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs bg-white/70 border border-white/60 rounded-xl px-2 py-1">
                  <input type="checkbox" checked={autoExtract} onChange={(e)=>setAutoExtract(e.target.checked)} />
                  <span>Auto‑extract (beta)</span>
                </label>
                {autoExtract && (
                  <span className={`text-xs ${isAnalyzing ? 'text-indigo-600 animate-pulse' : 'text-slate-500'}`}>
                    {isAnalyzing ? 'Analyzing…' : 'Auto-extract up to date'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {['Charter','DDP','RAID'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActivePreview(tab)}
                    className={`px-3 py-1.5 rounded-xl text-sm border ${activePreview===tab? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 border-white/60'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white/70 border border-white/60 p-4 space-y-4">
                {activePreview === 'Charter' && <CharterCard data={documentResults.charter} />}
                {activePreview === 'DDP' && <DDPCard data={documentResults.ddp} />}
                {activePreview === 'RAID' && <RAIDCard data={documentResults.raid} />}
              </div>

              <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-4">
                <div className="text-sm font-semibold mb-2">Required Fields</div>
                <RequiredFieldsSummary documents={documentResults} />
              </div>
            </Panel>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500">Phase 1 • Minimal viable UI • No data is saved</footer>
    </div>
  );
}

function Panel({ title, icon, right, children }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/50 backdrop-blur shadow-sm p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          {icon && <span className="text-slate-500">{icon}</span>}
          <span>{title}</span>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-6 shadow-sm border ${isUser ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 border-white/60'}`}>
        {text}
      </div>
    </div>
  );
}

function CharterCard({ data }) {
  return <DocumentCard title={DOCUMENT_CONFIGS.charter.title} data={data} />;
}

function DDPCard({ data }) {
  return <DocumentCard title={DOCUMENT_CONFIGS.ddp.title} data={data} />;
}

function RAIDCard({ data }) {
  return <DocumentCard title={DOCUMENT_CONFIGS.raid.title} data={data} />;
}

function DocumentCard({ title, data }) {
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const missing = new Set(data?.missingRequired || []);
  return (
    <div>
      <div className="text-sm font-semibold mb-2 flex items-center justify-between">
        <span>{title}</span>
        {fields.length > 0 && (
          missing.size > 0 ? (
            <span className="text-[11px] text-amber-600">{missing.size} required missing</span>
          ) : (
            <span className="text-[11px] text-emerald-600 flex items-center gap-1">
              <IconCheck className="h-3 w-3" />
              <span>All required captured</span>
            </span>
          )
        )}
      </div>
      {fields.length ? (
        fields.map((field) => (
          <Field
            key={field.label}
            label={field.label}
            value={field.value}
            required={field.required}
            isMissing={missing.has(field.label)}
          />
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-white/60 bg-white/40 px-3 py-4 text-xs text-slate-500">
          Attach documents and enable Auto-extract to populate this template.
        </div>
      )}
    </div>
  );
}

function Field({ label, value, required, isMissing }) {
  const hasValue = Boolean(value && value.trim());
  const displayValue = hasValue
    ? value.trim()
    : required
      ? "Missing required information"
      : "No data extracted yet";
  const containerClasses = [
    "rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap min-h-[44px]",
    hasValue
      ? "bg-white text-slate-700 border-white/60"
      : isMissing
        ? "border-rose-300 bg-rose-50/80 text-rose-700"
        : "bg-white/60 border-white/60 text-slate-400 italic"
  ].join(" ");
  return (
    <div className="mb-3">
      <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
        <span>{label}</span>
        {required && (
          <span className={`uppercase tracking-wide text-[10px] ${isMissing ? 'text-rose-500' : 'text-emerald-500'}`}>
            {isMissing ? "Required" : "Complete"}
          </span>
        )}
      </div>
      <div className={containerClasses}>{displayValue}</div>
    </div>
  );
}

function RequiredFieldsSummary({ documents }) {
  return (
    <div className="space-y-3">
      {DOCUMENT_KEYS.map((key) => {
        const config = DOCUMENT_CONFIGS[key];
        const doc = documents?.[key] || createDocStateFromMapping(config?.mapping);
        const requiredFields = (doc.fields || []).filter((field) => field.required);
        if (!requiredFields.length) return null;
        return (
          <div key={key}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{config.title}</div>
            <ul className="space-y-1 text-sm">
              {requiredFields.map((field) => {
                const missing = doc.missingRequired?.includes(field.label);
                return (
                  <li key={field.label} className="flex items-center gap-2">
                    <span className={missing ? "text-amber-600" : "text-emerald-600"}>
                      {missing ? <IconAlert className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                    </span>
                    <span className={missing ? "text-slate-700" : "text-slate-600"}>{field.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// --- Mock assistant logic ---
function mockAssistantReply(text) {
  const lower = text.toLowerCase();
  if (lower.includes("sponsor")) return "Great — I’ll set the Sponsor field and add them as an approver.";
  if (lower.includes("milestone")) return "Captured. I’ll reflect these in the Charter and DDP timelines.";
  if (lower.includes("scope")) return "Thanks! I’ll parse scope and map to templates. Anything else to add?";
  return "Got it. I’ll incorporate that into the draft. (Note: this is a UI‑only prototype for Phase 1)";
}

// --- LLM wiring (placeholder) ---
async function callLLM(text, history = []) {
  try {
    const normalizedHistory = Array.isArray(history)
      ? history.map((item) => ({ role: item.role, content: item.text || "" }))
      : [];
    const systemMessage = {
      role: "system",
      content:
        "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff."
    };
    const payload = {
      messages: [systemMessage, ...normalizedHistory.slice(-19)]
    };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.reply || "";
  } catch (e) {
    return "OpenAI endpoint error: " + (e?.message || "unknown");
  }
}
