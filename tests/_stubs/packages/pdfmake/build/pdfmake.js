const pdfMake = {
  vfs: {},
  createPdf(docDefinition) {
    return {
      getBuffer(callback) {
        const docJson = JSON.stringify({ docDefinition });
        const streamContent = docJson.padEnd(2048, " ");
        const pdfSections = [
          "%PDF-1.4",
          "%ÂãÏÓ",
          "1 0 obj",
          "<< /Type /Catalog /Pages 2 0 R >>",
          "endobj",
          "2 0 obj",
          "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
          "endobj",
          "3 0 obj",
          "<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] /Contents 4 0 R >>",
          "endobj",
          "4 0 obj",
          `<< /Length ${streamContent.length} >>`,
          "stream",
          streamContent,
          "endstream",
          "endobj",
          "xref",
          "0 5",
          "0000000000 65535 f ",
          "0000000010 00000 n ",
          "0000000075 00000 n ",
          "0000000140 00000 n ",
          "0000000275 00000 n ",
          "trailer",
          "<< /Root 1 0 R /Size 5 >>",
          "startxref",
          "0",
          "%%EOF",
        ];
        const pdfBuffer = Buffer.from(pdfSections.join("\n"), "utf8");
        callback(pdfBuffer);
      },
    };
  },
};

export default pdfMake;
export { pdfMake };
