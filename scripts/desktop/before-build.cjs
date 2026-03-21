module.exports = async function beforeBuild() {
  // The desktop shell is packaged from dist/desktop-app and does not need
  // electron-builder to install or rebuild production dependencies.
  return false;
};
