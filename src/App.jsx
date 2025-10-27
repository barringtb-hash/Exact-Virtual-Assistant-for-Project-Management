import React, { useEffect, useRef, useState } from "react";
import AssistantFeedbackTemplate from "./components/AssistantFeedbackTemplate";
import getBlankCharter from "./utils/getBlankCharter";

const THEME_STORAGE_KEY = "eva-theme-mode";

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
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingExportLinks, setIsGeneratingExportLinks] = useState(false);
  const [listening, setListening] = useState(false);
  const [rec, setRec] = useState(null);
  const [rtcState, setRtcState] = useState("idle");
  const [activePreview, setActivePreview] = useState("Charter");
  const [useLLM, setUseLLM] = useState(true);
  const [autoExtract, setAutoExtract] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const mode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
    const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = mode === "dark" || (mode === "auto" && prefersDark);
    return useDark ? "dark" : "light";
  });
  const shareLinksHealthRef = useRef({ status: "unknown" });
  const shareLinksWarningPostedRef = useRef(false);
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
  }, [messages, isAssistantThinking]);

  useEffect(() => {
    if (autoExtract && attachments.length) {
      runAutoExtract(attachments);
    }
  }, [autoExtract]);

  const handleThemeModeChange = (value) => {
    if (value === "light" || value === "dark" || value === "auto") {
      setThemeMode(value);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const applyTheme = (mode) => {
      const useDark = mode === "dark" || (mode === "auto" && mediaQuery ? mediaQuery.matches : false);
      document.documentElement.classList.toggle("dark", useDark);
      document.documentElement.style.colorScheme = useDark ? "dark" : "light";
      setResolvedTheme(useDark ? "dark" : "light");
    };

    applyTheme(themeMode);

    const handleSchemeChange = () => {
      if (themeMode === "auto") {
        applyTheme("auto");
      }
    };

    if (!mediaQuery) {
      return undefined;
    }

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSchemeChange);
      return () => mediaQuery.removeEventListener("change", handleSchemeChange);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleSchemeChange);
      return () => mediaQuery.removeListener(handleSchemeChange);
    }

    return undefined;
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const rtcStateToLabel = {
    idle: "Idle",
    connecting: "Connecting",
    live: "Live",
    error: "Error",
  };

  const appendAssistantMessage = (text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role: "assistant", text: safeText },
    ]);
  };

  const appendUserMessageToChat = (text) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return null;
    const entry = { id: Date.now() + Math.random(), role: "user", text: safeText };
    setMessages((prev) => [...prev, entry]);
    return entry;
  };

  const shareLinksNotConfiguredMessage =
    "Share links aren’t configured yet. Ask your admin to set EVA_SHARE_SECRET.";

  const formatValidationErrorsForChat = (errors = []) => {
    if (!Array.isArray(errors) || errors.length === 0) {
      return [
        "I couldn’t validate the project charter. Please review the required fields in the Design & Development Plan.",
      ];
    }

    return errors
      .map((error) => {
        const rawPath = typeof error?.instancePath === "string" ? error.instancePath : error?.path;
        const cleanedPath = rawPath ? rawPath.replace(/^\//, "").replace(/\//g, " › ") : "";
        const message = error?.message || "needs attention.";
        return cleanedPath ? `${cleanedPath} – ${message}` : message;
      })
      .filter(Boolean);
  };

  const extractValidationErrorsFromPayload = (payload) => {
    if (!payload || typeof payload !== "object") {
      return [];
    }

    const { errors } = payload;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const message =
            typeof item.message === "string"
              ? item.message
              : typeof item.detail === "string"
              ? item.detail
              : undefined;

          if (!message) {
            return null;
          }

          const instancePath =
            typeof item.instancePath === "string"
              ? item.instancePath
              : typeof item.path === "string"
              ? item.path
              : "";

          return { instancePath, message };
        })
        .filter(Boolean);
    }

    const detailMessages = payload?.error?.details;
    if (Array.isArray(detailMessages)) {
      return detailMessages
        .map((message) =>
          typeof message === "string" && message.trim()
            ? { message: message.trim() }
            : null
        )
        .filter(Boolean);
    }

    if (typeof detailMessages === "string" && detailMessages.trim()) {
      return [{ message: detailMessages.trim() }];
    }

    return [];
  };

  const postValidationErrorsToChat = (
    errors = [],
    { heading } = {}
  ) => {
    const bulletLines = formatValidationErrorsForChat(errors);
    const intro =
      heading ||
      "I couldn’t validate the project charter. Please review the following:";
    const message = [intro, ...bulletLines.map((line) => `- ${line}`)].join("\n");
    appendAssistantMessage(message);
  };

  const validateCharter = async () => {
    if (!charterPreview) {
      return {
        ok: false,
        errors: [
          { message: "No charter data available. Generate a draft before exporting." },
        ],
      };
    }

    let response;
    try {
      response = await fetch("/api/charter/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charterPreview),
      });
    } catch (error) {
      console.error("Unable to reach /api/charter/validate", error);
      return {
        ok: false,
        errors: [
          { message: "Unable to validate the charter. Please try again." },
        ],
        cause: error,
      };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error("Failed to parse /api/charter/validate response", parseError);
    }

    if (!response.ok || payload?.ok !== true) {
      const structuredErrors = extractValidationErrorsFromPayload(payload);

      if (structuredErrors.length === 0) {
        structuredErrors.push({
          message:
            payload?.error ||
            payload?.message ||
            "Charter validation failed. Please review the Required Fields in the Design & Development Plan.",
        });
      }

      return { ok: false, errors: structuredErrors, payload };
    }

    return { ok: true, payload };
  };

  const getShareLinksHealth = async () => {
    const cachedStatus = shareLinksHealthRef.current?.status;
    if (cachedStatus === "missing") {
      return { ok: true, hasSecret: false, cached: true };
    }
    if (cachedStatus === "available") {
      return { ok: true, hasSecret: true, cached: true };
    }

    try {
      const response = await fetch("/api/charter/health", { method: "GET" });
      let payload = {};
      try {
        payload = (await response.json()) ?? {};
      } catch (parseError) {
        console.error("Failed to parse /api/charter/health response", parseError);
      }

      if (!response.ok) {
        return { ok: false, status: response.status, payload };
      }

      const hasSecret = Boolean(payload?.hasSecret);
      shareLinksHealthRef.current = {
        status: hasSecret ? "available" : "missing",
      };

      return { ok: true, hasSecret };
    } catch (error) {
      console.error("/api/charter/health request failed", error);
      return { ok: false, error };
    }
  };

  const checkShareLinksConfigured = async () => {
    const result = await getShareLinksHealth();
    if (result?.ok && result.hasSecret === false && !shareLinksWarningPostedRef.current) {
      appendAssistantMessage(shareLinksNotConfiguredMessage);
      shareLinksWarningPostedRef.current = true;
    }
    return result;
  };

  const makeShareLinksAndReply = async ({
    baseName = "Project_Charter",
    includeDocx = true,
    includePdf = true,
    introText,
  } = {}) => {
    const validation = await validateCharter();
    if (!validation.ok) {
      postValidationErrorsToChat(validation.errors);
      return { ok: false, reason: "validation" };
    }

    let response;
    try {
      response = await fetch("/api/charter/make-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charter: charterPreview, baseName }),
      });
    } catch (networkError) {
      console.error("/api/charter/make-link network error", networkError);
      appendAssistantMessage(
        "Export link error: Unable to create export links right now. Please try again shortly."
      );
      await checkShareLinksConfigured();
      return { ok: false, reason: "network", error: networkError };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error("Failed to parse /api/charter/make-link response", parseError);
    }

    if (!response.ok) {
      const validationErrors = extractValidationErrorsFromPayload(payload);
      if (validationErrors.length > 0) {
        postValidationErrorsToChat(validationErrors, {
          heading:
            "Export link error: I couldn’t validate the project charter. Please review the following:",
        });
        await checkShareLinksConfigured();

        return {
          ok: false,
          reason: "validation",
          status: response.status,
          payload,
          errors: validationErrors,
        };
      }

      const fallbackMessage =
        payload?.error?.message ||
        payload?.message ||
        "Unable to create export links right now.";

      appendAssistantMessage(`Export link error: ${fallbackMessage}`);
      await checkShareLinksConfigured();

      return { ok: false, reason: "http", status: response.status, payload };
    }

    const docxLink = payload?.docx;
    const pdfLink = payload?.pdf;

    const lines = [];
    if (includeDocx) {
      if (!docxLink) {
        appendAssistantMessage("Export link error: The DOCX link was missing from the response.");
        return { ok: false, reason: "missing-docx" };
      }
      lines.push(`- [Download DOCX](${docxLink})`);
    }
    if (includePdf) {
      if (!pdfLink) {
        appendAssistantMessage("Export link error: The PDF link was missing from the response.");
        return { ok: false, reason: "missing-pdf" };
      }
      lines.push(`- [Download PDF](${pdfLink})`);
    }

    if (lines.length === 0) {
      appendAssistantMessage("Export link error: No formats were requested.");
      return { ok: false, reason: "no-formats" };
    }

    const safeBaseName = baseName || "Project_Charter";
    const heading = introText || `Here are your export links for ${safeBaseName}:`;
    const message = `${heading}\n${lines.join("\n")}`;
    appendAssistantMessage(message);

    return { ok: true, links: { docx: docxLink, pdf: pdfLink } };
  };

  const generateBlankCharter = async ({ baseName = defaultShareBaseName } = {}) => {
    if (isGeneratingExportLinks || isExportingDocx || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsGeneratingExportLinks(true);
    try {
      let response;
      try {
        response = await fetch("/api/charter/make-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ charter: getBlankCharter(), baseName }),
        });
      } catch (networkError) {
        console.error("/api/charter/make-link network error (blank charter)", networkError);
        appendAssistantMessage(
          "Blank charter error: Unable to create download links right now. Please try again shortly."
        );
        await checkShareLinksConfigured();
        return { ok: false, reason: "network", error: networkError };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        console.error("Failed to parse /api/charter/make-link response (blank charter)", parseError);
      }

      if (!response.ok) {
        const validationErrors = extractValidationErrorsFromPayload(payload);
        if (validationErrors.length > 0) {
          postValidationErrorsToChat(validationErrors, {
            heading:
              "Blank charter error: I couldn’t validate the project charter. Please review the following:",
          });
          await checkShareLinksConfigured();
          return {
            ok: false,
            reason: "validation",
            status: response.status,
            payload,
            errors: validationErrors,
          };
        }

        const fallbackMessage =
          payload?.error?.message || payload?.message || "Unable to create download links right now.";
        appendAssistantMessage(`Blank charter error: ${fallbackMessage}`);
        await checkShareLinksConfigured();
        return { ok: false, reason: "http", status: response.status, payload };
      }

      const docxLink = payload?.docx;
      const pdfLink = payload?.pdf;

      if (!docxLink) {
        appendAssistantMessage("Blank charter error: The DOCX link was missing from the response.");
        await checkShareLinksConfigured();
        return { ok: false, reason: "missing-docx" };
      }
      if (!pdfLink) {
        appendAssistantMessage("Blank charter error: The PDF link was missing from the response.");
        await checkShareLinksConfigured();
        return { ok: false, reason: "missing-pdf" };
      }

      const safeBaseName = baseName || "Project_Charter";
      const lines = [`- [Download DOCX](${docxLink})`, `- [Download PDF](${pdfLink})`];
      const message = `Here’s a blank charter for ${safeBaseName}:\n${lines.join("\n")}`;
      appendAssistantMessage(message);

      return { ok: true, links: { docx: docxLink, pdf: pdfLink } };
    } finally {
      setIsGeneratingExportLinks(false);
    }
  };

  const exportDocxViaChat = async (baseName = "Project_Charter") => {
    if (isExportingDocx || isGeneratingExportLinks || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsExportingDocx(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: true,
        includePdf: false,
        introText: `Here’s your DOCX download for ${baseName}:`,
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  const exportPdfViaChat = async (baseName = "Project_Charter") => {
    if (isExportingPdf || isGeneratingExportLinks || isExportingDocx) {
      return { ok: false, reason: "busy" };
    }

    setIsExportingPdf(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: false,
        includePdf: true,
        introText: `Here’s your PDF download for ${baseName}:`,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const shareLinksViaChat = async (baseName = "Project_Charter") => {
    if (isGeneratingExportLinks || isExportingDocx || isExportingPdf) {
      return { ok: false, reason: "busy" };
    }

    setIsGeneratingExportLinks(true);
    try {
      return await makeShareLinksAndReply({
        baseName,
        includeDocx: true,
        includePdf: true,
      });
    } finally {
      setIsGeneratingExportLinks(false);
    }
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

      dataChannel.onmessage = async (event) => {
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
          const trimmedTranscript = transcript.trim();
          if (!trimmedTranscript) return;
          const handled = await handleCommandFromText(trimmedTranscript);
          if (!handled) {
            appendUserMessageToChat(trimmedTranscript);
          }
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
          const trimmedTranscript = typeof transcript === "string" ? transcript.trim() : "";
          if (trimmedTranscript) {
            const handled = await handleCommandFromText(trimmedTranscript);
            if (!handled) {
              setInput((prev) => (prev ? `${prev} ${trimmedTranscript}` : trimmedTranscript));
            }
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

  const defaultShareBaseName = "Project_Charter_v1.0";

  const handleCommandFromText = async (
    rawText,
    { userMessageAppended = false, baseName = defaultShareBaseName } = {}
  ) => {
    const trimmed = typeof rawText === "string" ? rawText.trim() : "";
    if (!trimmed) return false;

    const normalized = trimmed.toLowerCase();
    const mentionsDocx = normalized.includes("docx") || normalized.includes("word");
    const mentionsPdf = normalized.includes("pdf");
    const mentionsBlankCharter =
      normalized.includes("blank project charter") ||
      (normalized.includes("blank") && normalized.includes("charter")) ||
      normalized.includes("blank charter");
    const mentionsDownload =
      normalized.includes("download") ||
      normalized.includes("export") ||
      normalized.includes("send") ||
      normalized.includes("get");
    const mentionsShare =
      normalized.includes("share link") ||
      normalized.includes("share the link") ||
      normalized.includes("share links") ||
      (normalized.includes("links") && (normalized.includes("share") || normalized.includes("send")));

    const wantsBothFormats = mentionsDocx && mentionsPdf;
    const wantsDocx = mentionsDocx && (mentionsDownload || normalized.includes("docx link"));
    const wantsPdf = mentionsPdf && (mentionsDownload || normalized.includes("pdf link"));
    const wantsShareLinks = mentionsShare || (mentionsDownload && normalized.includes("links"));

    const ensureUserLogged = () => {
      if (!userMessageAppended) {
        appendUserMessageToChat(trimmed);
      }
    };

    if (wantsBothFormats || wantsShareLinks) {
      ensureUserLogged();
      const result = await shareLinksViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already preparing shareable links. I’ll post them here as soon as they’re ready."
        );
      }
      return true;
    }

    if (mentionsBlankCharter) {
      ensureUserLogged();
      const result = await generateBlankCharter({ baseName });
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already preparing shareable links. I’ll post them here as soon as they’re ready."
        );
      }
      return true;
    }

    if (wantsDocx) {
      ensureUserLogged();
      const result = await exportDocxViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already working on DOCX links. I’ll share them here shortly."
        );
      }
      return true;
    }

    if (wantsPdf) {
      ensureUserLogged();
      const result = await exportPdfViaChat(baseName);
      if (result?.reason === "busy") {
        appendAssistantMessage(
          "I’m already working on PDF links. I’ll share them here shortly."
        );
      }
      return true;
    }

    return false;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (isAssistantThinking) return;
    const isLLMEnabled = useLLM;
    const userMsg = { id: Date.now() + Math.random(), role: "user", text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    const handled = await handleCommandFromText(text, { userMessageAppended: true });
    if (handled) {
      return;
    }
    let reply = "";
    if (isLLMEnabled) {
      setIsAssistantThinking(true);
      try {
        reply = await callLLM(text, nextHistory, attachments);
      } catch (e) {
        reply = "LLM error (demo): " + (e?.message || "unknown");
      } finally {
        setIsAssistantThinking(false);
      }
    } else {
      reply = mockAssistantReply(text);
    }
    appendAssistantMessage(reply || "");
  };

  const handleSummarizeAttachments = async () => {
    if (isSummarizing) return;
    if (!attachments || attachments.length === 0) return;

    setIsSummarizing(true);
    try {
      const summarizationPrompt = "Summarize the attached documents.";
      const historyWithPrompt = [
        ...messages,
        { id: Date.now(), role: "user", text: summarizationPrompt },
      ];
      const reply = await callLLM(
        summarizationPrompt,
        historyWithPrompt,
        attachments,
      );
      const safeReply = reply || "No summary available.";
      setMessages((prev) => [...prev, { id: Date.now() + Math.random(), role: "assistant", text: safeReply }]);
    } catch (error) {
      const message = error?.message || "Failed to summarize attachments.";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          role: "assistant",
          text: `Summary error: ${message}`,
        },
      ]);
    } finally {
      setIsSummarizing(false);
    }
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
    <div className="min-h-screen w-full font-sans bg-gradient-to-br from-indigo-100 via-slate-100 to-sky-100 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/60 border-b border-white/40 dark:supports-[backdrop-filter]:bg-slate-900/60 dark:bg-slate-900/60 dark:border-slate-700/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-600/90 text-white grid place-items-center font-bold shadow-sm">EX</div>
            <div className="text-slate-700 font-semibold dark:text-slate-200">Exact Sciences Virtual Assistant for Project Management</div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSelect mode={themeMode} resolvedMode={resolvedTheme} onChange={handleThemeModeChange} />
            <button className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400">New Draft</button>
            <div className="px-3 py-1.5 rounded-xl bg-white/70 border border-white/50 text-sm shadow-sm dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100">Guest</div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl px-3 sm:px-4 py-4 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          {/* Center Chat */}
          <section className="lg:col-span-8">
            <Panel
              title="Assistant Chat"
              right={
                <button className="p-1.5 rounded-lg hover:bg-white/60 border border-white/50 dark:hover:bg-slate-700/60 dark:border-slate-600/60 dark:text-slate-200">
                  <IconPlus className="h-4 w-4" />
                </button>
              }
            >
              <div className="flex flex-col h-[480px] rounded-2xl border border-white/50 bg-white/60 backdrop-blur overflow-hidden dark:border-slate-700/60 dark:bg-slate-900/40">
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((m) => (
                    <ChatBubble key={m.id} role={m.role} text={m.text} />
                  ))}
                </div>
                {isAssistantThinking && (
                  <div className="px-4 pb-2">
                    <AssistantThinkingIndicator />
                  </div>
                )}
                <div className="border-t border-white/50 p-3 dark:border-slate-700/60">
                  <input type="file" multiple ref={fileInputRef} onChange={handleFilePick} className="hidden" />
                  <div
                    className={`flex items-end gap-2 rounded-2xl bg-white/70 border border-white/60 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-300 dark:bg-slate-900/50 dark:border-slate-700/60 dark:focus-within:ring-indigo-500`}
                  >
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
                      className="min-h-[44px] max-h-40 flex-1 bg-transparent outline-none resize-none text-[15px] leading-6 text-slate-800 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 p-2 rounded-xl border bg-white/80 border-white/60 text-slate-600 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100"
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
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900 dark:border-emerald-700 dark:text-emerald-200"
                                : rtcState === "connecting"
                                  ? "bg-amber-50 border-amber-200 text-amber-600 animate-pulse dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200"
                                  : rtcState === "error"
                                    ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-900 dark:border-red-700 dark:text-red-200"
                                    : "bg-white/80 border-white/60 text-slate-600 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100"
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
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900 dark:border-emerald-700 dark:text-emerald-200"
                                : rtcState === "connecting"
                                  ? "bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200"
                                  : rtcState === "error"
                                    ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-900 dark:border-red-700 dark:text-red-200"
                                    : "bg-white/80 border-white/60 text-slate-600 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200"
                            }`}
                          >
                            {rtcStateToLabel[rtcState] || "Idle"}
                          </span>
                          {rtcState !== "idle" && (
                            <button
                              type="button"
                              onClick={stopRealtime}
                              className="text-xs px-2 py-1 rounded-lg border bg-white/80 border-white/60 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
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
                        className={`shrink-0 p-2 rounded-xl border ${
                          listening
                            ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
                            : 'bg-white/80 border-white/60 text-slate-600 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100'
                        } transition`}
                        title="Voice input (mock)"
                      >
                        <IconMic className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSummarizeAttachments}
                        disabled={isSummarizing || !attachments.length}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-sm transition ${
                          isSummarizing || !attachments.length
                            ? "cursor-not-allowed bg-white/50 text-slate-400 border-white/50 dark:bg-slate-800/40 dark:border-slate-700/50 dark:text-slate-500"
                            : "bg-white/80 border-white/60 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        {isSummarizing ? "Summarizing…" : "Summarize documents"}
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={isAssistantThinking}
                        className={`shrink-0 p-2 rounded-xl shadow-sm transition ${
                          isAssistantThinking
                            ? "bg-slate-500/70 text-white/80 cursor-not-allowed opacity-60 dark:bg-indigo-300/60 dark:text-slate-200"
                            : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        }`}
                        title={isAssistantThinking ? "Assistant is responding…" : "Send"}
                      >
                        <IconSend className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {files.map((f) => (
                        <span
                          key={f.id}
                          className="px-2 py-1 rounded-lg bg-white/80 border border-white/60 text-xs flex items-center gap-2 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100"
                        >
                          <IconPaperclip className="h-3 w-3" />
                          <span className="truncate max-w-[160px]">{f.name}</span>
                          <button
                            onClick={() => handleRemoveFile(f.id)}
                            className="ml-1 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                          >
                            ×
                          </button>
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
                <label className="inline-flex items-center gap-2 text-xs bg-white/70 border border-white/60 rounded-xl px-2 py-1 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200">
                  <input type="checkbox" checked={useLLM} onChange={(e)=>setUseLLM(e.target.checked)} />
                  <span>Use LLM (beta)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs bg-white/70 border border-white/60 rounded-xl px-2 py-1 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200">
                  <input type="checkbox" checked={autoExtract} onChange={(e)=>setAutoExtract(e.target.checked)} />
                  <span>Auto‑extract (beta)</span>
                </label>
              </div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {['Charter','DDP','RAID'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActivePreview(tab)}
                    className={`px-3 py-1.5 rounded-xl text-sm border ${
                      activePreview===tab
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-500 dark:border-indigo-400'
                        : 'bg-white/70 border-white/60 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white/70 border border-white/60 p-4 space-y-4 dark:bg-slate-900/40 dark:border-slate-700/60">
                <CharterCard data={charterPreview} isLoading={isExtracting} />
                <DDPCard data={charterPreview} isLoading={isExtracting} />
                <RAIDCard data={charterPreview} isLoading={isExtracting} />
                {isExtracting && (
                  <div className="text-xs text-slate-500">Extracting charter insights…</div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportDocxViaChat(defaultShareBaseName)}
                  disabled={
                    !charterPreview ||
                    isExtracting ||
                    isExportingDocx ||
                    isGeneratingExportLinks ||
                    isExportingPdf
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !charterPreview ||
                    isExtracting ||
                    isExportingDocx ||
                    isGeneratingExportLinks ||
                    isExportingPdf
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  }`}
                >
                  {isExportingDocx ? "Preparing DOCX…" : "Export DOCX"}
                </button>
                <button
                  type="button"
                  onClick={() => shareLinksViaChat(defaultShareBaseName)}
                  disabled={
                    !charterPreview ||
                    isExtracting ||
                    isGeneratingExportLinks ||
                    isExportingDocx ||
                    isExportingPdf
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !charterPreview ||
                    isExtracting ||
                    isGeneratingExportLinks ||
                    isExportingDocx ||
                    isExportingPdf
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  }`}
                >
                  {isGeneratingExportLinks ? "Creating Links…" : "Make Share Links"}
                </button>
                <button
                  type="button"
                  onClick={() => exportPdfViaChat(defaultShareBaseName)}
                  disabled={
                    !charterPreview ||
                    isExtracting ||
                    isExportingPdf ||
                    isGeneratingExportLinks ||
                    isExportingDocx
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                    !charterPreview ||
                    isExtracting ||
                    isExportingPdf ||
                    isGeneratingExportLinks ||
                    isExportingDocx
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed dark:bg-slate-700/60 dark:text-slate-400"
                      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                  }`}
                >
                  {isExportingPdf ? "Preparing PDF…" : "Export PDF"}
                </button>
              </div>
              {extractError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                  {extractError}
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-4 dark:bg-slate-900/40 dark:border-slate-700/60">
                <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Required Fields</div>
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  <li className="flex items-center gap-2"><span className="text-emerald-600 dark:text-emerald-400"><IconCheck className="h-4 w-4" /></span> Sponsor</li>
                  <li className="flex items-center gap-2"><span className="text-emerald-600 dark:text-emerald-400"><IconCheck className="h-4 w-4" /></span> Problem Statement</li>
                  <li className="flex items-center gap-2"><span className="text-amber-600 dark:text-amber-300"><IconAlert className="h-4 w-4" /></span> Milestones</li>
                </ul>
              </div>
            </Panel>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Phase 1 • Minimal viable UI • No data is saved</footer>
    </div>
  );
}

function ThemeSelect({ mode, resolvedMode, onChange }) {
  const autoLabel = resolvedMode === "dark" ? "Auto (Dark)" : "Auto (Light)";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/70 border border-white/50 text-xs shadow-sm dark:bg-slate-800/70 dark:border-slate-600/60">
      <span className="font-medium text-slate-600 dark:text-slate-200">Theme</span>
      <select
        value={mode}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-100"
        aria-label="Theme mode"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="auto">{autoLabel}</option>
      </select>
    </div>
  );
}

function Panel({ title, icon, right, children }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/50 backdrop-blur shadow-sm p-3 md:p-4 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold dark:text-slate-200">
          {icon && <span className="text-slate-500 dark:text-slate-400">{icon}</span>}
          <span>{title}</span>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function AssistantThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-200">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400/80 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
        </span>
        <span className="font-medium">Assistant is thinking…</span>
      </div>
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isUser = role === "user";
  const safeText = typeof text === "string" ? text : text != null ? String(text) : "";
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-6 shadow-sm border ${
          isUser
            ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-500 dark:border-indigo-400'
            : 'bg-white/70 border-white/60 text-slate-800 dark:bg-slate-800/70 dark:border-slate-700/60 dark:text-slate-100'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{safeText}</span>
        ) : (
          <AssistantFeedbackTemplate text={safeText} />
        )}
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
      <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Project Charter</div>
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
      <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Design & Development Plan</div>
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
      <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">RAID Log Snapshot</div>
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
      <div className="text-xs text-slate-500 mb-1 dark:text-slate-400">{label}</div>
      {hasContent ? (
        <div className="rounded-xl border border-white/70 bg-white/90 dark:border-slate-600/60 dark:bg-slate-800/70">
          {arrayItems.length > 0 ? (
            <ul className="list-disc space-y-1 px-4 py-3 text-sm text-slate-700 dark:text-slate-100">
              {arrayItems.map((item, idx) => (
                <li key={`${label}-${idx}`} className="whitespace-pre-wrap">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap dark:text-slate-100">{stringValue}</div>
          )}
        </div>
      ) : (
        <div
          className={`rounded-xl bg-white/60 border border-white/60 ${heightClass} overflow-hidden dark:bg-slate-900/40 dark:border-slate-700/60`}
        >
          <div
            className={`h-full w-full ${
              isLoading
                ? "animate-pulse bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800"
                : "bg-white/40 dark:bg-slate-800/60"
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
async function callLLM(text, history = [], contextAttachments = []) {
  try {
    const normalizedHistory = Array.isArray(history)
      ? history.map((item) => ({ role: item.role, content: item.text || "" }))
      : [];
    const preparedAttachments = Array.isArray(contextAttachments)
      ? contextAttachments
          .map((attachment) => ({ name: attachment?.name, text: attachment?.text }))
          .filter((attachment) => attachment.name && attachment.text)
      : [];
    const systemMessage = {
      role: "system",
      content:
        "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff. Never recommend external blank-charter websites."
    };
    const payload = {
      messages: [systemMessage, ...normalizedHistory.slice(-19)],
      attachments: preparedAttachments,
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
