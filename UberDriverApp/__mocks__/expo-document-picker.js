module.exports = {
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: null }),
};
