const electron = require('electron');
console.log('electron module:', typeof electron);
console.log('keys:', Object.keys(electron));
console.log('app:', typeof electron.app);
if (electron.app) {
  console.log('app.whenReady:', typeof electron.app.whenReady);
}
