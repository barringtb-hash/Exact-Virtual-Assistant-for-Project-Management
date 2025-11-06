/// <reference types="cypress" />

describe('Charter guided chat experience', () => {
  const composer = () => cy.get('[data-testid="composer-textarea"]');

  beforeEach(() => {
    cy.intercept('POST', '/api/chat', {
      body: { reply: 'stubbed llm response' },
    }).as('llmRequest');

    cy.visit('/');
    cy.get('[data-testid="btn-start-charter"]').should('be.visible');
  });

  it('walks through prompts, validation, navigation, and review', () => {
    cy.get('[data-testid="btn-start-charter"]').click();

    cy.contains('[data-testid="assistant-message"]', 'Let’s build your charter step-by-step.')
      .should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Project Title (required).');

    composer().type('North Star Initiative{enter}');
    cy.contains('[data-testid="assistant-message"]', 'Saved Project Title.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Sponsor (required).');

    cy.get('[data-testid="chip-skip"]').click();
    cy.contains('[data-testid="assistant-message"]', 'Skipping Sponsor.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Project Lead (required).');

    cy.get('[data-testid="chip-back"]').click();
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Sponsor (required).');

    composer().type('Jordan Example{enter}');
    cy.contains('[data-testid="assistant-message"]', 'Saved Sponsor.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Project Lead (required).');

    composer().type('Taylor Projector{enter}');
    cy.contains('[data-testid="assistant-message"]', 'Saved Project Lead.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Start Date (required).');

    composer().type('next quarter{enter}');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Enter a valid date in YYYY-MM-DD format.');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Try again or type "skip" to move on.');

    composer().type('2024-05-01{enter}');
    cy.contains('[data-testid="assistant-message"]', 'Saved Start Date.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'End Date (required).');

    composer().type('2024-10-15{enter}');
    cy.contains('[data-testid="assistant-message"]', 'Saved End Date.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Vision (required).');

    const skipSequence: Array<[string, string]> = [
      ['Vision (required).', 'Problem (required).'],
      ['Problem (required).', 'Project Description (required).'],
      ['Project Description (required).', 'Scope In (optional).'],
      ['Scope In (optional).', 'Scope Out (optional).'],
      ['Scope Out (optional).', 'Risks (optional).'],
      ['Risks (optional).', 'Assumptions (optional).'],
      ['Assumptions (optional).', 'Milestones (optional).'],
      ['Milestones (optional).', 'Success Metrics (optional).'],
      ['Success Metrics (optional).', 'Core Team (optional).'],
    ];

    skipSequence.forEach(([current, next]) => {
      cy.get('[data-testid="assistant-message"]').last().should('contain.text', current);
      cy.get('[data-testid="chip-skip"]').click();
      cy.contains('[data-testid="assistant-message"]', `Skipping ${current.split(' (')[0]}.`).should('be.visible');
      cy.get('[data-testid="assistant-message"]').last().should('contain.text', next);
    });

    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Core Team (optional).');

    cy.get('[data-testid="chip-review"]').click();
    cy.get('[data-testid="assistant-message"]').last().should(($message) => {
      const text = $message.text();
      expect(text).to.contain('Review summary —');
      expect(text).to.contain('Confirmed: Project Title, Sponsor, Project Lead, Start Date, and End Date.');
      expect(text).to.contain(
        'Skipped: Vision, Problem, Project Description, Scope In, Scope Out, Risks, Assumptions, Milestones, and Success Metrics.'
      );
      expect(text).to.contain('Still in progress: Core Team.');
    });

    cy.get('[data-testid="chip-skip"]').click();
    cy.contains('[data-testid="assistant-message"]', 'Skipping Core Team.').should('be.visible');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'That covers every section.');
    cy.get('[data-testid="btn-start-charter"]').should('have.text', 'Restart Charter');
  });
});
