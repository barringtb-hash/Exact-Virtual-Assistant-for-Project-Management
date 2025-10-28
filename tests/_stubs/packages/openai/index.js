export default class OpenAI {
  constructor(options = {}) {
    const factory = globalThis.__OPENAI_MOCK_FACTORY__;
    if (typeof factory === "function") {
      const instance = factory(options);
      if (instance !== undefined) {
        return instance;
      }
    }

    this.chat = {
      completions: {
        async create() {
          throw new Error("OpenAI mock factory not configured for chat.completions.create");
        },
      },
    };

    this.responses = {
      async create() {
        throw new Error("OpenAI mock factory not configured for responses.create");
      },
    };
  }
}
