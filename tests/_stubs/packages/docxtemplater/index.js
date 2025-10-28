export default class Docxtemplater {
  constructor() {
    this.data = {};
    this.__documentXml = "<w:document></w:document>";
  }

  setData(data) {
    if (data && typeof data === "object") {
      this.data = data;
    }
  }

  render() {
    if (typeof Docxtemplater.__documentXmlFactory === "function") {
      try {
        this.__documentXml =
          Docxtemplater.__documentXmlFactory(this) ?? this.__documentXml;
      } catch (error) {
        Docxtemplater.__documentXmlFactory = undefined;
        throw error;
      }
    }
    return true;
  }

  getZip() {
    const payload = JSON.stringify(this.data);
    const documentXml =
      typeof this.__documentXml === "string"
        ? this.__documentXml
        : "<w:document></w:document>";
    return {
      file: (name) => {
        if (name === "word/document.xml") {
          return {
            asText: () => documentXml,
          };
        }
        return null;
      },
      generate: ({ type } = {}) => {
        if (type === "nodebuffer") {
          return Buffer.from(payload, "utf8");
        }
        return payload;
      },
    };
  }
}

Docxtemplater.__documentXmlFactory = undefined;

Docxtemplater.__setDocumentXmlFactory = function setDocumentXmlFactory(factory) {
  if (typeof factory === "function" || factory == null) {
    Docxtemplater.__documentXmlFactory = factory ?? undefined;
  }
};
