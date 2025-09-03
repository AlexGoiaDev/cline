#!/usr/bin/env node

/**
 * Simple test script for Cline API
 */

console.log("🧪 Testing Cline API...\n")

// Set environment variables for API mode
process.env.API_MODE = "true"
process.env.STANDALONE_MODE = "true"
process.env.CLINE_API_PORT = "26042"

const { spawn } = require("child_process")
const path = require("path")

const clineCorePath = path.join(__dirname, "..", "dist-standalone", "cline-core.js")

console.log("📁 Starting Cline Core with API...")
console.log("🔌 API will be available on port 26042")
console.log("📊 Health check: http://localhost:26042/health")
console.log("💬 WebSocket: ws://localhost:26042")
console.log("")
console.log("💡 Test commands:")
console.log("   curl http://localhost:26042/health")
console.log('   curl -X POST http://localhost:26042/api/chat -H "Content-Type: application/json" -d \'{"message": "Hello!"}\'')
console.log("")
console.log("🚀 Starting...\n")

// Start Cline with API enabled
const clineProcess = spawn("node", [clineCorePath], {
	stdio: "inherit",
	env: process.env,
	cwd: process.cwd(),
})

clineProcess.on("error", (error) => {
	console.error(`❌ Failed to start: ${error.message}`)
	process.exit(1)
})

clineProcess.on("close", (code) => {
	console.log(`🔴 Process exited with code ${code}`)
	process.exit(code)
})

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n🛑 Shutting down...")
	clineProcess.kill("SIGINT")
})

process.on("SIGTERM", () => {
	console.log("\n🛑 Shutting down...")
	clineProcess.kill("SIGTERM")
})
