const path = require('path');
const fs = require('fs');

// Simulate the path resolution from the MediaHandler
const uploadDirectory = process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");
console.log('UPLOADS_DIR from env:', process.env.UPLOADS_DIR);
console.log('Resolved uploadDirectory:', uploadDirectory);
console.log('uploadDirectory exists:', fs.existsSync(uploadDirectory));

// Check subdirectories
const subDirectories = {
  "images": path.join(uploadDirectory, "images"),
  "pdfs": path.join(uploadDirectory, "pdfs"),
  "logos": path.join(uploadDirectory, "logos"),
  "explanations": path.join(uploadDirectory, "explanations"),
  "study-packs": path.join(uploadDirectory, "study-packs")
};

console.log('\nSubdirectories:');
Object.entries(subDirectories).forEach(([key, dir]) => {
  console.log(`${key}: ${dir} - exists: ${fs.existsSync(dir)}`);
});

// Try to create directories like the MediaHandler does
try {
  console.log('\nTrying to create directories...');
  if (!fs.existsSync(uploadDirectory)) {
    console.log(`Creating main directory: ${uploadDirectory}`);
    fs.mkdirSync(uploadDirectory, { recursive: true });
  }
  
  Object.values(subDirectories).forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`Creating subdirectory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  console.log('Directory creation successful!');
} catch (error) {
  console.error('Directory creation failed:', error.message);
}