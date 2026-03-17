module.exports = async function beforeBuild() {
  // Returning true (or undefined) allows the build to proceed.
  // Returning false would cancel the electron-builder build.
  return true;
};
