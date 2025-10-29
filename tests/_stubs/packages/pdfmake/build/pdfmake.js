const pdfMake = {
  vfs: {},
  createPdf(docDefinition) {
    return {
      getBuffer(callback) {
        const payload = JSON.stringify({ docDefinition });
        callback(Buffer.from(payload));
      },
    };
  },
};

export default pdfMake;
export { pdfMake };
