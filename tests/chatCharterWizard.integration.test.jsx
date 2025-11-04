import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import CharterFieldSession from "../src/chat/CharterFieldSession.tsx";
import { normalizeCharterFormSchema } from "../src/lib/charter/formSchema.ts";
import { conversationActions } from "../src/state/conversationStore.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "fixtures/conversation/simple-schema.json");

async function loadSchema() {
  const raw = await readFile(schemaPath, "utf8");
  return normalizeCharterFormSchema(JSON.parse(raw));
}

test("charter field session captures and reviews responses", async () => {
  const schema = await loadSchema();
  conversationActions.reset();
  conversationActions.ensureSession(schema);
  conversationActions.dispatch({ type: "INIT" });

  render(<CharterFieldSession />);

  const user = userEvent.setup();

  const nameTextarea = await screen.findByRole("textbox", { name: "Project name" });
  await user.type(nameTextarea, "Project Atlas");
  await user.click(screen.getByRole("button", { name: "Save response" }));

  await screen.findByText(/Confirm response for Project name/i);
  await user.click(screen.getByRole("button", { name: "Confirm value" }));

  await screen.findByText(/Saved Project name/i);
  await user.click(screen.getByRole("button", { name: "Next field" }));

  const summaryTextarea = await screen.findByRole("textbox", { name: "Executive summary" });
  await user.type(summaryTextarea, "Outline the key milestones and benefits.");
  await user.click(screen.getByRole("button", { name: "Save response" }));

  await screen.findByText(/Confirm response for Executive summary/i);
  await user.click(screen.getByRole("button", { name: "Confirm value" }));

  await screen.findByText(/Saved Executive summary/i);
  await user.click(screen.getByRole("button", { name: "Next field" }));

  await screen.findByText(/Key risks/i);
  await user.click(screen.getByRole("button", { name: "Skip field" }));

  await screen.findByText(/Review the captured responses/i);

  const reviewList = screen.getByRole("list");
  const items = within(reviewList).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent("Project name");
  expect(items[1]).toHaveTextContent("Executive summary");
  expect(items[2]).toHaveTextContent("Key risks");

  await user.click(screen.getByRole("button", { name: "Finalize charter" }));

  await screen.findByText(/Charter conversation finalized/i);
});
