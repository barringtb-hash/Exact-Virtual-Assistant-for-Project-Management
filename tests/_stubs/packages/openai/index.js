class OpenAI {
  constructor(options = {}) {
    this.apiKey = options?.apiKey || "";
    this.__testResponse = options?.__testResponse;
    const resolvePayload = () => {
      if (typeof this.__testResponse === "function") {
        try {
          const result = this.__testResponse();
          if (result) {
            return result;
          }
        } catch {
          // fall through to default payload
        }
      }

      if (this.__testResponse && typeof this.__testResponse === "object") {
        return this.__testResponse;
      }

      return {
        projectTitle: "Launch Initiative",
        projectManager: "Alex Example",
        sponsorName: "Casey Example",
        startDate: "2024-03-15",
        scopeIn: ["Discovery", "Pilot"],
        scopeOut: ["Operations"],
        successMetrics: [
          {
            benefit: "Adoption",
            metric: "Usage",
            system_of_measurement: "percent",
          },
        ],
      };
    };

    this.chat = {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(resolvePayload()),
              },
            },
          ],
        }),
      },
    };
  }
}

export default OpenAI;
export { OpenAI };
