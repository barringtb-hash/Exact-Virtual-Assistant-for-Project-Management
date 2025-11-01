export default {
  launch: async () => ({
    newPage: async () => ({
      setContent: async () => {},
      pdf: async () => Buffer.alloc(0),
      close: async () => {},
    }),
    close: async () => {},
  }),
};
