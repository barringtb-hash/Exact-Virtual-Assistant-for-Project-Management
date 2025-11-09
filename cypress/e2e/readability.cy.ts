/**
 * E2E tests for readability upgrade
 * Tests readability styles and docked chat functionality
 */

describe('Readability Upgrade', () => {
  beforeEach(() => {
    // Visit the app with readability flags enabled
    cy.visit('/', {
      onBeforeLoad(win) {
        // Set environment variables to enable readability flags
        win.localStorage.setItem('VITE_READABILITY_V1', 'true');
        win.localStorage.setItem('VITE_READABILITY_HIDE_FIELD_TIMESTAMPS', 'true');
      },
    });
  });

  describe('Chat Bubble Readability', () => {
    it('should render assistant bubbles with correct readability styles', () => {
      // Wait for the page to load
      cy.get('[data-testid="chat-panel"]').should('be.visible');

      // Send a message to get an assistant response
      cy.get('[data-testid="chat-panel"]').within(() => {
        cy.get('textarea, input[type="text"]').first().type('Hello{enter}');
      });

      // Wait for assistant message
      cy.get('[data-testid="assistant-message"]', { timeout: 10000 }).should('be.visible');

      // Verify assistant bubble has correct background color (gray-100: #f3f4f6)
      cy.get('[data-testid="assistant-message"]')
        .find('div')
        .first()
        .should('have.css', 'background-color')
        .and('match', /rgb\(243,\s*244,\s*246\)|rgba\(243,\s*244,\s*246/);

      // Verify font size is at least 16px (text-base)
      cy.get('[data-testid="assistant-message"]')
        .find('div')
        .first()
        .should('have.css', 'font-size')
        .and('satisfy', (fontSize: string) => {
          const size = parseFloat(fontSize);
          return size >= 16;
        });
    });

    it('should render user bubbles with correct styles', () => {
      cy.get('[data-testid="chat-panel"]').should('be.visible');

      // Send a message
      cy.get('[data-testid="chat-panel"]').within(() => {
        cy.get('textarea, input[type="text"]').first().type('Test message{enter}');
      });

      // Verify user message has gray-900 background
      cy.get('[data-testid="user-message"]')
        .find('div')
        .first()
        .should('have.css', 'background-color')
        .and('match', /rgb\(17,\s*24,\s*39\)|rgba\(17,\s*24,\s*39/);
    });
  });

  describe('Docked Chat Functionality', () => {
    it('should dock and expand chat with correct styling', () => {
      // Find the dock toggle button
      cy.get('[data-testid="chat-dock-toggle"]').should('be.visible');

      // Click to dock the chat
      cy.get('[data-testid="chat-dock-toggle"]').click();

      // Verify chat panel has solid white background and gray-300 border when docked
      cy.get('[data-testid="chat-panel"]')
        .parent()
        .should('have.class', 'bg-white')
        .and('have.class', 'border-gray-300')
        .and('have.class', 'shadow-xl');

      // Verify the chat content is hidden
      cy.get('[data-testid="chat-panel"]').within(() => {
        cy.contains('Chat minimized').should('be.visible');
      });
    });

    it('should show compact composer when chat is docked', () => {
      // Dock the chat
      cy.get('[data-testid="chat-dock-toggle"]').click();

      // Verify CompactComposer is visible
      cy.get('[data-testid="compact-composer-input"]').should('be.visible');
      cy.get('[data-testid="compact-composer-mic"]').should('be.visible');

      // Verify it's positioned at bottom-right
      cy.get('[data-testid="compact-composer-input"]')
        .parent()
        .should('have.class', 'fixed')
        .and('have.class', 'right-6')
        .and('have.class', 'bottom-6');
    });

    it('should send messages from compact composer and auto-expand chat', () => {
      // Dock the chat
      cy.get('[data-testid="chat-dock-toggle"]').click();

      // Type in compact composer
      cy.get('[data-testid="compact-composer-input"]')
        .type('Test from compact composer{enter}');

      // Chat should auto-expand
      cy.get('[data-testid="chat-panel"]').within(() => {
        cy.contains('Chat minimized').should('not.exist');
      });

      // Message should appear in transcript
      cy.get('[data-testid="user-message"]')
        .last()
        .should('contain', 'Test from compact composer');
    });

    it('should apply scrim to preview when chat is expanded', () => {
      // Ensure chat is expanded (default state)
      cy.get('[data-testid="chat-dock-toggle"]').should('be.visible');

      // Verify preview panel has scrim styling
      cy.get('[data-testid="preview-panel"]')
        .parent()
        .should('satisfy', ($el) => {
          const classes = $el.attr('class') || '';
          return classes.includes('bg-gray-50') || classes.includes('rounded-2xl');
        });
    });
  });

  describe('Preview Input Readability', () => {
    it('should show preview inputs with clear borders and spacing', () => {
      // Wait for preview panel
      cy.get('[data-testid="preview-panel"]').should('be.visible');

      // Check for inputs in preview
      cy.get('[data-testid="preview-panel"]').within(() => {
        cy.get('input, textarea').first().should(($input) => {
          const classes = $input.attr('class') || '';
          // Verify readability classes
          expect(classes).to.include('border-gray-300');
          expect(classes).to.include('text-base');
        });
      });
    });

    it('should show section cards with clear borders when readability v1 is enabled', () => {
      cy.get('[data-testid="preview-panel"]').should('be.visible');

      // Verify sections have card styling
      cy.get('[data-testid="preview-panel"]').within(() => {
        cy.get('section').first().should(($section) => {
          const classes = $section.attr('class') || '';
          expect(classes).to.include('border-gray-200');
          expect(classes).to.include('bg-white');
          expect(classes).to.include('p-4');
        });
      });
    });
  });
});
