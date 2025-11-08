/// <reference types="cypress" />

const START_URL = '**/guided/charter/start*';
const MESSAGE_URL = '**/guided/charter/messages';

describe('Guided charter backend voice + text sync', () => {
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
    {
      slot_id: 'project_lead',
      label: 'Project Lead',
      question: 'Who is leading the project day to day?',
      required: true,
    },
  ];

  const noopEventSource = () => {
    cy.window().then((win) => {
      class MockEventSource {
        url: string;
        readyState = 0;
        onerror: EventListenerOrEventListenerObject | null = null;
        onmessage: EventListenerOrEventListenerObject | null = null;
        onopen: EventListenerOrEventListenerObject | null = null;

        constructor(url: string, _init?: EventSourceInit) {
          this.url = url;
        }

        addEventListener(): void {
          /* noop */
        }

        removeEventListener(): void {
          /* noop */
        }

        close(): void {
          this.readyState = 2;
        }
      }

      Object.defineProperty(win, 'EventSource', {
        configurable: true,
        writable: true,
        value: MockEventSource as unknown as typeof EventSource,
      });
    });
  };

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
        { slot_id: 'project_lead', status: 'pending' },
      ],
    },
  ];

  const buildResponse = (events: Record<string, unknown>[]) => ({
    handled: true,
    idempotent: false,
    events,
  });

  const setupStartIntercept = (overrides?: Partial<Record<string, unknown>>) => {
    cy.intercept({ url: START_URL }).as('charterStartAny');
    cy.intercept('POST', START_URL, (req) => {
      const correlationId = req.body?.correlation_id;
      expect(correlationId, 'correlation id').to.be.a('string').and.not.be.empty;
      req.reply({
        body: {
          conversationId: 'remote-conversation-001',
          prompt: 'Let’s build your charter step-by-step.',
          hasVoiceSupport: true,
          slots: slotMetadata,
          events: initialEvents,
          idempotent: false,
          ...overrides,
        },
      });
    }).as('charterStart');
  };

  const waitForStartRequest = () =>
    cy.wait('@charterStart', { timeout: 20000 }).then(
      (result) => result,
      () => cy.wait('@charterStartAny', { timeout: 20000 }),
    );

  const respondToMessage = () => {
    cy.intercept('POST', MESSAGE_URL, (req) => {
      const { message, source } = req.body ?? {};
      if (message === 'North Star Initiative') {
        req.reply({
          body: buildResponse([
            {
              event_id: 'evt-title-confirmed',
              type: 'assistant_prompt',
              message: 'Saved Project Title.',
            },
            {
              event_id: 'evt-title-slot',
              type: 'slot_update',
              status: 'collecting',
              current_slot_id: 'sponsor',
              slots: [
                {
                  slot_id: 'project_name',
                  status: 'confirmed',
                  value: 'North Star Initiative',
                  confirmed_value: 'North Star Initiative',
                  last_updated_at: new Date().toISOString(),
                },
                { slot_id: 'sponsor', status: 'awaiting_input' },
                { slot_id: 'project_lead', status: 'pending' },
              ],
            },
            {
              event_id: 'evt-sponsor-prompt',
              type: 'assistant_prompt',
              message: 'Sponsor (required). Who is sponsoring this project?',
            },
          ]),
        });
        return;
      }

      if (message === 'Jordan Example') {
        req.reply({
          body: buildResponse([
            {
              event_id: 'evt-sponsor-confirmed',
              type: 'assistant_prompt',
              message: 'Saved Sponsor.',
            },
            {
              event_id: 'evt-sponsor-slot',
              type: 'slot_update',
              status: 'collecting',
              current_slot_id: 'project_lead',
              slots: [
                {
                  slot_id: 'project_name',
                  status: 'confirmed',
                  value: 'North Star Initiative',
                  confirmed_value: 'North Star Initiative',
                },
                {
                  slot_id: 'sponsor',
                  status: 'confirmed',
                  value: 'Jordan Example',
                  confirmed_value: 'Jordan Example',
                  last_updated_at: new Date().toISOString(),
                },
                { slot_id: 'project_lead', status: 'awaiting_input' },
              ],
            },
            {
              event_id: 'evt-lead-prompt',
              type: 'assistant_prompt',
              message: 'Project Lead (required). Who is leading the project day to day?',
            },
          ]),
        });
        return;
      }

      if (typeof message === 'string' && message.trim().toLowerCase() === 'review') {
        req.reply({
          body: buildResponse([
            {
              event_id: 'evt-review-summary',
              type: 'assistant_prompt',
              message:
                'Review summary — Confirmed: Project Title, Sponsor. Still in progress: Project Lead.',
            },
          ]),
        });
        return;
      }

      if (source === 'voice') {
        expect(message).to.eq('Voice sponsor update');
        req.reply({
          body: buildResponse([
            {
              event_id: 'evt-voice-sponsor',
              type: 'assistant_prompt',
              message: 'Saved Sponsor.',
            },
            {
              event_id: 'evt-voice-slot',
              type: 'slot_update',
              status: 'collecting',
              current_slot_id: 'project_lead',
              slots: [
                {
                  slot_id: 'project_name',
                  status: 'confirmed',
                  value: 'North Star Initiative',
                  confirmed_value: 'North Star Initiative',
                },
                {
                  slot_id: 'sponsor',
                  status: 'confirmed',
                  value: 'Voice sponsor update',
                  confirmed_value: 'Voice sponsor update',
                  last_updated_at: new Date().toISOString(),
                },
                { slot_id: 'project_lead', status: 'awaiting_input' },
              ],
            },
            {
              event_id: 'evt-voice-prompt',
              type: 'assistant_prompt',
              message: 'Project Lead (required). Who is leading the project day to day?',
            },
          ]),
        });
        return;
      }

      req.reply({
        body: buildResponse([]),
      });
    }).as('charterMessage');
  };

  const loadApp = () => {
    cy.waitForAppReady({
      GUIDED_BACKEND_ON: true,
      CHARTER_GUIDED_BACKEND_ENABLED: true,
      CYPRESS_SAFE_MODE: false,
    });

    cy.window()
      .its('__APP_FLAGS__')
      .should((flags) => {
        expect(flags, '__APP_FLAGS__').to.exist;
        expect(flags?.GUIDED_BACKEND_ON, 'GUIDED_BACKEND_ON flag').to.equal(true);
        expect(
          flags?.CHARTER_GUIDED_BACKEND_ENABLED,
          'CHARTER_GUIDED_BACKEND_ENABLED flag',
        ).to.equal(true);
        expect(flags?.CYPRESS_SAFE_MODE, 'CYPRESS_SAFE_MODE flag').to.equal(false);
      });

    cy.window()
      .its('__E2E_FLAGS__')
      .should((flags) => {
        expect(flags, '__E2E_FLAGS__').to.exist;
        expect(flags?.SAFE_MODE, 'SAFE_MODE flag').to.equal(false);
        expect(flags?.GUIDED_BACKEND_ON, 'GUIDED_BACKEND_ON flag').to.equal(true);
      });
    noopEventSource();
    cy.get('[data-testid="btn-start-charter"]').should('be.visible');
  };

  beforeEach(() => {
    setupStartIntercept();
    respondToMessage();

    cy.intercept('POST', '**/chat', {
      body: { reply: 'stubbed llm response' },
    }).as('llmRequest');

    loadApp();
  });

  it('shows remote greeting, processes slot updates, and reviews progress', () => {
    cy.get('[data-testid="btn-start-charter"]').click();
    waitForStartRequest();

    cy.contains('[data-testid="assistant-message"]', 'Let’s build your charter step-by-step.')
      .should('be.visible');
    cy.contains('[data-testid="assistant-message"]', 'Project Title (required).')
      .should('be.visible');

    cy.submitComposer('North Star Initiative');
    cy.wait('@charterMessage', { timeout: 20000 });

    cy.contains('[data-testid="assistant-message"]', 'Saved Project Title.').should('be.visible');
    cy.contains('[data-testid="assistant-message"]', 'Sponsor (required).').should('be.visible');
    cy.getByTestId('preview-field-title').should('have.value', 'North Star Initiative');

    cy.submitComposer('Jordan Example');
    cy.wait('@charterMessage', { timeout: 20000 });

    cy.contains('[data-testid="assistant-message"]', 'Saved Sponsor.').should('be.visible');
    cy.contains('[data-testid="assistant-message"]', 'Project Lead (required).')
      .should('be.visible');
    cy.getByTestId('preview-field-sponsor').should('have.value', 'Jordan Example');

    cy.get('[data-testid="chip-review"]').click();
    cy.wait('@charterMessage', { timeout: 20000 });
    cy.contains('[data-testid="assistant-message"]', 'Review summary').should('be.visible');
  });

  it('submits voice transcripts through the guided backend', () => {
    cy.get('[data-testid="btn-start-charter"]').click();
    waitForStartRequest();

    cy.assertMicPressed(true);

    cy.submitComposer('North Star Initiative');
    cy.wait('@charterMessage', { timeout: 20000 });

    cy.window().then(async (win) => {
      const testWindow = win as Window & {
        __simulateGuidedVoiceFinal?: (
          text: string,
          options?: { isFinal?: boolean },
        ) => Promise<void>;
      };
      expect(testWindow.__simulateGuidedVoiceFinal, 'voice helper').to.be.a('function');
      await testWindow.__simulateGuidedVoiceFinal?.('Voice sponsor update');
    });

    cy.wait('@charterMessage', { timeout: 20000 }).then((interception) => {
      expect(interception.request?.body?.source).to.eq('voice');
    });

    cy.contains('[data-testid="assistant-message"]', 'Saved Sponsor.').should('be.visible');
    cy.getByTestId('preview-field-sponsor').should('have.value', 'Voice sponsor update');
    cy.assertMicPressed(false);
  });

  it('falls back to the local orchestrator when start fails', () => {
    cy.intercept({ url: START_URL }).as('charterStartAny');
    cy.intercept('POST', START_URL, {
      statusCode: 500,
      body: { error: 'forced' },
    }).as('charterStartFailure');
    cy.intercept('POST', MESSAGE_URL).as('charterMessages');

    loadApp();

    cy.get('[data-testid="btn-start-charter"]').click();
    cy.wait('@charterStartFailure', { timeout: 20000 }).then(
      (result) => result,
      () => cy.wait('@charterStartAny', { timeout: 20000 }),
    );

    cy.contains('[data-testid="assistant-message"]', 'Let’s build your charter step-by-step.')
      .should('be.visible');
    cy.contains('[data-testid="assistant-message"]', 'Project Title (required).')
      .should('be.visible');

    cy.submitComposer('North Star Initiative');
    cy.contains('[data-testid="assistant-message"]', 'Saved Project Title.').should('be.visible');
    cy.getByTestId('preview-field-title').should('have.value', 'North Star Initiative');

    cy.get('[data-testid="chip-review"]').click();
    cy.contains('[data-testid="assistant-message"]', 'Review summary').should('be.visible');

    cy.get('@charterMessages.all').should('have.length', 0);
  });
});
