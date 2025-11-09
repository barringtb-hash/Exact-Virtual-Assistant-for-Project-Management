interface ResponseHandler {
  (request: unknown): Promise<unknown> | unknown;
}

declare global {
  namespace NodeJS {
    interface Process {
      __OPENAI_MOCK_RESPONSES?: ResponseHandler[];
    }
  }
}

function getResponseQueue(): ResponseHandler[] {
  if (!process.__OPENAI_MOCK_RESPONSES) {
    process.__OPENAI_MOCK_RESPONSES = [];
  }
  return process.__OPENAI_MOCK_RESPONSES;
}

class MockResponses {
  async create(request: unknown): Promise<unknown> {
    const queue = getResponseQueue();
    if (queue.length === 0) {
      throw new Error("No OpenAI mock response configured");
    }
    const handler = queue.shift()!;
    return await handler(request);
  }
}

class MockOpenAI {
  responses: MockResponses;
  config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.responses = new MockResponses();
  }
}

export { MockOpenAI as OpenAI };
export default MockOpenAI;
