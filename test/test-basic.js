#!/usr/bin/env node

import { RpfFile } from '../dist/rpf.js';
import { RpfManager } from '../dist/rpf-manager.js';

async function testBasicFunctionality() {
  console.log("Testing GTA V Browser MCP Server basic functionality...\n");

  try {
    // Test 1: Create RPF Manager instance
    console.log("Test 1: Creating RPF Manager instance...");
    const manager = new RpfManager();
    console.log("✓ RPF Manager created successfully\n");

    // Test 2: Test RPF file reading (with a dummy file for testing)
    console.log("Test 2: Testing RPF file structure...");
    const testRpf = new RpfFile("test.rpf", "test.rpf", 0);
    console.log("✓ RPF file instance created\n");

    // Test 3: Verify encryption types
    console.log("Test 3: Checking encryption types...");
    const { RpfEncryption } = await import('../dist/crypto.js');
    console.log("  - NONE:", RpfEncryption.NONE);
    console.log("  - OPEN:", RpfEncryption.OPEN);
    console.log("  - AES:", RpfEncryption.AES);
    console.log("  - NG:", RpfEncryption.NG);
    console.log("✓ Encryption types loaded correctly\n");

    // Test 4: Verify crypto functions exist
    console.log("Test 4: Checking crypto functions...");
    const { GTACrypto } = await import('../dist/crypto.js');
    if (typeof GTACrypto.decryptAES === 'function' &&
        typeof GTACrypto.encryptAES === 'function' &&
        typeof GTACrypto.decryptNG === 'function' &&
        typeof GTACrypto.encryptNG === 'function') {
      console.log("✓ All crypto functions available\n");
    } else {
      throw new Error("Missing crypto functions");
    }

    console.log("All basic tests passed!");
    console.log("\nTo use the server, run:");
    console.log("  node dist/index.js \"C:/Path/To/GTA V\"");

  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  }
}

testBasicFunctionality();