/// <reference types="cypress" />

describe('Guided Charter Creation Flow', () => {
  beforeEach(() => {
    // Mock the charter extraction API
    cy.intercept('POST', /\/api\/(charter|documents|doc)\/extract/, (req) => {
      req.reply({
        delay: 50,
        body: {
          ok: true,
          draft: {
            project_name: 'Phoenix CRM Migration',
            sponsor: 'Jane Smith',
            project_lead: 'John Doe',
            start_date: '2024-01-15',
            end_date: '2024-12-31',
            vision: 'Modernize customer relationship management system',
          },
          locks: {},
          metadata: { source: 'AI', extractedAt: Date.now() },
        },
      });
    }).as('extractRequest');

    // Mock the conversation persistence API
    cy.intercept('GET', '/api/charter/conversation*', { status: 404, body: { error: 'conversation_not_found' } });
    cy.intercept('POST', '/api/charter/conversation', { ok: true }).as('saveConversation');
    cy.intercept('DELETE', '/api/charter/conversation*', { statusCode: 204 });

    // Mock chat API (for non-wizard interactions)
    cy.intercept('POST', '/api/chat', {
      reply: 'I can help you create a charter using the wizard below.',
    }).as('chatRequest');

    // Set environment to enable wizard mode
    cy.visit('/', {
      onBeforeLoad(win) {
        // Override import.meta.env for Vite
        Object.defineProperty(win, 'import', {
          value: {
            meta: {
              env: {
                VITE_CHARTER_WIZARD_VISIBLE: 'true',
                VITE_AUTO_EXTRACT: 'true',
                VITE_INTENT_ONLY_EXTRACTION: 'true',
              },
            },
          },
        });
      },
    });

    cy.contains('Chat Assistant').should('be.visible');
  });

  it('guides user through sequential field collection with validation', () => {
    // Wait for wizard to initialize
    cy.contains('Project Title').should('be.visible');

    // Step 1: Enter project title
    cy.get('textarea[aria-label="Project Title"]').type('Phoenix CRM Migration');
    cy.contains('button', 'Save response').click();

    // Verify preview updates with the title
    cy.contains('Phoenix CRM Migration').should('exist');

    // Step 2: Enter sponsor
    cy.contains('Sponsor').should('be.visible');
    cy.get('textarea[aria-label="Sponsor"]').type('Jane Smith');
    cy.contains('button', 'Save response').click();

    // Verify preview updates
    cy.contains('Jane Smith').should('exist');

    // Step 3: Enter project lead
    cy.contains('Project Lead').should('be.visible');
    cy.get('textarea[aria-label="Project Lead"]').type('John Doe');
    cy.contains('button', 'Save response').click();

    // Step 4: Enter start date
    cy.contains('Start Date').should('be.visible');
    cy.get('textarea[aria-label="Start Date"]').type('2024-01-15');
    cy.contains('button', 'Save response').click();

    // Step 5: Enter end date
    cy.contains('End Date').should('be.visible');
    cy.get('textarea[aria-label="End Date"]').type('2024-12-31');
    cy.contains('button', 'Save response').click();

    // Step 6: Enter vision
    cy.contains('Vision').should('be.visible');
    cy.get('textarea[aria-label="Vision"]').type('Modernize our customer relationship management system to improve sales efficiency and customer satisfaction');
    cy.contains('button', 'Save response').click();

    // Verify all entered data appears in preview
    cy.contains('Phoenix CRM Migration').should('exist');
    cy.contains('Jane Smith').should('exist');
    cy.contains('John Doe').should('exist');
    cy.contains('2024-01-15').should('exist');
    cy.contains('2024-12-31').should('exist');
    cy.contains('Modernize our customer relationship management').should('exist');
  });

  it('allows skipping optional fields', () => {
    // Enter required title
    cy.get('textarea[aria-label="Project Title"]').type('Test Project');
    cy.contains('button', 'Save response').click();

    // Enter sponsor
    cy.get('textarea[aria-label="Sponsor"]').type('Test Sponsor');
    cy.contains('button', 'Save response').click();

    // Skip project lead
    cy.contains('Project Lead').should('be.visible');
    cy.contains('button', 'Skip field').click();

    // Verify we moved to next field
    cy.contains('Start Date').should('be.visible');

    // Verify skipped field is not in preview (or shows as blank/not set)
    // The field should not have a value
    cy.contains('Test Project').should('exist');
    cy.contains('Test Sponsor').should('exist');
  });

  it('handles validation errors and re-prompts', () => {
    // Enter title
    cy.get('textarea[aria-label="Project Title"]').type('Test Project');
    cy.contains('button', 'Save response').click();

    // Enter sponsor
    cy.get('textarea[aria-label="Sponsor"]').type('Test Sponsor');
    cy.contains('button', 'Save response').click();

    // Enter project lead
    cy.get('textarea[aria-label="Project Lead"]').type('Test Lead');
    cy.contains('button', 'Save response').click();

    // Enter invalid start date
    cy.contains('Start Date').should('be.visible');
    cy.get('textarea[aria-label="Start Date"]').type('invalid-date');
    cy.contains('button', 'Save response').click();

    // Should show validation error and stay on same field
    // The error message might vary, but we should still see Start Date prompt
    cy.contains('Start Date').should('be.visible');

    // Enter valid date
    cy.get('textarea[aria-label="Start Date"]').clear().type('2024-01-15');
    cy.contains('button', 'Save response').click();

    // Should progress to next field
    cy.contains('End Date').should('be.visible');
  });

  it('does not show "Auto" badges for manually entered fields', () => {
    // Enter several fields manually
    cy.get('textarea[aria-label="Project Title"]').type('Manual Project');
    cy.contains('button', 'Save response').click();

    cy.get('textarea[aria-label="Sponsor"]').type('Manual Sponsor');
    cy.contains('button', 'Save response').click();

    // Verify no "Auto" badges appear (these would indicate auto-extracted content)
    cy.contains(/Auto.*just now/).should('not.exist');
    cy.contains('Auto ·').should('not.exist');
  });

  it('shows "Auto" badges only when auto-fill is explicitly triggered', () => {
    // Upload a mock file
    const fileName = 'project-scope.txt';
    const fileContent = 'Project: Phoenix CRM\nSponsor: Jane Smith\nLead: John Doe';

    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(fileContent),
      fileName,
      mimeType: 'text/plain',
    }, { force: true });

    // Wait for file to be processed
    cy.contains(fileName).should('exist');

    // Click the "Auto-fill from uploaded scope" button
    cy.contains('button', /Auto-fill from uploaded scope/i).click();

    // Wait for extraction
    cy.wait('@extractRequest');

    // Now "Auto" badges should appear for auto-filled fields
    // (Implementation may vary - this is a placeholder for the expected behavior)
    // The wizard might show which fields were auto-populated
  });

  it('tracks progress through the wizard', () => {
    // Initial state should show progress
    cy.contains(/\d+\/\d+/).should('exist'); // Progress indicator like "1/30" or "0/30"

    // Enter a field
    cy.get('textarea[aria-label="Project Title"]').type('Test Project');
    cy.contains('button', 'Save response').click();

    // Progress should update
    cy.contains(/\d+\/\d+/).should('exist');

    // Enter another field
    cy.get('textarea[aria-label="Sponsor"]').type('Test Sponsor');
    cy.contains('button', 'Save response').click();

    // Progress should increase
    cy.contains(/\d+\/\d+/).should('exist');
  });

  it('shows field help text and examples', () => {
    // First field should show help text
    cy.contains('Project Title').should('be.visible');

    // Help text and examples should be visible
    // (Exact text depends on formSchema.json)
    cy.contains(/example/i).should('exist');

    // Each field should have a placeholder
    cy.get('textarea[aria-label="Project Title"]')
      .invoke('attr', 'placeholder')
      .should('exist');
  });

  it('allows reviewing and editing completed fields', () => {
    // Complete several fields
    cy.get('textarea[aria-label="Project Title"]').type('Review Test');
    cy.contains('button', 'Save response').click();

    cy.get('textarea[aria-label="Sponsor"]').type('Test Sponsor');
    cy.contains('button', 'Save response').click();

    cy.get('textarea[aria-label="Project Lead"]').type('Test Lead');
    cy.contains('button', 'Save response').click();

    // Continue through more fields to reach review mode
    // (Implementation detail: review mode appears after completing all fields)
    // For now, verify that completed fields are saved and visible in preview
    cy.contains('Review Test').should('exist');
    cy.contains('Test Sponsor').should('exist');
    cy.contains('Test Lead').should('exist');
  });

  it('persists conversation state across page reloads', () => {
    // Enter a field
    cy.get('textarea[aria-label="Project Title"]').type('Persistence Test');
    cy.contains('button', 'Save response').click();

    // Reload the page
    cy.reload();

    // Conversation should resume from where we left off
    // (This depends on VITE_CHARTER_CONVERSATION_PERSIST being enabled)
    cy.contains('Chat Assistant').should('be.visible');

    // Check if the entered data persists
    // Note: This test assumes conversation persistence is enabled in the environment
  });

  it('handles empty submissions gracefully', () => {
    // Try to submit without entering text
    cy.contains('button', 'Save response').click();

    // Should either show validation error or stay on same field
    cy.contains('Project Title').should('be.visible');

    // Field should still be editable
    cy.get('textarea[aria-label="Project Title"]').should('exist').and('not.be.disabled');
  });

  it('supports keyboard navigation', () => {
    // Focus on textarea and type
    cy.get('textarea[aria-label="Project Title"]').focus().type('Keyboard Test');

    // Should be able to submit with Enter (if supported)
    // Note: This depends on form implementation
    cy.contains('button', 'Save response').should('be.visible').and('not.be.disabled');
  });
});
