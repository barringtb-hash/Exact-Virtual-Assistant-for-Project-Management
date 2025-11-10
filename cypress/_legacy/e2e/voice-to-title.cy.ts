/// <reference types="cypress" />

const START_URL = '**/guided/charter/start*';
const MESSAGE_URL = '**/guided/charter/messages';

const slotMetadata = [
  {
    slot_id: 'project_name',
    label: 'Project Title',
    question: "What's the official name of this project?",
    required: true,
  },
  {
    slot_id: 'sponsor',
    label: 'Sponsor',
    question: 'Who is sponsoring this project?',
    required: true,
  },
];

const initialEvents = [
  {
    event_id: 'evt-initial-greeting',
    type: 'assistant_prompt',
    message: 'Let’s build your charter step-by-step.',
  },
  {
    event_id: 'evt-initial-question',
    type: 'assistant_prompt',
    message: 'Project Title (required). What’s the official name of this project?',
  },
  {
    event_id: 'evt-slot-initial',
    type: 'slot_update',
    status: 'collecting',
    current_slot_id: 'project_name',
    slots: [
      { slot_id: 'project_name', status: 'awaiting_input' },
      { slot_id: 'sponsor', status: 'pending' },
    ],
  },
];

const buildResponse = (events: Record<string, unknown>[]) => ({
  handled: true,
  idempotent: false,
  events,
});

describe('Voice field extraction for charter title', () => {
  beforeEach(() => {
    cy.intercept({ url: START_URL }).as('charterStartAny');
    cy.intercept('POST', START_URL, (req) => {
      const correlationId = req.body?.correlation_id;
      expect(correlationId, 'correlation id').to.be.a('string').and.not.be.empty;
      req.reply({
        body: {
          conversationId: 'voice-conversation-001',
          prompt: 'Let’s build your charter step-by-step.',
          hasVoiceSupport: true,
          slots: slotMetadata,
          events: initialEvents,
          idempotent: false,
        },
      });
    }).as('charterStart');

    cy.intercept('POST', MESSAGE_URL, (req) => {
      const { message } = req.body ?? {};
      if (message === 'Orbit Revamp') {
        req.reply({
          body: buildResponse([
            {
              event_id: 'evt-title-confirmed',
              type: 'assistant_prompt',
              message: 'Saved Project Title.',
            },
            {
              event_id: 'evt-slot-update',
              type: 'slot_update',
              status: 'collecting',
              current_slot_id: 'sponsor',
              slots: [
                {
                  slot_id: 'project_name',
                  status: 'confirmed',
                  value: 'Orbit Revamp',
                  confirmed_value: 'Orbit Revamp',
                  last_updated_at: new Date().toISOString(),
                },
                { slot_id: 'sponsor', status: 'awaiting_input' },
              ],
            },
          ]),
        });
        return;
      }

      req.reply({ body: buildResponse([]) });
    }).as('charterMessage');

    cy.waitForAppReady();
    cy.get('[data-testid="btn-start-charter"]').should('be.visible');
  });

  it('populates the title from voice extraction without assistant chatter', () => {
    cy.get('[data-testid="btn-start-charter"]').click();
    cy.wait('@charterStart', { timeout: 20000 }).then(
      (result) => result,
      () => cy.wait('@charterStartAny', { timeout: 20000 }),
    );

    cy.intercept('POST', '**/api/**/extract', (req) => {
      const voiceEvents = req.body?.voice;
      if (Array.isArray(voiceEvents) && voiceEvents.length > 0) {
        req.alias = 'voiceTitleExtract';
        const finalEvent = voiceEvents[voiceEvents.length - 1]?.text;
        expect(finalEvent, 'voice payload').to.eq('Polaris Launch');
        req.reply({
          body: {
            ok: true,
            draft: { project_name: 'Polaris Launch' },
          },
        });
        return;
      }

      req.continue();
    });

    cy.get('[data-testid="assistant-message"]').its('length').as('assistantCountBefore');

    cy.window().then(async (win) => {
      const testWindow = win as Window & {
        __simulateGuidedVoiceFinal?: (
          text: string,
          options?: { isFinal?: boolean },
        ) => Promise<void>;
      };
      expect(testWindow.__simulateGuidedVoiceFinal, 'voice helper').to.be.a('function');
      await testWindow.__simulateGuidedVoiceFinal?.('Polaris Launch');
    });

    cy.wait('@voiceTitleExtract', { timeout: 20000 });

    cy.get('@assistantCountBefore').then((countBefore) => {
      const before = Number(countBefore);
      cy.get('[data-testid="assistant-message"]').should('have.length', before);
    });

    cy.getByTestId('preview-field-title').should('have.value', 'Polaris Launch');
    cy.getByTestId('preview-field-title').within(() => {
      cy.contains('Voice').should('be.visible');
      cy.contains('Pending confirmation').should('be.visible');
    });
  });
});
