# Assistant Feedback Template

The `AssistantFeedbackTemplate` component ensures that every assistant message is rendered with consistent formatting. It wraps the raw assistant response in the shared formatter (`formatAssistantFeedback`) and then renders the normalized sections using the shared feedback styles (`assistant-feedback-*` classes).

## Default sections

Even when the model omits optional content, the template injects the following default headings so that each chat response remains structured:

- **Summary** – displays the parsed summary content or a placeholder when missing.
- **Recommended Actions** – populated with formatted action bullets or a default placeholder.
- **Open Questions** – highlights unanswered questions or a placeholder explaining that none exist.

If the formatter discovers additional sections (for example, "Risks" or "Notes"), they are appended after the defaults without losing their parsed structure.

## Usage

```jsx
import AssistantFeedbackTemplate from "../components/AssistantFeedbackTemplate";

<AssistantFeedbackTemplate text={assistantMessage} />
```

This component is now used by the chat bubble for assistant responses, guaranteeing that all assistant feedback leverages the formatter and consistent styling before reaching the UI.

## Markdown link rendering

Chat-first export flows add Markdown-formatted anchors (for example, `[Download DOCX](https://example.com/...)`) directly into assistant replies. The template now pipes responses through a lightweight Markdown-to-HTML helper that only converts link syntax, sanitizes the result with DOMPurify, and renders the safe HTML via `dangerouslySetInnerHTML`. This keeps new charter download links clickable in the transcript while guarding against untrusted markup.
