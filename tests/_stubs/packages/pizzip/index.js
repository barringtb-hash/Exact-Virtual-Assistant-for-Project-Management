export default class PizZip {
  constructor(buffer = Buffer.alloc(0)) {
    this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer));
  }

  file() {
    return this.buffer;
  }

  getZip() {
    return {
      generate: ({ type } = {}) => {
        if (type === "nodebuffer") {
          return Buffer.from(this.buffer);
        }
        return this.buffer.toString("base64");
      },
    };
  }
}
