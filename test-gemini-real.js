// Test with the actual available models from the API
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Read .env.local manually
const envPath = path.join(__dirname, '.env.local');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
  console.error('Could not read .env.local file');
  process.exit(1);
}

// Parse GEMINI_API_KEY
const match = envContent.match(/GEMINI_API_KEY=(.+)/);
if (!match) {
  console.error('GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

const key = match[1].trim();
if (!key) {
  console.error('API key is empty');
  process.exit(1);
}

console.log('API key found (starts with):', key.substring(0, 10) + '...');
const genAI = new GoogleGenerativeAI(key);

// Use the actual models we found from the API list
const modelNames = [
  'gemini-flash-latest', // From API list
  'models/gemini-flash-latest', // Full path
  'gemini-pro-latest', // From API list  
  'models/gemini-pro-latest', // Full path
  'gemini-2.0-flash', // From API list
  'models/gemini-2.0-flash', // Full path
  'gemini-3.5-flash', // From API list
  'models/gemini-3.5-flash', // Full path
  'gemini-2.0-flash-001', // From API list
  'models/gemini-2.0-flash-001', // Full path
];

async function testModel(modelName) {
  try {
    console.log(`\nTesting model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Simple test prompt
    const result = await model.generateContent('Hello, respond with "OK"');
    const text = result.response.text();
    console.log(`  ✓ Success: ${text}`);
    return { modelName, success: true };
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    return { modelName, success: false, error: err.message };
  }
}

async function runTests() {
  console.log('Testing Gemini API with actual available models...');
  
  const results = [];
  for (const modelName of modelNames) {
    const result = await testModel(modelName);
    results.push(result);
    if (result.success) {
      console.log(`\n✅ Working model found: ${modelName}`);
      console.log(`Update lib/gemini.ts to use: "${modelName}"`);
      return modelName;
    }
  }
  
  console.log('\n❌ All model tests failed.');
  console.log('\nSummary of failures:');
  results.forEach(r => {
    if (!r.success) {
      console.log(`  ${r.modelName}: ${r.error}`);
    }
  });
  
  return null;
}

runTests().then(workingModel => {
  if (workingModel) {
    // Update the gemini.ts file with the working model
    const geminiPath = path.join(__dirname, 'lib', 'gemini.ts');
    let content = fs.readFileSync(geminiPath, 'utf8');
    
    // Replace the model names array with just the working model
    const newContent = content.replace(
      /const modelNames = \[[\s\S]*?\];/,
      `const modelNames = [
    "${workingModel}", // Working model from test
  ];`
    );
    
    fs.writeFileSync(geminiPath, newContent);
    console.log(`\n✅ Updated lib/gemini.ts with working model: ${workingModel}`);
  }
  process.exit(workingModel ? 0 : 1);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
