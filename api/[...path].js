const { handle } = require("../backend/server");

module.exports = async (req, res) => {
  await handle(req, res);
};

