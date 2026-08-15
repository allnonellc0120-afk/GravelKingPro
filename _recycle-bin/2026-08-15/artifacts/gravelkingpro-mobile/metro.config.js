const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude pnpm temp directories from the file watcher to avoid ENOENT crashes
// when pnpm creates/deletes temp dirs during installs while Metro is running.
config.watchFolders = [
  path.resolve(__dirname, "../.."),
];
config.resolver = {
  ...config.resolver,
  blockList: [
    /node_modules\/.*\/node_modules\/.*_tmp_.*/,
    /\.pnpm\/.*_tmp_.*/,
  ],
};

module.exports = config;
