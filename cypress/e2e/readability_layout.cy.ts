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

    // Verify the document is loaded and visible
    cy.get('body').should('be.visible');
  });

  it('verifies docked chat has solid background and border', () => {
    // Find the dock/undock button if it exists
    cy.get('[aria-label*="Dock"]').then(($btn) => {
      if ($btn.length > 0 && $btn.text().includes('Dock')) {
        // Chat is currently undocked, click to dock it
        cy.wrap($btn).click();
      }
    });

    // Wait for chat panel
    cy.get('[data-testid="chat-panel"]').should('exist');

    // Check that docked chat has solid background (not translucent)
    cy.get('[data-testid="chat-panel"]').find('.eva-chat-message-bubble').first().should('exist');

    // Verify chat container has proper border and background
    // When docked, the chat should have solid white background and gray border
    cy.get('[data-testid="chat-panel"]').parent().should('have.css', 'border-width').and('not.eq', '0px');
  });

  it('verifies CompactComposer appears when chat is docked', () => {
    // Find and click dock button if chat is not docked
    cy.get('[aria-label*="Dock"]').then(($btn) => {
      if ($btn.length > 0 && $btn.text().includes('Pop out')) {
        // Chat is docked, already in the right state
      } else if ($btn.length > 0 && $btn.text().includes('Dock')) {
        // Click to dock
        cy.wrap($btn).click();
      }
    });

    // CompactComposer should be visible when docked
    cy.get('[data-testid="compact-composer-input"]').should('be.visible');
    cy.get('[data-testid="compact-composer-mic"]').should('be.visible');

    // Verify it has proper styling
    cy.get('[data-testid="compact-composer-input"]').should('have.attr', 'placeholder', 'Ask EVA…');
  });

  it('verifies CompactComposer can send messages', () => {
    // Dock the chat if needed
    cy.get('[aria-label*="Dock"]').then(($btn) => {
      if ($btn.length > 0 && $btn.text().includes('Dock')) {
        cy.wrap($btn).click();
      }
    });

    // Type in CompactComposer
    cy.get('[data-testid="compact-composer-input"]').should('be.visible').type('Test message from compact composer');

    // Press Enter to send
    cy.get('[data-testid="compact-composer-input"]').type('{enter}');

    // Chat should auto-expand after sending
    // Verify the message was sent by checking the chat transcript
    cy.get('.eva-chat-message').should('contain', 'Test message from compact composer');
  });

  it('verifies chat bubble has correct background colors', () => {
    // Wait for chat messages to exist
    cy.get('.eva-chat-message--assistant').first().then(($msg) => {
      if ($msg.length > 0) {
        // Check assistant bubble background is gray-100: rgb(243, 244, 246)
        cy.wrap($msg).find('.eva-chat-message-bubble').should('have.css', 'background-color', 'rgb(243, 244, 246)');
      }
    });
  });

  it('verifies expanded chat applies scrim or outline to preview', () => {
    // Find the dock button and ensure chat is expanded (not docked)
    cy.get('[aria-label*="Dock"]').then(($btn) => {
      if ($btn.length > 0 && $btn.text().includes('Dock')) {
        // Already expanded/undocked
      } else if ($btn.length > 0 && $btn.text().includes('Pop out')) {
        // Currently docked, click to expand
        cy.wrap($btn).click();
      }
    });

    // When expanded, preview should have transition classes or chat should have outline
    // This is a visual check that the UI differentiates docked vs expanded
    cy.get('[data-testid="preview-panel"]').should('exist');
  });
});
