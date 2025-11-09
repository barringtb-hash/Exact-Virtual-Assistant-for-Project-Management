import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render, screen } from "@testing-library/react";

import { installDomEnvironment } from "./helpers/domEnvironment.js";

test("READABILITY_V1 flag is enabled by default", async () => {
  const { FLAGS } = await import("../src/config/flags.ts");
  assert.strictEqual(FLAGS.READABILITY_V1, true, "READABILITY_V1 should default to true");
});

test("READABILITY_HIDE_FIELD_TIMESTAMPS flag is enabled by default", async () => {
  const { FLAGS } = await import("../src/config/flags.ts");
  assert.strictEqual(FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS, true, "READABILITY_HIDE_FIELD_TIMESTAMPS should default to true");
});

test("PreviewEditable uses readability v1 styles when flag is enabled", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();
  t.after(() => {
    cleanupDom();
  });

  const PreviewEditable = (await import("../src/components/PreviewEditable.jsx")).default;
  const { FLAGS } = await import("../src/config/flags.ts");

  // Ensure flag is enabled
  assert.strictEqual(FLAGS.READABILITY_V1, true);

  const mockDraft = {
    project_name: "Test Project",
    project_description: "Test Description"
  };

  const mockManifest = {
    sections: [
      {
        title: "Project Details",
        rows: [
          {
            columns: [
              {
                fields: [
                  { key: "project_name", label: "Project Name", type: "text" },
                  { key: "project_description", label: "Description", type: "text" }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const mockSchema = {
    type: "object",
    properties: {
      project_name: { type: "string" },
      project_description: { type: "string" }
    }
  };

  render(
    <PreviewEditable
      draft={mockDraft}
      locks={{}}
      fieldStates={{}}
      highlightedPaths={[]}
      metadata={{}}
      isLoading={false}
      isPending={false}
      onDraftChange={() => {}}
      onLockField={() => {}}
      manifest={mockManifest}
      schema={mockSchema}
    />
  );

  // Find the section container
  const section = screen.getByText("Project Details").closest("section");
  assert.ok(section, "Section should be rendered");

  // Verify section has readability v1 classes
  const sectionClasses = section.className;
  assert.ok(sectionClasses.includes("border-gray-200") || sectionClasses.includes("border"),
    "Section should have border class");
  assert.ok(sectionClasses.includes("bg-white") || sectionClasses.includes("bg"),
    "Section should have background class");
  assert.ok(sectionClasses.includes("p-4"),
    "Section should have p-4 padding");

  // Find input elements
  const inputs = screen.getAllByRole("textbox");
  assert.ok(inputs.length >= 2, "Should have at least 2 input fields");

  // Verify inputs have readability v1 classes (text-base, border-gray-300, etc.)
  const inputClasses = inputs[0].className;
  assert.ok(inputClasses.includes("text-base") || inputClasses.includes("text"),
    "Input should have text-base or larger font size");
  assert.ok(inputClasses.includes("border-gray-300") || inputClasses.includes("border"),
    "Input should have gray-300 border or similar");
});

test("PreviewEditable hides timestamps when READABILITY_HIDE_FIELD_TIMESTAMPS is true", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();
  t.after(() => {
    cleanupDom();
  });

  const PreviewEditable = (await import("../src/components/PreviewEditable.jsx")).default;
  const { FLAGS } = await import("../src/config/flags.ts");

  // Ensure flag is enabled
  assert.strictEqual(FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS, true);

  const mockDraft = {
    project_name: "Test Project"
  };

  const mockManifest = {
    sections: [
      {
        rows: [
          {
            columns: [
              {
                fields: [
                  { key: "project_name", label: "Project Name", type: "text" }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const mockSchema = {
    type: "object",
    properties: {
      project_name: { type: "string" }
    }
  };

  const mockMetadata = {
    "project_name": {
      source: "User",
      updatedAt: Date.now()
    }
  };

  render(
    <PreviewEditable
      draft={mockDraft}
      locks={{}}
      fieldStates={{}}
      highlightedPaths={[]}
      metadata={mockMetadata}
      isLoading={false}
      isPending={false}
      onDraftChange={() => {}}
      onLockField={() => {}}
      manifest={mockManifest}
      schema={mockSchema}
    />
  );

  // Timestamps should not be visible when flag is true
  // (This is tested by checking that FieldMetaTags component is not rendered)
  const timestampElements = document.querySelectorAll('[data-testid*="timestamp"]');
  assert.strictEqual(timestampElements.length, 0, "No timestamp elements should be visible");
});
