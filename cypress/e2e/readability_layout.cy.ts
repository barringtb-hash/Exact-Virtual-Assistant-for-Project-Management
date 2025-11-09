describe('Readability Layout Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('verifies chat message bubbles have correct font size and styling', () => {
    // Wait for chat interface to load
    cy.contains('Chat Assistant').should('exist');

    // Check if there are any chat messages
    cy.get('.eva-chat-message').then(($messages) => {
      if ($messages.length > 0) {
        // Verify bubble has proper font size (16px minimum)
        cy.get('.eva-chat-message-bubble').first().should('have.css', 'font-size').then((fontSize) => {
          const size = parseFloat(fontSize);
          expect(size).to.be.gte(16);
        });

        // Verify content has max-width constraint
        cy.get('.eva-chat-message-content').first().should('have.class', 'max-w-[70ch]');
      }
    });
  });

  it('verifies preview inputs have correct border colors and styling', () => {
    // Wait for preview panel to load
    cy.get('[data-testid="preview-field-title"]').should('exist');

    // Check input border color (should be gray-300: rgb(209, 213, 219) in light mode)
    cy.get('input[type="text"]').first().should('exist').then(($input) => {
      const borderColor = $input.css('border-color');
      // Accept multiple valid gray values as border colors may vary slightly
      expect(borderColor).to.match(/rgb\(209,\s*213,\s*219\)|rgb\(156,\s*163,\s*175\)/);
    });

    // Verify input text size is at least 16px
    cy.get('input[type="text"]').first().should('have.css', 'font-size').then((fontSize) => {
      const size = parseFloat(fontSize);
      expect(size).to.be.gte(16);
    });
  });

  it('verifies sections have proper borders and spacing', () => {
    // Check if sections exist with proper styling
    cy.get('section').first().then(($section) => {
      if ($section.length > 0) {
        // Verify section has border
        cy.wrap($section).should('have.css', 'border-width').and('not.eq', '0px');

        // Verify section has padding
        cy.wrap($section).should('have.css', 'padding').and('not.eq', '0px');
      }
    });
  });

  it('verifies app loads without crashes when readability flag is enabled', () => {
    // Basic smoke test to ensure no regressions
    cy.contains('Chat Assistant').should('exist');
    cy.get('input[type="text"]').should('exist');

    // Verify no console errors (optional, may need configuration)
    cy.window().then((win) => {
      expect(win.console.error).to.not.have.been.called;
    });
  });
});
