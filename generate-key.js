const { generateLicenseKey } = require('./electron/license-utils');

const hwid = process.argv[2];

if (!hwid) {
  console.log('Usage: node generate-key.js <MACHINE_ID>');
  console.log('Example: node generate-key.js MACH-A1B2C3D4');
  process.exit(1);
}

const key = generateLicenseKey(hwid);

console.log('\n=============================================');
console.log('🔑 LICENSE KEY GENERATOR 🔑');
console.log('=============================================');
console.log(`Machine ID : ${hwid}`);
console.log(`License Key: ${key}`);
console.log('=============================================\n');
