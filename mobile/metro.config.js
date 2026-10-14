// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// The repo root is an npm workspace (server + client) with its own node_modules (web React etc.).
// The mobile app is deliberately NOT part of that workspace: keep Metro inside mobile/ so it never
// picks up a second copy of react / react-native from ../node_modules.
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
