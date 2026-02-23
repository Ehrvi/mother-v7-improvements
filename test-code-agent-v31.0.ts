/**
 * MOTHER v31.0 - CodeAgent Validation Test
 * 
 * Tests the CodeAgent with the validation task from README-V31.0.md:
 * "Add a new field 'priority' of type 'number' with default value 0 to the 'queries' table in drizzle/schema.ts"
 */

import { runCodeAgent } from "./server/mother/code_agent";
import { logger } from "./server/lib/logger";

async function main() {
  console.log("=".repeat(80));
  console.log("MOTHER v31.0 - CodeAgent Validation Test");
  console.log("=".repeat(80));
  console.log();
  
  const task = "Add a new field 'priority' of type 'number' with default value 0 to the 'queries' table in drizzle/schema.ts";
  
  console.log(`Task: ${task}`);
  console.log();
  console.log("Starting CodeAgent execution...");
  console.log();
  
  try {
    const result = await runCodeAgent(task);
    
    console.log("=".repeat(80));
    console.log("EXECUTION COMPLETED");
    console.log("=".repeat(80));
    console.log();
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);
    console.log();
    
    console.log("Plan:");
    result.plan.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.description}`);
      console.log(`     Tool: ${step.tool}`);
      console.log(`     Input: ${JSON.stringify(step.input)}`);
    });
    console.log();
    
    console.log("Executed Steps:");
    result.executedSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.step}`);
      console.log(`     Tool: ${step.toolName}`);
      console.log(`     Success: ${step.result.success}`);
      if (!step.result.success) {
        console.log(`     Error: ${step.result.error}`);
      }
    });
    console.log();
    
    if (result.observations.length > 0) {
      console.log("Observations:");
      result.observations.forEach(obs => console.log(`  - ${obs}`));
      console.log();
    }
    
    if (result.errors.length > 0) {
      console.log("Errors:");
      result.errors.forEach(err => console.log(`  - ${err}`));
      console.log();
    }
    
    console.log("=".repeat(80));
    
    if (result.status === "completed") {
      console.log("✅ SUCCESS: CodeAgent completed the task successfully!");
      console.log();
      console.log("Next steps:");
      console.log("1. Check drizzle/schema.ts to verify the 'priority' field was added");
      console.log("2. Run 'pnpm db:push' to apply the migration");
      console.log("3. Verify the database schema was updated");
    } else {
      console.log("❌ FAILED: CodeAgent failed to complete the task.");
      console.log();
      console.log("Check the errors above for details.");
    }
    
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("Test failed with exception:", error);
    process.exit(1);
  }
}

main();
