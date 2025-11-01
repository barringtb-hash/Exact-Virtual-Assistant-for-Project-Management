import React, { useMemo } from "react";
import formatAssistantFeedback from "../utils/formatAssistantFeedback";
import {
  escapeHtml as escapeHtmlBase,
  linkifyMarkdownLinks as linkifyMarkdownLinksBase,
  renderRichText as renderRichTextBase,
} from "../utils/assistantFeedbackRichText";

export function escapeHtml(input) {
  return escapeHtmlBase(input);
}

export function linkifyMarkdownLinks(input) {
  return linkifyMarkdownLinksBase(input);
}

function renderRichText(content) {
  return renderRichTextBase(content ?? "");
}

function normalizeSection(section) {
  if (!section) {
    return null;
  }

  const heading = typeof section.heading === "string" ? section.heading.trim() : "";
  const paragraphs = Array.isArray(section.paragraphs)
    ? section.paragraphs
        .map((paragraph) => (typeof paragraph === "string" ? paragraph.trim() : ""))
        .filter(Boolean)
    : [];

  const items = Array.isArray(section.items)
    ? section.items
        .map((item) => {
          const text = typeof item?.text === "string" ? item.text.trim() : "";
          if (!text) {
            return null;
          }

          const subpoints = Array.isArray(item.subpoints)
            ? item.subpoints
                .map((subpoint) => {
                  const subText = typeof subpoint?.text === "string" ? subpoint.text.trim() : "";
                  if (!subText) {
                    return null;
                  }

                  return { text: subText };
                })
                .filter(Boolean)
            : [];

          return {
            text,
            subpoints,
          };
        })
        .filter(Boolean)
    : [];

  if (!paragraphs.length && !items.length) {
    return null;
  }

  const listType = section.listType === "ol" ? "ol" : section.listType === "ul" ? "ul" : items.length ? "ul" : null;

  return {
    heading,
    paragraphs,
    items,
    listType,
  };
}

function renderListItems(items, listType) {
  if (!items.length) return null;
  const ListTag = listType === "ol" ? "ol" : "ul";
  return (
    <ListTag className="assistant-feedback-list">
      {items.map((item, index) => (
        <li key={index}>
          <span
            className="assistant-feedback-list-item-text"
            dangerouslySetInnerHTML={{ __html: renderRichText(item.text) }}
          />
          {item.subpoints && item.subpoints.length > 0 ? (
            <ul className="assistant-feedback-sublist">
              {item.subpoints.map((subpoint, subIndex) => (
                <li key={subIndex}>
                  <span
                    className="assistant-feedback-list-item-text"
                    dangerouslySetInnerHTML={{ __html: renderRichText(subpoint.text) }}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ListTag>
  );
}

function renderParagraphs(paragraphs) {
  if (!paragraphs.length) return null;
  return paragraphs.map((paragraph, index) => (
    <p
      key={index}
      className="assistant-feedback-paragraph"
      dangerouslySetInnerHTML={{ __html: renderRichText(paragraph) }}
    />
  ));
}

export function useAssistantFeedbackSections(text) {
  return useMemo(() => {
    const formatted = formatAssistantFeedback(typeof text === "string" ? text : "");
    if (!Array.isArray(formatted.sections) || formatted.sections.length === 0) {
      return null;
    }

    const sections = formatted.sections.map(normalizeSection).filter(Boolean);

    return sections.length > 0 ? sections : null;
  }, [text]);
}

export default function AssistantFeedbackTemplate({ text, sections: providedSections, className = "" }) {
  const derivedSections = useAssistantFeedbackSections(text);
  const sections = providedSections ?? derivedSections;

  if (!sections || sections.length === 0) {
    return null;
  }

  return (
    <div className={`assistant-feedback space-y-3 text-[15px] leading-6 ${className}`.trim()}>
      {sections.map((section, index) => (
        <section key={`${section.heading || index}-${index}`} className="assistant-feedback-section">
          {section.heading ? <h4 className="assistant-feedback-heading">{section.heading}</h4> : null}
          {renderListItems(section.items, section.listType)}
          {renderParagraphs(section.paragraphs)}
        </section>
      ))}
    </div>
  );
}
