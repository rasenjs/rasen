module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Metro HMR injection for rasen components (only files using com()).
    ['@rasenjs/react-native/babel', { hmr: true }],
  ],
};
