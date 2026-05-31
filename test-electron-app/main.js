
console.log('process.type:', process.type);
console.log('process.resourcesPath:', process.resourcesPath);
const e = require('electron');
console.log('electron type:', typeof e);
console.log('electron.app:', typeof e.app);
process.exit(0);

