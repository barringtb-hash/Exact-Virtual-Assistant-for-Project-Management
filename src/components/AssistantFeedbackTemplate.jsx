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

const DEFAULT_SECTIONS = [
  {
    heading: "Summary",
    placeholder: "No summary is available yet.",
  },
  {
    heading: "Recommended Actions",
    placeholder: "No recommended actions have been captured.",
  },
  {
    heading: "Open Questions",
    placeholder: "No open questions at this time.",
  },
];

function normalizeSection(section, fallbackHeading, placeholder) {
  const heading = section.heading || fallbackHeading || "";
  const hasContent = section.items.length > 0 || section.paragraphs.length > 0;
  if (hasContent) {
    return {
      heading,
      paragraphs: section.paragraphs,
      items: section.items,
      listType: section.listType,
      isPlaceholder: false,
    };
  }

  return {
    heading,
    paragraphs: placeholder ? [placeholder] : [],
    items: [],
    listType: null,
    isPlaceholder: true,
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

export default function AssistantFeedbackTemplate({ text, className = "", defaultSections = DEFAULT_SECTIONS }) {
  const sections = useMemo(() => {
    const formatted = formatAssistantFeedback(typeof text === "string" ? text : "");

    const consumed = new Set();
    const defaultsWithContent = defaultSections.map((defaultSection) => {
      const matchIndex = formatted.sections.findIndex(
        (section) => section.heading && section.heading.toLowerCase() === defaultSection.heading.toLowerCase(),
      );

      if (matchIndex !== -1) {
        consumed.add(matchIndex);
        return normalizeSection(formatted.sections[matchIndex], defaultSection.heading, defaultSection.placeholder);
      }

      return {
        heading: defaultSection.heading,
        paragraphs: [defaultSection.placeholder],
        items: [],
        listType: null,
        isPlaceholder: true,
      };
    });

    const additionalSections = formatted.sections
      .map((section, index) => ({ section, index }))
      .filter(({ index }) => !consumed.has(index))
      .map(({ section }) => normalizeSection(section));

    if (defaultsWithContent.length > 0) {
      return [...defaultsWithContent, ...additionalSections];
    }

    return additionalSections.length > 0
      ? additionalSections
      : defaultSections.map((defaultSection) => ({
          heading: defaultSection.heading,
          paragraphs: [defaultSection.placeholder],
          items: [],
          listType: null,
          isPlaceholder: true,
        }));
  }, [text, defaultSections]);

  if (!sections.length) {
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
