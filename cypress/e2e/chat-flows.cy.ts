/// <reference types="cypress" />

describe('Assistant chat flows', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/chat', (req) => {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const body = JSON.parse(raw);
      const lastMessage = body?.messages?.[body.messages.length - 1];
      if (lastMessage?.content?.includes('retry')) {
        req.reply({ statusCode: 500, body: { error: 'temporary failure' } });
        return;
      }
      // Add a small delay to simulate real API behavior
      req.reply({ delay: 100, body: { reply: 'Here is the updated charter outline.' } });
    }).as('chatRequest');

    cy.intercept('POST', /\/api\/(documents|doc)\/extract/, (req) => {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const body = JSON.parse(raw);
      req.reply({
        delay: 50,
        body: {
          ok: true,
          draft: {
            project_name: 'Aurora Initiative',
            project_lead: 'Jordan Example',
            sponsor: 'Casey Example',
          },
          locks: { '/project_name': true },
          metadata: { source: 'AI' },
          payload: body,
        },
      });
    }).as('extractRequest');

    cy.intercept('POST', '/api/transcribe', {
      transcript: 'Voice triggered follow-up',
    }).as('transcribeRequest');

    cy.visit('/');
    cy.contains('Chat Assistant').should('be.visible');

    // Wait for the page to fully initialize
    // The schema loads asynchronously and can cause re-renders
    cy.get('textarea[placeholder="Type here… (paste scope or attach files)"]', { timeout: 10000 })
      .should('exist')
      .and('not.be.disabled');

    // Wait a bit more to ensure the page is stable after schema loading
    cy.wait(500);
  });

  it('streams typed messages, syncs preview, and allows resending', () => {
    const composer = 'textarea[placeholder="Type here… (paste scope or attach files)"]';
    // Use alias and separate get to prevent detachment issues
    cy.get(composer).as('composerInput');
    cy.get('@composerInput').should('be.visible').and('not.be.disabled');
    cy.get('@composerInput').type('Draft the kickoff agenda for next Monday{enter}');

    // Check button is disabled immediately after submission
    cy.get('button[title="Assistant is responding…"]').should('exist').and('be.disabled');

    cy.wait('@chatRequest').then(({ request }) => {
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      expect(body).to.contain('kickoff agenda');
    });

    cy.wait('@extractRequest').then(({ request }) => {
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      expect(body).to.contain('kickoff agenda');
    });

    cy.contains('Here is the updated charter outline.').scrollIntoView().should('be.visible');
    cy.contains('Updating preview…').should('not.exist');

    cy.get(composer).should('have.value', '');
    // After response completes, button should be re-enabled with "Send" title
    cy.get('button[title="Send"]').should('exist').and('not.be.disabled');

    cy.get(composer).type('Please resend the latest summary{enter}');
    cy.wait('@chatRequest');
    cy.contains('Here is the updated charter outline.').should('exist');
  });

  it('handles mocked voice flow through transcription to preview sync', () => {
    cy.window().then((win) => {
      const mediaStream = {
        getTracks: () => [{ stop: cy.stub() }],
      } as unknown as MediaStream;

      win.navigator.mediaDevices = {
        getUserMedia: cy.stub().resolves(mediaStream),
      } as MediaDevices;

      class MockRecorder {
        public ondataavailable?: (event: { data: Blob }) => void;
        public onstop?: () => void;
        public stream: MediaStream;
        public mimeType = 'audio/webm';
        constructor(stream: MediaStream) {
          this.stream = stream;
        }
        start() {
          setTimeout(() => {
            this.ondataavailable?.(new Blob(['voice'], { type: this.mimeType }));
            this.onstop?.();
          }, 0);
        }
        stop() {
          this.onstop?.();
        }
      }
      win.MediaRecorder = MockRecorder as unknown as typeof MediaRecorder;
    });

    // Use alias to prevent detachment issues
    cy.get('button[title="Voice input (mock)"]').as('voiceBtn');
    cy.get('@voiceBtn').should('be.visible').click();
    cy.wait('@transcribeRequest');

    const composer = 'textarea[placeholder="Type here… (paste scope or attach files)"]';
    cy.get(composer).as('composer2');
    cy.get('@composer2').should('have.value', 'Voice triggered follow-up');
    cy.get('button[title="Send"]').as('sendBtn');
    cy.get('@sendBtn').should('be.visible').click();

    cy.wait('@chatRequest');
    cy.wait('@extractRequest');
    cy.contains('Here is the updated charter outline.').scrollIntoView().should('be.visible');
  });

  it('cancels an in-flight request when a new message is submitted', () => {
    const composer = 'textarea[placeholder="Type here… (paste scope or attach files)"]';

    cy.intercept('POST', '/api/chat', (req) => {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const parsed = JSON.parse(raw);
      if (parsed.messages.length > 3) {
        req.reply({ reply: 'Fresh response after cancel.' });
      } else {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            req.reply({ forceNetworkError: true });
            resolve();
          }, 120);
        });
      }
    }).as('cancellableChat');

    cy.get(composer).as('composer3');
    cy.get('@composer3').should('be.visible').and('not.be.disabled');
    cy.get('@composer3').type('First attempt that will be cancelled{enter}');
    cy.wait(50);
    cy.get(composer).should('be.visible').and('not.be.disabled');
    cy.get(composer).type('retry this request with new context{enter}');

    cy.wait('@cancellableChat');
    cy.contains('Fresh response after cancel.').scrollIntoView().should('be.visible');
  });

  it('recovers from network errors by allowing resend', () => {
    const composer = 'textarea[placeholder="Type here… (paste scope or attach files)"]';

    cy.get(composer).as('composer4');
    cy.get('@composer4').should('be.visible').and('not.be.disabled');
    cy.get('@composer4').type('trigger retry handling{enter}');
    cy.wait('@chatRequest');
    cy.contains('Unexpected response (500) from chat stream.').scrollIntoView().should('be.visible');

    cy.intercept('POST', '/api/chat', {
      reply: 'Second attempt succeeded.',
    }).as('retryChat');

    cy.get(composer).should('be.visible').and('not.be.disabled');
    cy.get(composer).type('retry this request with new context{enter}');
    cy.wait('@retryChat');
    cy.contains('Second attempt succeeded.').scrollIntoView().should('be.visible');
  });
});
