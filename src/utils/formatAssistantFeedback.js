const SECTION_SPLIT_REGEX = /\n\s*\n/;

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function parseBlock(block) {
  const lines = block.split("\n").map((line) => line.replace(/\s+$/g, ""));
  let heading = "";
  if (lines.length) {
    const firstLine = lines[0].trim();
    const looksLikeHeading =
      /:$/u.test(firstLine) ||
      (firstLine.length > 0 && firstLine.length <= 60 && firstLine === firstLine.toUpperCase() && !firstLine.includes("."));
    if (looksLikeHeading) {
      heading = firstLine.replace(/:$/u, "").trim();
      lines.shift();
    }
  }

  const items = [];
  const paragraphs = [];
  let listType = null;

  lines.forEach((rawLine) => {
    const indentMatch = rawLine.match(/^\s*/u);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }

    const bulletMatch = trimmed.match(/^[\-*\u2022]\s+(.*)$/u);
    const numberMatch = trimmed.match(/^(\d+)[\.)]\s+(.*)$/u);

    if (bulletMatch || numberMatch) {
      const isSubpoint = indent >= 2 && items.length > 0;
      const content = normalizeLine((bulletMatch ? bulletMatch[1] : numberMatch[2]) || "");
      const targetItem = isSubpoint ? items[items.length - 1] : null;

      if (isSubpoint && targetItem) {
        if (!targetItem.subpoints) {
          targetItem.subpoints = [];
        }
        targetItem.subpoints.push({ text: content });
      } else {
        listType = numberMatch ? "ol" : listType || "ul";
        items.push({
          text: content,
          subpoints: [],
          type: numberMatch ? "number" : "bullet",
        });
      }
      return;
    }

    if (items.length > 0) {
      const currentItem = items[items.length - 1];
      currentItem.text = `${currentItem.text} ${normalizeLine(trimmed)}`.trim();
    } else {
      if (paragraphs.length === 0) {
        paragraphs.push(trimmed);
      } else {
        const idx = paragraphs.length - 1;
        paragraphs[idx] = `${paragraphs[idx]} ${normalizeLine(trimmed)}`.trim();
      }
    }
  });

  return {
    heading,
    paragraphs,
    items,
    listType: listType || (items.length ? "ul" : null),
  };
}

export function formatAssistantFeedback(raw) {
  if (typeof raw !== "string") {
    return { sections: [], html: "" };
  }

  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { sections: [], html: "" };
  }

  const blocks = normalized.split(SECTION_SPLIT_REGEX).map((block) => block.trim()).filter(Boolean);
  const sections = blocks.map(parseBlock);

  const html = sections
    .map((section) => {
      const parts = ['<section class="assistant-feedback-section">'];
      if (section.heading) {
        parts.push(`<h4 class="assistant-feedback-heading">${escapeHtml(section.heading)}</h4>`);
      }

      if (section.items.length > 0) {
        const listTag = section.listType === "ol" ? "ol" : "ul";
        parts.push(`<${listTag} class="assistant-feedback-list">`);
        section.items.forEach((item) => {
          const subpointsHtml =
            item.subpoints && item.subpoints.length
              ? `<ul class="assistant-feedback-sublist">${item.subpoints
                  .map((sub) => `<li>${escapeHtml(sub.text)}</li>`)
                  .join("")}</ul>`
              : "";
          parts.push(`<li>${escapeHtml(item.text)}${subpointsHtml}</li>`);
        });
        parts.push(`</${listTag}>`);
      } else if (section.paragraphs.length > 0) {
        section.paragraphs.forEach((paragraph) => {
          parts.push(`<p class="assistant-feedback-paragraph">${escapeHtml(paragraph)}</p>`);
        });
      }

      parts.push("</section>");
      return parts.join("");
    })
    .join("");

  return { sections, html };
}

export default formatAssistantFeedback;
