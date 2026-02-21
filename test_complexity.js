const fs = require('fs');
const path = require('path');

// Mock window environment
global.window = {};

// Load the library
const libPath = path.join(__dirname, 'complexityAnalyzer.js');
const libContent = fs.readFileSync(libPath, 'utf8');
eval(libContent);

const analyzer = global.window.ComplexityAnalyzer;

console.log('Running Complexity Analyzer Tests...\n');

const tests = [
  {
    name: 'Constant Time (O(1))',
    code: 'const a = 1; const b = 2; console.log(a + b);',
    expectedTime: 'O(1)'
  },
  {
    name: 'Linear Time (O(n)) - Simple Loop',
    code: 'for (let i = 0; i < n; i++) { console.log(i); }',
    expectedTime: 'O(n)'
  },
  {
    name: 'Quadratic Time (O(n^2)) - Nested Loop',
    code: 'for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { console.log(i, j); } }',
    expectedTime: 'O(n^2)'
  },
  {
    name: 'Logarithmic Time (O(log n)) - Binary Search Pattern',
    code: 'while (low <= high) { mid = Math.floor((low + high) / 2); if (arr[mid] < val) low = mid + 1; else high = mid - 1; }',
    expectedTime: 'O(log n)'
  },
  {
    name: 'Recursive (O(2^n))',
    code: 'function fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); }',
    expectedTime: 'O(2^n)'
  }
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  try {
    const result = analyzer.analyze(test.code, 'javascript');
    if (result.time === test.expectedTime) {
      console.log(`✅ ${test.name}: Passed`);
      passed++;
    } else {
      console.log(`❌ ${test.name}: Failed`);
      console.log(`   Expected: ${test.expectedTime}`);
      console.log(`   Got:      ${result.time}`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${test.name}: Error - ${e.message}`);
    failed++;
  }
});

console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed`);

if (failed > 0) process.exit(1);
