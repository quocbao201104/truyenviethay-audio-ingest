const fs = require("fs/promises");
const path = require("path");

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
};

const removeDir = async (dirPath) => {
  await fs.rm(dirPath, { recursive: true, force: true });
};

const listFiles = async (dirPath) => {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  return items.filter((item) => item.isFile()).map((item) => path.join(dirPath, item.name));
};

module.exports = {
  ensureDir,
  removeDir,
  listFiles,
};
