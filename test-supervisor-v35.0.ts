/**
 * MOTHER v35.0: End-to-End Test for Supervisor
 * 
 * Tests the complete DGM loop:
 * 1. Call supervisor.evolve with a goal
 * 2. Poll supervisor.getStatus to monitor progress
 * 3. Verify checkpoints are saved in langgraph_checkpoints table
 */

import { getDb } from "./server/db";
import { langgraphCheckpoints } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const PRODUCTION_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app";

async function testSupervisorEndToEnd() {
  console.log("🧪 MOTHER v35.0 End-to-End Test\n");

  // Step 1: Call supervisor.evolve
  console.log("Step 1: Calling supervisor.evolve...");
  const evolveResponse = await fetch(`${PRODUCTION_URL}/api/trpc/mother.supervisor.evolve?batch=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "0": {
        json: {
          goal: "Read the file package.json and save its name field to memory",
        },
      },
    }),
  });

  if (!evolveResponse.ok) {
    console.error("❌ supervisor.evolve failed:", evolveResponse.statusText);
    console.error(await evolveResponse.text());
    return;
  }

  const evolveResult = await evolveResponse.json();
  console.log("✅ supervisor.evolve response:", JSON.stringify(evolveResult, null, 2));

  // Parse run_id from tRPC batch response
  let runId: string | undefined;
  
  if (Array.isArray(evolveResult) && evolveResult[0]?.result?.data?.json) {
    runId = evolveResult[0].result.data.json.run_id;
  } else if (evolveResult.result?.data?.json) {
    runId = evolveResult.result.data.json.run_id;
  }
  
  if (!runId) {
    console.error("❌ No run_id returned from supervisor.evolve");
    console.error("Response:", JSON.stringify(evolveResult, null, 2));
    return;
  }

  console.log(`\n📌 Run ID: ${runId}\n`);

  // Step 2: Poll supervisor.getStatus
  console.log("Step 2: Polling supervisor.getStatus...");
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max (1 second interval)

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

    const statusResponse = await fetch(
      `${PRODUCTION_URL}/api/trpc/mother.supervisor.getStatus?batch=1&input=${encodeURIComponent(
        JSON.stringify({ "0": { json: { run_id: runId } } })
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!statusResponse.ok) {
      console.error("❌ supervisor.getStatus failed:", statusResponse.statusText);
      console.error(await statusResponse.text());
      return;
    }

    const statusResult = await statusResponse.json();
    const status = statusResult.result?.data?.status;
    const currentNode = statusResult.result?.data?.current_node;
    const messageCount = statusResult.result?.data?.message_count;

    console.log(
      `[Attempt ${attempts + 1}/${maxAttempts}] Status: ${status}, Current Node: ${currentNode}, Messages: ${messageCount}`
    );

    if (status === "completed") {
      console.log("\n✅ Supervisor execution completed!");
      console.log("Full status:", JSON.stringify(statusResult.result.data, null, 2));
      break;
    }

    if (status === "not_found") {
      console.log("⏳ Run not started yet, waiting...");
    }

    attempts++;
  }

  if (attempts >= maxAttempts) {
    console.warn("\n⚠️ Timeout: Supervisor did not complete within 30 seconds");
  }

  // Step 3: Verify checkpoints in database
  console.log("\nStep 3: Verifying checkpoints in database...");
  const db = await getDb();
  if (!db) {
    console.error("❌ Database connection failed");
    return;
  }

  const checkpoints = await db
    .select()
    .from(langgraphCheckpoints)
    .where(eq(langgraphCheckpoints.threadId, runId))
    .orderBy(langgraphCheckpoints.createdAt);

  console.log(`\n✅ Found ${checkpoints.length} checkpoints in database:`);
  checkpoints.forEach((checkpoint, index) => {
    console.log(`  [${index + 1}] Checkpoint ID: ${checkpoint.checkpointId}`);
    console.log(`      Parent: ${checkpoint.parentCheckpointId || "none"}`);
    console.log(`      Created: ${checkpoint.createdAt}`);
  });

  if (checkpoints.length === 0) {
    console.warn("\n⚠️ No checkpoints found! This indicates the Supervisor did not execute properly.");
  } else {
    console.log("\n🎉 SUCCESS: End-to-end test completed! Checkpoints are being saved correctly.");
  }
}

testSupervisorEndToEnd().catch((error) => {
  console.error("❌ Test failed with error:", error);
  process.exit(1);
});
