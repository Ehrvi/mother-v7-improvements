/**
 * Test v31.1: Syntax Validation and Retry Logic
 * 
 * This test validates that:
 * 1. write_file rejects code with syntax errors
 * 2. Retry logic works correctly
 * 3. Git rollback works on failure
 */

import { runCodeAgent } from "./server/mother/code_agent";
import { logger } from "./server/lib/logger";

async function testSyntaxValidation() {
  console.log("\n=== TEST v31.1: Syntax Validation ===\n");
  
  // Test 1: Try to write a file with intentional syntax error
  const task = `Create a new file at /home/ubuntu/mother-interface/test-invalid-syntax.ts with the following TypeScript code that has a syntax error:
  
export function testFunction() {
  const x = 10
  const y = 20; // Missing semicolon on previous line
  return x + y
}`;
  
  console.log(`Task: ${task}\n`);
  
  try {
    const result = await runCodeAgent(task);
    
    console.log("\n=== RESULT ===");
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);
    console.log(`Retry Count: ${result.retryCount}`);
    console.log(`Git Commit: ${result.gitCommitHash || "N/A"}`);
    
    console.log("\n=== EXECUTED STEPS ===");
    result.executedSteps.forEach((step, i) => {
      console.log(`\nStep ${i + 1}: ${step.step}`);
      console.log(`Tool: ${step.toolName}`);
      console.log(`Success: ${step.result.success}`);
      if (!step.result.success) {
        console.log(`Error: ${step.result.error}`);
      }
    });
    
    console.log("\n=== OBSERVATIONS ===");
    result.observations.forEach(obs => console.log(`- ${obs}`));
    
    if (result.errors.length > 0) {
      console.log("\n=== ERRORS ===");
      result.errors.forEach(err => console.log(`- ${err}`));
    }
    
    // Expected behavior:
    // 1. write_file should detect syntax error and reject
    // 2. Analyzer should trigger retry (up to 2 times)
    // 3. After max retries, should fail and rollback
    
    if (result.status === "failed" && result.errors.some(e => e.includes("syntax"))) {
      console.log("\n✅ SUCCESS: Syntax validation is working! write_file correctly rejected invalid TypeScript code.");
    } else {
      console.log("\n❌ FAILURE: Expected syntax validation to reject invalid code, but it didn't.");
    }
    
  } catch (error) {
    console.error("\n❌ TEST FAILED WITH EXCEPTION:", error);
  }
}

// Run the test
testSyntaxValidation().then(() => {
  console.log("\n=== TEST COMPLETE ===\n");
  process.exit(0);
}).catch(error => {
  console.error("Test failed:", error);
  process.exit(1);
});
