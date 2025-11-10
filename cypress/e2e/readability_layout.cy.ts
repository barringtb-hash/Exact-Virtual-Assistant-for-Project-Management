describe('Readability Layout Tests', () => {
  const selectTheme = (mode: 'light' | 'dark' | 'auto') => {
    cy.get('select[aria-label="Theme mode"]').should('exist').then(($select) => {
      const currentValue = $select.val();
      if (currentValue !== mode) {
        cy.wrap($select).select(mode, { force: true });
      }
    });
  };

  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eva-theme-mode', 'light');
      },
    });
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

  it('forces light theme and verifies assistant bubble uses white surface', () => {
    cy.contains('Chat Assistant').should('exist');

    selectTheme('light');

    cy.get('body').then(($body) => {
      const $assistantBubbles = $body.find('.eva-chat-message--assistant .eva-chat-message-bubble');

      if ($assistantBubbles.length === 0) {
        cy.log('No assistant messages present; skipping assistant bubble theme assertion.');
        return;
      }

      return cy
        .wrap($assistantBubbles.first())
        .should('have.css', 'background-color', 'rgb(255, 255, 255)')
        .and(($bubble) => {
          const borderColor = $bubble.css('border-color');
          expect(borderColor).to.match(/rgb\((?:229,\s*231,\s*235|209,\s*213,\s*219)\)/);
        });
    });
  });

  it('switches to dark theme and ensures assistant bubble styles update', () => {
    cy.contains('Chat Assistant').should('exist');

    selectTheme('dark');

    cy.get('body').then(($body) => {
      const $assistantBubbles = $body.find('.eva-chat-message--assistant .eva-chat-message-bubble');

      if ($assistantBubbles.length === 0) {
        cy.log('No assistant messages present; skipping assistant bubble theme assertion.');
        return;
      }

      return cy
        .wrap($assistantBubbles.first())
        .should('have.css', 'background-color', 'rgb(15, 23, 42)')
        .and('have.css', 'box-shadow', 'none');
    });
  });

  it('ensures light mode preview inputs use high-contrast borders', () => {
    cy.contains('Chat Assistant').should('exist');

    selectTheme('light');

    cy.get('input, textarea')
      .filter(':visible')
      .first()
      .should('exist')
      .and('have.css', 'border-width', '1px')
      .and('have.css', 'border-color', 'rgb(209, 213, 219)')
      .and('have.css', 'background-color', 'rgb(255, 255, 255)');
  });

  it('verifies sections have proper borders and spacing', () => {
    // Check if sections exist with proper styling
    cy.get('section')
      .filter(':visible')
      .first()
      .should('have.css', 'border-width', '1px')
      .and(($section) => {
        expect($section.css('border-color')).to.not.match(/rgba\(0,\s*0,\s*0,\s*0\)/);
      })
      .and(($section) => {
        const paddingTop = parseFloat($section.css('padding-top'));
        const paddingLeft = parseFloat($section.css('padding-left'));
        expect(paddingTop).to.be.greaterThan(0);
        expect(paddingLeft).to.be.greaterThan(0);
      });
  });

  it('verifies app loads without crashes when readability flag is enabled', () => {
    // Basic smoke test to ensure no regressions
    cy.contains('Chat Assistant').should('exist');
    cy.get('input[type="text"]').should('exist');

    // Verify the document is loaded and visible
    cy.get('body').should('be.visible');
  });
});
