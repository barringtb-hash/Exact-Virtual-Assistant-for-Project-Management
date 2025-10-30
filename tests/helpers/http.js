export function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: Object.create(null),
    body: undefined,
    sentJson: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.sentJson = true;
      this.body = payload;
      if (!this.headers["content-type"]) {
        this.setHeader("content-type", "application/json");
      }
      return this;
    },
    send(payload) {
      this.sentJson = false;
      this.body = payload;
      if (Buffer.isBuffer(payload)) {
        if (!this.headers["content-type"]) {
          this.setHeader(
            "content-type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
        }
      }
      return this;
    },
  };
  return res;
}

export async function withStubbedReadFile(fsModule, override, run) {
  const previous = fsModule.readFile;
  fsModule.readFile = override;
  try {
    await run();
  } finally {
    fsModule.readFile = previous;
  }
}
