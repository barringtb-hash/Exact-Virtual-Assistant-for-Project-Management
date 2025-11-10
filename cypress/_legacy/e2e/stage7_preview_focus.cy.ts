describe('Stage 7: Preview Focus and Chat Overlay', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows chat in overlay mode when document creation starts', () => {
    // Wait for the Start Charter button to be visible
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview panel to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist').and('be.visible');

    // Check that chat panel uses overlay positioning helpers
    cy.get('[data-testid="chat-panel"]', { timeout: 10000 })
      .should('be.visible')
      .and('have.class', 'bottom-sheet')
      .and('have.class', 'floating-card');

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
      .should('have.class', 'bottom-sheet')
      .and('have.class', 'floating-card')
      .and('have.class', 'inset-x-0')
      .and('have.class', 'bottom-0');

    // Click the "Dock" button
    cy.get('[data-testid="chat-panel"]')
      .contains('button', 'Dock')
      .click();

    // Chat should now be in docked grid mode
    cy.get('[data-testid="chat-panel"]')
      .should('not.have.class', 'bottom-sheet')
      .and('not.have.class', 'floating-card')
      .and('have.class', 'lg:col-span-4');

    // Preview should take the dominant width when chat is docked
    cy.get('[data-testid="preview-panel"]')
      .should('have.class', 'lg:col-span-8');

    // Chat remains functional in docked mode
    cy.get('[data-testid="composer-input"]')
      .should('be.visible')
      .type('Docked mode message');
    cy.get('[data-testid="composer-send"]').click();
    cy.get('[data-testid="chat-panel"]')
      .contains('Docked mode message', { timeout: 5000 })
      .should('exist');

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
      .should('have.class', 'bottom-sheet')
      .and('have.class', 'floating-card')
      .and('have.class', 'inset-x-0')
      .and('have.class', 'bottom-0');

    cy.get('[data-testid="preview-panel"]')
      .should('have.class', 'lg:col-span-12');

    // Composer should continue working after returning to overlay mode
    cy.get('[data-testid="composer-input"]')
      .should('be.visible')
      .type('Overlay mode message');
    cy.get('[data-testid="composer-send"]').click();
    cy.get('[data-testid="chat-panel"]')
      .contains('Overlay mode message', { timeout: 5000 })
      .should('exist');
  });

  it('allows typing and sending messages in overlay mode', () => {
    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Verify chat is in overlay mode
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'bottom-sheet');

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

    // Chat should use the floating card treatment on md+
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'bottom-sheet')
      .and('have.class', 'floating-card');
  });

  it('shows chat as bottom sheet on mobile viewport', () => {
    // Set viewport to mobile size
    cy.viewport(375, 667);

    // Start document creation
    cy.get('[data-testid="btn-start-charter"]', { timeout: 10000 }).should('be.visible').click();

    // Wait for preview to appear
    cy.get('[data-testid="preview-panel"]', { timeout: 10000 }).should('exist');

    // Chat should present as a bottom sheet on mobile
    cy.get('[data-testid="chat-panel"]')
      .should('have.class', 'bottom-sheet')
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
