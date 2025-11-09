describe('Stage 7: Preview Focus and Chat Overlay', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows chat in overlay mode when document creation starts', () => {
    // Wait for the Start Charter button to be visible
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview panel to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist').and('be.visible');

    // Check that chat panel has fixed positioning (overlay mode)
    cy.get('[data-testid="chat-panel"]', { timeout: 10000 })
      .should('be.visible')
      .and('have.class', 'fixed');

    // Verify preview panel spans full width (lg:col-span-12)
    cy.get('[data-testid="preview-panel"]')
      .should('have.class', 'lg:col-span-12');
  });

  it('displays dock/pop-out toggle when preview is focused', () => {
    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Look for the dock/pop-out button (it should contain "Dock" text when in overlay mode)
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Dock')
      .should('be.visible');
  });

  it('toggles between overlay and docked modes', () => {
    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Chat should start in overlay mode
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'fixed');

    // Click the "Dock" button
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Dock')
      .click();

    // Chat should now be in grid mode (not fixed)
    cy.get('[data-testid="chat-panel"]')
      .should('not.have.class', 'fixed')
      .and('have.class', 'lg:col-span-8');

    // Button should now say "Pop out"
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Pop out')
      .should('be.visible');

    // Click "Pop out" to return to overlay mode
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Pop out')
      .click();

    // Chat should be back in overlay mode
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'fixed');
  });

  it('allows typing and sending messages in overlay mode', () => {
    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Verify chat is in overlay mode
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'fixed');

    // Type a message in the composer
    cy.get('[data-testid="composer-input"]')
      .should('be.visible')
      .type('Test message in overlay mode');

    // Send the message
    cy.get('[data-testid="composer-send"]').click();

    // Verify the message appears in the chat (this confirms chat is functional in overlay mode)
    cy.get('[data-testid="chat-panel"]')
      .contains('Test message in overlay mode', { timeout: 5000 })
      .should('exist');
  });

  it('maintains preview full width in overlay mode on desktop viewport', () => {
    // Set viewport to desktop size
    cy.viewport(1280, 720);

    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Preview should be full width
    cy.get('[data-testid="preview-panel"]')
      .should('have.class', 'lg:col-span-12');

    // Chat should be in overlay (fixed position)
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'fixed');
  });

  it('shows chat as bottom sheet on mobile viewport', () => {
    // Set viewport to mobile size
    cy.viewport(375, 667);

    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Chat should be in overlay mode
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'fixed')
      .and('have.class', 'inset-x-0')
      .and('have.class', 'bottom-0');
  });

  it('hides dock/pop-out toggle when preview is not focused', () => {
    // Initially, no preview is shown
    cy.get('[data-testid="preview-panel"]').should('not.exist');

    // Dock/pop-out button should not be visible
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Dock')
      .should('not.exist');

    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Pop out')
      .should('not.exist');
  });
});
