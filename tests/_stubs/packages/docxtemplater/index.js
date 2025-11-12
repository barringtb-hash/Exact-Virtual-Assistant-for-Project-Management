export default class Docxtemplater {
  constructor(zip) {
    this.data = {};
    this.__documentXml = "<w:document></w:document>";
    const templateBuffer =
      zip && typeof zip === "object" && Buffer.isBuffer(zip.buffer)
        ? zip.buffer
        : Buffer.alloc(0);
    this.__templateBuffer = Buffer.from(templateBuffer);
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
    const hasTemplate = this.__templateBuffer.length > 0;
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
          if (hasTemplate) {
            return Buffer.from(this.__templateBuffer);
          }
          return Buffer.from(payload, "utf8");
        }
        if (hasTemplate) {
          return Buffer.from(this.__templateBuffer).toString("base64");
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
