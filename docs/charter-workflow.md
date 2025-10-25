# Charter automation workflow

This guide explains how the charter extraction, validation, and rendering assets inside `templates/` work together and how to customize them.

## Key assets
- `templates/extract_prompt.txt` – System prompt fed into OpenAI for `/api/charter/extract`. Adjust tone, required sections, or formatting guidance here.
- `templates/field_rules.json` – Human-readable constraints (e.g., word limits, allowed enumerations). Surface these rules inside the UI or docs to guide contributors.
- `templates/charter.schema.json` – Source of truth for the charter JSON structure consumed by Ajv and downstream integrations.
- `templates/project_charter_tokens.docx` – Docxtemplater template file with placeholders such as `{{title}}`, `{{sponsor}}`, etc.
- `templates/charter-validate.mjs` – CLI helper that validates any JSON file against the shared schema without hitting OpenAI.

## Recommended flow
1. **Gather context** – Capture meeting notes and decisions in chat. Encourage users to annotate critical fields inline (sponsors, objectives, scope boundaries).
2. **Auto-extract** – Trigger `/api/charter/extract` to transform the chat transcript into structured JSON. Review missing/empty fields flagged in the response.
3. **Manual edits** – Allow stakeholders to adjust the structured JSON directly in the UI or via a JSON editor to fill in gaps.
4. **Validate** – Call `/api/charter/validate` (or run `node templates/charter-validate.mjs my-charter.json`) to confirm the payload matches the schema.
5. **Render** – Post the validated JSON to `/api/charter/render` to merge values into the DOCX template.
6. **Distribute** – Offer the generated DOCX for download or push to document repositories for approvals.

## Customization tips
- **Add new fields** – Update `charter.schema.json`, tweak `field_rules.json`, extend `extract_prompt.txt` instructions, and insert new tokens in `project_charter_tokens.docx`.
- **Change tone or language** – Modify `extract_prompt.txt` to reflect the organization’s voice. Consider localizing the DOCX template placeholders as well.
- **Tighten validation** – Enable additional Ajv keywords or formats in `api/charter/validate.js`, and encode stricter regex patterns within the schema.
- **Automate follow-up actions** – After rendering, extend the API to upload the DOCX to cloud storage or trigger workflow integrations (e.g., Slack/Teams notifications).

## Frontend integration notes
- `src/App.jsx` keeps charter draft data in state and surfaces previews in the right-hand panel.
- Toggle-based extraction (`runAutoExtract`) can be replaced with explicit buttons or scheduled runs depending on UX needs.
- Consider persisting the charter JSON to browser storage or a backend to support revisiting drafts.
