const { exec } = require('child_process');
const path = require('path');

console.log('Starting build process...');
console.log('Step 1: Installing dependencies...');

const npmProcess = exec('npm.cmd install', {
  cwd: __dirname
});

npmProcess.stdout.on('data', (data) => {
  console.log('npm stdout:', data.toString());
});

npmProcess.stderr.on('data', (data) => {
  console.log('npm stderr:', data.toString());
});

npmProcess.on('close', (code) => {
  console.log(`npm install exited with code ${code}`);
  
  if (code !== 0) {
    console.error('npm install failed!');
    process.exit(1);
  }
  
  console.log('Step 2: Building plugin...');
  
  const buildProcess = exec('npx obsidian-plugin build', {
    cwd: __dirname
  });
  
  buildProcess.stdout.on('data', (data) => {
    console.log('build stdout:', data.toString());
  });
  
  buildProcess.stderr.on('data', (data) => {
    console.log('build stderr:', data.toString());
  });
  
  buildProcess.on('close', (buildCode) => {
    console.log(`Build process exited with code ${buildCode}`);
    
    if (buildCode !== 0) {
      console.error('Build failed!');
      process.exit(1);
    } else {
      console.log('✓ Build completed successfully!');
      process.exit(0);
    }
  });
});
