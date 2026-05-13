const { execSync } = require('child_process');

try {
  console.log('Building plugin...');
  execSync('node ./node_modules/esbuild/lib/main.js main.ts --bundle --external:obsidian --external:electron --outfile=main.js --format=cjs --platform=node', {
    stdio: 'inherit',
    cwd: __dirname
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}