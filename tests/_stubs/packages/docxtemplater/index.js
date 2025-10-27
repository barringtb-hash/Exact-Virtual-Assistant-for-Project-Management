export default class Docxtemplater {
  constructor() {
    this.data = {};
  }

  setData(data) {
    if (data && typeof data === "object") {
      this.data = data;
    }
  }

  render() {
    return true;
  }

  getZip() {
    const payload = JSON.stringify(this.data);
    return {
      generate: ({ type } = {}) => {
        if (type === "nodebuffer") {
          return Buffer.from(payload, "utf8");
        }
        return payload;
      },
    };
  }
}
