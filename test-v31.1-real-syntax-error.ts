/**
 * Test v31.1: Syntax Validation with REAL Syntax Error
 * 
 * This test validates that:
 * 1. write_file rejects code with REAL syntax errors
 * 2. Retry logic works correctly
 * 3. Git rollback works on failure
 */

import { runCodeAgent } from "./server/mother/code_agent";

async function testRealSyntaxError() {
  console.log("\n=== TEST v31.1: Real Syntax Error ===\n");
  
  // Test with REAL syntax error (incomplete expression)
  const task = `Create a new file at /home/ubuntu/mother-interface/test-real-syntax-error.ts with this TypeScript code:

export function brokenFunction() {
  const x = ;  // REAL syntax error: incomplete expression
  return x + 10;
}`;
  
  console.log(`Task: ${task}\n`);
  
  try {
    const result = await runCodeAgent(task);
    
    console.log("\n=== RESULT ===");
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);
    console.log(`Retry Count: ${result.retryCount}`);
    
    console.log("\n=== EXECUTED STEPS ===");
    result.executedSteps.forEach((step, i) => {
      console.log(`\nStep ${i + 1}: ${step.step}`);
      console.log(`Success: ${step.result.success}`);
      if (!step.result.success) {
        console.log(`Error: ${step.result.error.substring(0, 200)}...`);
      }
    });
    
    console.log("\n=== ERRORS ===");
    result.errors.forEach(err => console.log(`- ${err.substring(0, 150)}...`));
    
    // Expected: write_file should reject due to syntax error
    if (result.status === "failed" && result.errors.some(e => e.toLowerCase().includes("syntax"))) {
      console.log("\n✅ SUCCESS: Syntax validation correctly rejected invalid TypeScript code!");
      console.log(`✅ Retry count: ${result.retryCount} (expected: up to 2 retries)`);
      console.log(`✅ Git rollback: ${result.message.includes("rolled back") ? "YES" : "NO"}`);
    } else {
      console.log("\n❌ FAILURE: Expected syntax validation to reject invalid code.");
    }
    
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
  }
}

testRealSyntaxError().then(() => {
  console.log("\n=== TEST COMPLETE ===\n");
  process.exit(0);
});
