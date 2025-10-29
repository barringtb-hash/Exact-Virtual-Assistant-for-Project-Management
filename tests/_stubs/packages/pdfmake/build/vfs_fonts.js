const vfs = {};

Object.assign(vfs, {
  "Roboto-Regular.ttf": "dummy-font-contents",
});

const pdfMakeFonts = {
  pdfMake: {
    vfs,
  },
  vfs,
};

export default pdfMakeFonts;
export { pdfMakeFonts, vfs };
