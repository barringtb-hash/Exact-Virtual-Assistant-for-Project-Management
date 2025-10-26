export function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function linkifyMarkdownLinks(input) {
  if (!input) {
    return "";
  }

  let result = "";
  let index = 0;

  while (index < input.length) {
    const openBracket = input.indexOf("[", index);
    if (openBracket === -1) {
      result += escapeHtml(input.slice(index));
      index = input.length;
      break;
    }

    const closeBracket = input.indexOf("]", openBracket + 1);
    if (closeBracket === -1) {
      result += escapeHtml(input.slice(index));
      index = input.length;
      break;
    }

    if (input[closeBracket + 1] !== "(") {
      result += escapeHtml(input.slice(index, closeBracket + 1));
      index = closeBracket + 1;
      continue;
    }

    const openParen = closeBracket + 1;
    let cursor = openParen + 1;
    let depth = 1;
    while (cursor < input.length && depth > 0) {
      const char = input[cursor];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      result += escapeHtml(input.slice(index));
      index = input.length;
      break;
    }

    const labelRaw = input.slice(openBracket + 1, closeBracket);
    const urlRaw = input.slice(openParen + 1, cursor - 1);

    result += escapeHtml(input.slice(index, openBracket));

    const trimmedUrl = (urlRaw || "").trim();
    const trimmedLabel = (labelRaw || "").trim();

    if (!trimmedUrl) {
      result += escapeHtml(input.slice(openBracket, cursor));
    } else {
      const escapedLabel = escapeHtml(trimmedLabel);
      const escapedUrl = escapeHtml(trimmedUrl);
      const isAbsolute = /^https?:\/\//i.test(trimmedUrl);
      const externalAttrs = isAbsolute ? ' target="_blank" rel="noopener noreferrer"' : "";

      result += `<a href="${escapedUrl}" class="assistant-feedback-link"${externalAttrs}>${escapedLabel}</a>`;
    }

    index = cursor;
  }

  if (index < input.length) {
    result += escapeHtml(input.slice(index));
  }

  return result;
}

export function renderRichText(content) {
  return linkifyMarkdownLinks(content ?? "");
}
