module.exports = {
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  documentDirectory: '/mock/documents/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
};
