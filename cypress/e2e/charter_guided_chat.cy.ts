/// <reference types="cypress" />

describe('Charter guided chat experience', () => {
  const sendComposerMessage = (text: string) => {
    cy.typeIntoComposer(text);
    cy.get('[data-testid="composer-send"]').should('not.be.disabled').click();
    cy.getComposerInput().should('have.value', '');
  };

  beforeEach(() => {
    cy.intercept('POST', '/api/chat', {
      body: { reply: 'stubbed llm response' },
    }).as('llmRequest');

    cy.waitForAppReady();
    cy.get('[data-testid="btn-start-charter"]').should('be.visible');
  });

  it('walks through prompts, validation, navigation, and review', () => {
    cy.get('[data-testid="btn-start-charter"]').click();

    const questionSnippets: Record<string, string> = {
      'Project Title (required).': 'official name of this project',
      'Sponsor (required).': 'sponsoring this project',
      'Project Lead (required).': 'leading the project day to day',
      'Start Date (required).': 'Use YYYY-MM-DD.',
      'End Date (required).': 'wrap up',
      'Vision (required).': 'vision or objective',
      'Problem (required).': 'problem or opportunity',
      'Project Description (required).': 'project scope and goals',
      'Scope In (optional).': 'fall in scope',
      'Scope Out (optional).': 'explicitly out of scope',
      'Risks (optional).': 'known risks',
      'Assumptions (optional).': 'key assumptions',
      'Milestones (optional).': 'phase, deliverable, and target date',
      'Success Metrics (optional).': 'benefit, the metric, and the measurement system',
      'Core Team (optional).': 'core team members',
    };

    const assertPrompt = (label: string) => {
      cy.get('[data-testid="assistant-message"]').last().should(($message) => {
        const text = $message.text();
        expect(text).to.contain(label);
        const snippet = questionSnippets[label];
        if (snippet) {
          expect(text).to.contain(snippet);
        }
      });
    };

    cy.contains('[data-testid="assistant-message"]', 'Let’s build your charter step-by-step.')
      .should('be.visible');
    assertPrompt('Project Title (required).');

    sendComposerMessage('North Star Initiative');
    cy.contains('[data-testid="assistant-message"]', 'Saved Project Title.').should('be.visible');
    assertPrompt('Sponsor (required).');

    cy.get('[data-testid="chip-skip"]').click();
    cy.contains('[data-testid="assistant-message"]', 'Skipping Sponsor.').should('be.visible');
    assertPrompt('Project Lead (required).');

    cy.get('[data-testid="chip-back"]').click();
    assertPrompt('Sponsor (required).');

    sendComposerMessage('Jordan Example');
    cy.contains('[data-testid="assistant-message"]', 'Saved Sponsor.').should('be.visible');
    assertPrompt('Project Lead (required).');

    sendComposerMessage('Taylor Projector');
    cy.contains('[data-testid="assistant-message"]', 'Saved Project Lead.').should('be.visible');
    assertPrompt('Start Date (required).');

    sendComposerMessage('next quarter');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Enter a valid date in YYYY-MM-DD format.');
    cy.get('[data-testid="assistant-message"]').last().should('contain.text', 'Try again or type "skip" to move on.');

    sendComposerMessage('2024-05-01');
    cy.contains('[data-testid="assistant-message"]', 'Saved Start Date.').should('be.visible');
    assertPrompt('End Date (required).');

    sendComposerMessage('2024-10-15');
    cy.contains('[data-testid="assistant-message"]', 'Saved End Date.').should('be.visible');
    assertPrompt('Vision (required).');

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
      assertPrompt(current);
      cy.get('[data-testid="chip-skip"]').click();
      cy.contains('[data-testid="assistant-message"]', `Skipping ${current.split(' (')[0]}.`).should('be.visible');
      assertPrompt(next);
    });

    assertPrompt('Core Team (optional).');

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
