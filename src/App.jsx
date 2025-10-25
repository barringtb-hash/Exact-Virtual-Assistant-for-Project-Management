import React, { useEffect, useRef, useState } from "react";

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

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("File reading failed"));
    reader.readAsDataURL(file);
  });

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
  const [attachments, setAttachments] = useState([]);
  const [charterPreview, setCharterPreview] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [listening, setListening] = useState(false);
  const [rec, setRec] = useState(null);
  const [rtcState, setRtcState] = useState("idle");
  const [activePreview, setActivePreview] = useState("Charter");
  const [useLLM, setUseLLM] = useState(true);
  const [autoExtract, setAutoExtract] = useState(false);
  // voice picker removed; server uses env OPENAI_REALTIME_VOICE
  const fileInputRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const micStreamRef = useRef(null);
  const dataRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const realtimeEnabled = Boolean(import.meta.env.VITE_OPENAI_REALTIME_MODEL);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (autoExtract && attachments.length) {
      runAutoExtract(attachments);
    }
  }, [autoExtract]);

  const rtcStateToLabel = {
    idle: "Idle",
    connecting: "Connecting",
    live: "Live",
    error: "Error",
  };

  const cleanupRealtime = () => {
    if (dataRef.current) {
      try {
        dataRef.current.close();
      } catch (error) {
        console.error("Error closing realtime data channel", error);
      }
      dataRef.current.onmessage = null;
      dataRef.current.onclose = null;
      dataRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch (error) {
        console.error("Error closing realtime peer connection", error);
      }
      pcRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          console.error("Error stopping realtime media track", error);
        }
      });
      micStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const stopRealtime = () => {
    cleanupRealtime();
    setRtcState("idle");
  };

  const startRealtime = async () => {
    if (!realtimeEnabled) return;
    if (rtcState === "connecting" || rtcState === "live") return;
    setRtcState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          console.error("Realtime connection ended", state);
          cleanupRealtime();
          setRtcState("error");
        }
      };

      const dataChannel = pc.createDataChannel("oai-events");
      dataRef.current = dataChannel;

      dataChannel.onmessage = (event) => {
        const payload = event?.data;
        let transcript = "";
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload);
            if (typeof parsed === "string") {
              transcript = parsed;
            } else if (parsed?.transcript) {
              transcript = parsed.transcript;
            } else if (parsed?.text) {
              transcript = parsed.text;
            } else if (Array.isArray(parsed?.alternatives) && parsed.alternatives[0]?.transcript) {
              transcript = parsed.alternatives[0].transcript;
            }
          } catch (error) {
            transcript = payload;
          }
        }
        if (!transcript && payload?.text) {
          transcript = payload.text;
        }
        if (transcript) {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + Math.random(), role: "assistant", text: transcript },
          ]);
        }
      };

      dataChannel.onclose = () => {
        dataRef.current = null;
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch("/api/voice/sdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
      });

      if (!response.ok) {
        throw new Error(`SDP exchange failed with status ${response.status}`);
      }

      const answerSdp = await response.text();
      if (!answerSdp?.trim()) {
        throw new Error("Invalid SDP answer payload");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setRtcState("live");
    } catch (error) {
      console.error("Realtime start failed", error);
      cleanupRealtime();
      setRtcState("error");
    }
  };

  useEffect(() => {
    return () => {
      if (pcRef.current || micStreamRef.current || dataRef.current) {
        stopRealtime();
      }
    };
  }, []);

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
            body: JSON.stringify({ audioBase64, mimeType: (blob.type || "").split(";")[0] }),
          });
          const data = await res.json().catch(() => ({}));
          const transcript = data?.transcript ?? data?.text ?? "";
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

  const addPickedFiles = async (list) => {
    if (!list || !list.length) return;
    const pickedFiles = Array.from(list);
    const baseTimestamp = Date.now();
    const newFiles = pickedFiles.map((f, index) => ({
      id: `${baseTimestamp}-${index}`,
      name: f.name,
      size: prettyBytes(f.size),
      file: f,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    const processedAttachments = [];

    for (const file of pickedFiles) {
      try {
        const base64 = await fileToBase64(file);
        const response = await fetch("/api/files/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            base64,
          }),
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch (err) {
          console.error("Failed to parse /api/files/text response", err);
        }

        if (!response.ok || payload?.ok === false) {
          const message = payload?.error || `Unable to process ${file.name}`;
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + Math.random(),
              role: "assistant",
              text: `Attachment error (${file.name}): ${message}`,
            },
          ]);
          continue;
        }

        processedAttachments.push({
          name: payload?.name || file.name,
          mimeType: payload?.mimeType || file.type,
          text: payload?.text || "",
        });
      } catch (error) {
        const message = error?.message || "Unknown error";
        console.error("addPickedFiles error", error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            role: "assistant",
            text: `Attachment error (${file.name}): ${message}`,
          },
        ]);
      }
    }

    if (processedAttachments.length) {
      let mergedAttachments = null;
      setAttachments((prev) => {
        const merged = [...prev, ...processedAttachments];
        mergedAttachments = merged;
        return merged;
      });
      if (autoExtract && mergedAttachments?.length) {
        runAutoExtract(mergedAttachments);
      }
    }
  };

  const handleFilePick = async (e) => {
    const fileList = e.target?.files ? Array.from(e.target.files) : [];
    if (fileList.length) {
      await addPickedFiles(fileList);
    }
    if (e.target) e.target.value = "";
  };

  const handleRemoveFile = (id) => {
    const removedFile = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (!removedFile) return;

    let nextAttachments = null;
    setAttachments((prev) => {
      const index = prev.findIndex((att) => att.name === removedFile.name);
      if (index === -1) return prev;
      const updated = [...prev.slice(0, index), ...prev.slice(index + 1)];
      nextAttachments = updated;
      return updated;
    });

    if (nextAttachments) {
      if (!nextAttachments.length) {
        setCharterPreview(null);
        setExtractError(null);
      } else if (autoExtract) {
        runAutoExtract(nextAttachments);
      }
    }
  };

  const prettyBytes = (num) => {
    const units = ["B", "KB", "MB", "GB"]; let i = 0; let n = num;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
  };

  async function runAutoExtract(sourceAttachments = attachments) {
    if (!sourceAttachments || !sourceAttachments.length) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const payload = {
        messages: messages.map((m) => ({
          role: m.role,
          content: m.text || "",
          text: m.text || "",
        })),
        attachments: sourceAttachments,
      };

      const response = await fetch("/api/charter/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error("Failed to parse /api/charter/extract response", err);
        throw new Error("Invalid response from charter extractor");
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to extract charter");
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Charter extractor returned unexpected data");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setCharterPreview(data);
    } catch (error) {
      const message = error?.message || "Failed to extract charter";
      console.error("runAutoExtract error", error);
      setExtractError(message);
      setCharterPreview(null);
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <div className="min-h-screen w-full font-sans bg-gradient-to-br from-indigo-100 via-slate-100 to-sky-100 text-slate-800">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/60 border-b border-white/40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-600/90 text-white grid place-items-center font-bold shadow-sm">EX</div>
            <div className="text-slate-700 font-semibold">Exact Sciences Virtual Assistant for Project Management</div>
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
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
                      onDrop={async (e) => {
                        e.preventDefault();
                        const droppedFiles = e.dataTransfer?.files
                          ? Array.from(e.dataTransfer.files)
                          : [];
                        if (droppedFiles.length) {
                          await addPickedFiles(droppedFiles);
                        }
                      }}
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
                    {realtimeEnabled ? (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              rtcState === "live" || rtcState === "connecting"
                                ? stopRealtime()
                                : startRealtime()
                            }
                            className={`shrink-0 p-2 rounded-xl border transition ${
                              rtcState === "live"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                : rtcState === "connecting"
                                  ? "bg-amber-50 border-amber-200 text-amber-600 animate-pulse"
                                  : rtcState === "error"
                                    ? "bg-red-50 border-red-200 text-red-600"
                                    : "bg-white/80 border-white/60 text-slate-600"
                            }`}
                            title={
                              rtcState === "live"
                                ? "Stop realtime voice"
                                : rtcState === "connecting"
                                  ? "Connecting realtime audio…"
                                  : rtcState === "error"
                                    ? "Retry realtime voice"
                                    : "Start realtime voice"
                            }
                          >
                            <IconMic className="h-5 w-5" />
                          </button>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-lg border ${
                              rtcState === "live"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                : rtcState === "connecting"
                                  ? "bg-amber-50 border-amber-200 text-amber-600"
                                  : rtcState === "error"
                                    ? "bg-red-50 border-red-200 text-red-600"
                                    : "bg-white/80 border-white/60 text-slate-600"
                            }`}
                          >
                            {rtcStateToLabel[rtcState] || "Idle"}
                          </span>
                          {rtcState !== "idle" && (
                            <button
                              type="button"
                              onClick={stopRealtime}
                              className="text-xs px-2 py-1 rounded-lg border bg-white/80 border-white/60 text-slate-600 hover:bg-white"
                              title="Reset realtime call"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                      </>
                    ) : (
                      <button
                        onClick={() => (listening ? stopRecording() : startRecording())}
                        className={`shrink-0 p-2 rounded-xl border ${listening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white/80 border-white/60 text-slate-600'} transition`}
                        title="Voice input (mock)"
                      >
                        <IconMic className="h-5 w-5" />
                      </button>
                    )}
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
                      {files.map((f) => (
                        <span key={f.id} className="px-2 py-1 rounded-lg bg-white/80 border border-white/60 text-xs flex items-center gap-2">
                          <IconPaperclip className="h-3 w-3" />
                          <span className="truncate max-w-[160px]">{f.name}</span>
                          <button onClick={() => handleRemoveFile(f.id)} className="ml-1 text-slate-500 hover:text-slate-700">×</button>
                        </span>
                      ))}
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
                <CharterCard data={charterPreview} isLoading={isExtracting} />
                <DDPCard data={charterPreview} isLoading={isExtracting} />
                <RAIDCard data={charterPreview} isLoading={isExtracting} />
                {isExtracting && (
                  <div className="text-xs text-slate-500">Extracting charter insights…</div>
                )}
              </div>
              {extractError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {extractError}
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-4">
                <div className="text-sm font-semibold mb-2">Required Fields</div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-slate-700"><span className="text-emerald-600"><IconCheck className="h-4 w-4" /></span> Sponsor</li>
                  <li className="flex items-center gap-2 text-slate-700"><span className="text-emerald-600"><IconCheck className="h-4 w-4" /></span> Problem Statement</li>
                  <li className="flex items-center gap-2 text-slate-700"><span className="text-amber-600"><IconAlert className="h-4 w-4" /></span> Milestones</li>
                </ul>
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

function CharterCard({ data, isLoading }) {
  const timeline = [];
  if (data?.start_date) timeline.push(`Start: ${data.start_date}`);
  if (data?.end_date) timeline.push(`End: ${data.end_date}`);

  return (
    <div>
      <div className="text-sm font-semibold mb-2">Project Charter</div>
      <Field label="Project Title" value={data?.project_name} isLoading={isLoading} />
      <Field label="Sponsor" value={data?.sponsor} isLoading={isLoading} />
      <Field label="Project Lead" value={data?.project_lead} isLoading={isLoading} />
      <Field label="Problem Statement" value={data?.problem} lines={2} isLoading={isLoading} />
      <Field label="Timeline" value={timeline.join(" • ")} isLoading={isLoading} />
    </div>
  );
}

function DDPCard({ data, isLoading }) {
  const scopeItems = [];
  if (Array.isArray(data?.scope_in) && data.scope_in.length) {
    scopeItems.push(...data.scope_in.map((item) => `In Scope: ${item}`));
  }
  if (Array.isArray(data?.scope_out) && data.scope_out.length) {
    scopeItems.push(...data.scope_out.map((item) => `Out of Scope: ${item}`));
  }

  const successMetrics = Array.isArray(data?.success_metrics)
    ? data.success_metrics
        .map((metric) => {
          const parts = [metric?.benefit, metric?.metric, metric?.system_of_measurement]
            .filter(Boolean)
            .join(" • ");
          return parts || null;
        })
        .filter(Boolean)
    : [];

  const milestoneItems = Array.isArray(data?.milestones)
    ? data.milestones
        .map((item) => {
          const parts = [item?.phase, item?.deliverable, item?.date].filter(Boolean).join(" • ");
          return parts || null;
        })
        .filter(Boolean)
    : [];

  return (
    <div>
      <div className="text-sm font-semibold mb-2">Design & Development Plan</div>
      <Field label="Objectives" value={data?.vision} lines={2} isLoading={isLoading} />
      <Field label="Scope" value={scopeItems} lines={2} isLoading={isLoading} />
      <Field label="Verification Strategy" value={successMetrics} lines={2} isLoading={isLoading} />
      <Field label="Milestones" value={milestoneItems} lines={2} isLoading={isLoading} />
    </div>
  );
}

function RAIDCard({ data, isLoading }) {
  const riskItems = Array.isArray(data?.risks) ? data.risks.filter(Boolean) : [];
  const assumptionItems = Array.isArray(data?.assumptions) ? data.assumptions.filter(Boolean) : [];
  const coreTeamItems = Array.isArray(data?.core_team)
    ? data.core_team
        .map((member) => {
          const parts = [member?.name, member?.role, member?.responsibilities]
            .filter(Boolean)
            .join(" • ");
          return parts || null;
        })
        .filter(Boolean)
    : [];

  const descriptionItems = data?.description ? [data.description] : [];

  return (
    <div>
      <div className="text-sm font-semibold mb-2">RAID Log Snapshot</div>
      <Field label="Risks" value={riskItems} lines={2} isLoading={isLoading} />
      <Field label="Assumptions" value={assumptionItems} lines={2} isLoading={isLoading} />
      <Field label="Core Team" value={coreTeamItems} lines={2} isLoading={isLoading} />
      <Field label="Notes" value={descriptionItems} lines={2} isLoading={isLoading} />
    </div>
  );
}

function Field({ label, value, lines = 1, isLoading }) {
  const isArray = Array.isArray(value);
  const arrayItems = isArray ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  const stringValue = !isArray && typeof value === "string" ? value.trim() : "";
  const hasContent = arrayItems.length > 0 || stringValue;
  const heightClass = lines > 1 ? "min-h-[80px]" : "min-h-[36px]";

  return (
    <div className="mb-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {hasContent ? (
        <div className="rounded-xl border border-white/70 bg-white/90">
          {arrayItems.length > 0 ? (
            <ul className="list-disc space-y-1 px-4 py-3 text-sm text-slate-700">
              {arrayItems.map((item, idx) => (
                <li key={`${label}-${idx}`} className="whitespace-pre-wrap">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">{stringValue}</div>
          )}
        </div>
      ) : (
        <div
          className={`rounded-xl bg-white/60 border border-white/60 ${heightClass} overflow-hidden`}
        >
          <div
            className={`h-full w-full ${
              isLoading
                ? "animate-pulse bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100"
                : "bg-white/40"
            }`}
          />
        </div>
      )}
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
