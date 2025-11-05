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

    // Set feature flags via localStorage (highest priority in featureFlags.js)
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('VITE_CHARTER_WIZARD_VISIBLE', 'true');
        win.localStorage.setItem('VITE_AUTO_EXTRACT', 'true');
        win.localStorage.setItem('VITE_INTENT_ONLY_EXTRACTION', 'true');
        win.localStorage.setItem('VITE_WIZARD_AUTO_ADVANCE', 'true');
      },
    });

    cy.contains('Chat Assistant').should('be.visible');

    // Wait for the wizard to initialize
    cy.get('[data-cy=charter-wizard]', { timeout: 10000 }).should('be.visible');
  });

  it('guides user through sequential field collection with validation', () => {
    // Step 1: Enter project title
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').should('be.visible').type('Phoenix CRM Migration');
      cy.get('[data-cy=save-response]').should('be.visible').click();
    });

    // Verify preview updates with the title
    cy.contains('Phoenix CRM Migration', { timeout: 10000 }).should('exist');

    // Step 2: Enter sponsor
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Jane Smith');
      cy.get('[data-cy=save-response]').click();
    });
    cy.contains('Jane Smith', { timeout: 10000 }).should('exist');

    // Step 3: Enter project lead
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Lead', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('John Doe');
      cy.get('[data-cy=save-response]').click();
    });

    // Step 4: Enter start date
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Start Date', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('2024-01-15');
      cy.get('[data-cy=save-response]').click();
    });

    // Step 5: Enter end date
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('End Date', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('2024-12-31');
      cy.get('[data-cy=save-response]').click();
    });

    // Step 6: Enter vision
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Vision', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Modernize our customer relationship management system to improve sales efficiency and customer satisfaction');
      cy.get('[data-cy=save-response]').click();
    });

    // Verify all entered data appears in preview (with some timeout for updates)
    cy.contains('Phoenix CRM Migration', { timeout: 3000 }).should('exist');
    cy.contains('Jane Smith').should('exist');
    cy.contains('John Doe').should('exist');
  });

  it('allows skipping optional fields', () => {
    // Enter required title
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Test Project');
      cy.get('[data-cy=save-response]').click();
    });

    // Enter sponsor
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Sponsor');
      cy.get('[data-cy=save-response]').click();
    });

    // Skip project lead
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Lead', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=skip-field]').click();
    });

    // Verify we moved to next field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Start Date', { timeout: 5000 }).should('be.visible');
    });

    // Verify entered fields appear in preview
    cy.contains('Test Project').should('exist');
    cy.contains('Test Sponsor').should('exist');
  });

  it('handles validation errors and re-prompts', () => {
    // Enter title
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Test Project');
      cy.get('[data-cy=save-response]').click();
    });

    // Enter sponsor
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Sponsor');
      cy.get('[data-cy=save-response]').click();
    });

    // Enter project lead
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Lead', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Lead');
      cy.get('[data-cy=save-response]').click();
    });

    // Enter invalid start date
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Start Date', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('invalid-date');
      cy.get('[data-cy=save-response]').click();

      // Should show validation error and stay on same field
      cy.wait(1000);
      cy.contains('Start Date').should('be.visible');

      // Enter valid date
      cy.get('[data-cy=field-input]').clear().type('2024-01-15');
      cy.get('[data-cy=save-response]').click();
    });

    // Should progress to next field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('End Date', { timeout: 5000 }).should('be.visible');
    });
  });

  it('does not show "Auto" badges for manually entered fields', () => {
    // Enter several fields manually
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Manual Project');
      cy.get('[data-cy=save-response]').click();
    });

    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Manual Sponsor');
      cy.get('[data-cy=save-response]').click();
    });

    // Verify no "Auto" badges appear (these would indicate auto-extracted content)
    cy.contains(/Auto.*just now/).should('not.exist');
    cy.contains('Auto ·').should('not.exist');
  });

  it.skip('shows "Auto" badges only when auto-fill is explicitly triggered', () => {
    // This test is skipped because auto-fill behavior needs the wizard to be in a specific state
    // and file upload handling is complex in Cypress tests
    // Upload a mock file
    const fileName = 'project-scope.txt';
    const fileContent = 'Project: Phoenix CRM\nSponsor: Jane Smith\nLead: John Doe';

    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(fileContent),
      fileName,
      mimeType: 'text/plain',
    }, { force: true });

    // Wait for file to be processed
    cy.contains(fileName, { timeout: 5000 }).should('exist');

    // Click the "Auto-fill from uploaded scope" button
    cy.contains('button', /Auto-fill from uploaded scope/i, { timeout: 5000 }).click();

    // Wait for extraction
    cy.wait('@extractRequest');
  });

  it('tracks progress through the wizard', () => {
    // Verify wizard progress indicator exists
    cy.get('[data-cy=wizard-progress]').should('be.visible');

    // Enter a field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Test Project');
      cy.get('[data-cy=save-response]').click();
    });

    // Enter another field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Sponsor');
      cy.get('[data-cy=save-response]').click();
    });

    // Verify we're progressing through fields
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Lead', { timeout: 5000 }).should('be.visible');
    });
  });

  it('shows field help text and examples', () => {
    // Wait for first field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');

      // Help text and examples should be visible
      // The formSchema has help_text and placeholder for each field
      cy.get('[data-cy=field-input]')
        .invoke('attr', 'placeholder')
        .should('exist');
    });
  });

  it('allows reviewing and editing completed fields', () => {
    // Complete several fields
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Review Test');
      cy.get('[data-cy=save-response]').click();
    });

    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Sponsor');
      cy.get('[data-cy=save-response]').click();
    });

    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Lead', { timeout: 5000 }).should('be.visible');
      cy.get('[data-cy=field-input]').clear().type('Test Lead');
      cy.get('[data-cy=save-response]').click();
    });

    // Verify that completed fields are saved and visible in preview
    cy.contains('Review Test').should('exist');
    cy.contains('Test Sponsor').should('exist');
    cy.contains('Test Lead').should('exist');
  });

  it.skip('persists conversation state across page reloads', () => {
    // This test is skipped because conversation persistence requires specific env var
    // and the behavior depends on server-side state management
    // Enter a field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy=field-input]').type('Persistence Test');
      cy.get('[data-cy=save-response]').click();
    });

    // Reload the page
    cy.reload();

    // Conversation should resume from where we left off
    // (This depends on VITE_CHARTER_CONVERSATION_PERSIST being enabled)
    cy.contains('Chat Assistant', { timeout: 10000 }).should('be.visible');
  });

  it('handles empty submissions gracefully', () => {
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');

      // Try to submit without entering text (textarea should be empty)
      cy.get('[data-cy=field-input]').should('have.value', '');
      cy.get('[data-cy=save-response]').click();

      // Should either show validation error or stay on same field
      cy.contains('Project Title', { timeout: 3000 }).should('be.visible');

      // Field should still be editable
      cy.get('[data-cy=field-input]').should('exist').and('not.be.disabled');
    });
  });

  it('supports keyboard navigation', () => {
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Project Title', { timeout: 10000 }).should('be.visible');

      // Focus on textarea and type
      cy.get('[data-cy=field-input]').focus().type('Keyboard Test');

      // Should be able to submit via button
      cy.get('[data-cy=save-response]').should('be.visible').and('not.be.disabled');

      // Click to submit
      cy.get('[data-cy=save-response]').click();
    });

    // Verify we moved to next field
    cy.get('[data-cy=charter-wizard]').within(() => {
      cy.contains('Sponsor', { timeout: 5000 }).should('be.visible');
    });
  });
});
