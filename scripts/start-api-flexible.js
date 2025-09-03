#!/usr/bin/env node

/**
 * Cline API Server - Simple version
 */

const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs")

// Configuration
const config = {
	CLINE_API_PORT: process.env.CLINE_API_PORT || "26042",
	API_MODE: "true",
	STANDALONE_MODE: "true",
	EXTENSION_DIR: process.env.EXTENSION_DIR || process.cwd(),
	INSTALL_DIR: process.env.INSTALL_DIR || path.join(process.cwd(), "dist-standalone"),
	IS_DEV: process.env.IS_DEV || "false",
}

console.log("🚀 Starting Cline with API support...")

const clineCorePath = path.join(config.INSTALL_DIR, "cline-core.js")
if (!fs.existsSync(clineCorePath)) {
	console.error(`❌ Error: cline-core.js not found at ${clineCorePath}`)
	console.error("   Please run: npm run compile-standalone")
	process.exit(1)
}

// Set environment variables
Object.keys(config).forEach((key) => {
	process.env[key] = config[key]
})

console.log("📁 Install Dir:", config.INSTALL_DIR)
console.log("🔌 API Port:", config.CLINE_API_PORT)
console.log("🌐 API Mode: Enabled")
console.log("")

// Start the Cline core process
const clineProcess = spawn("node", [clineCorePath], {
	stdio: "inherit",
	env: process.env,
	cwd: process.cwd(),
})

clineProcess.on("error", (error) => {
	console.error(`❌ Failed to start Cline: ${error.message}`)
	process.exit(1)
})

clineProcess.on("close", (code) => {
	console.log(`🔴 Cline process exited with code ${code}`)
	process.exit(code)
})

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n🛑 Shutting down Cline...")
	clineProcess.kill("SIGINT")
})

process.on("SIGTERM", () => {
	console.log("\n🛑 Shutting down Cline...")
	clineProcess.kill("SIGTERM")
})

// Show helpful information after a short delay
setTimeout(() => {
	console.log("")
	console.log("📊 API Endpoints:")
	console.log(`   Health:    http://localhost:${config.CLINE_API_PORT}/health`)
	console.log(`   Chat:      POST http://localhost:${config.CLINE_API_PORT}/api/chat`)
	console.log(`   Tasks:     http://localhost:${config.CLINE_API_PORT}/api/tasks`)
	console.log(`   WebSocket: ws://localhost:${config.CLINE_API_PORT}`)
	console.log("")
	console.log("💡 Example usage:")
	console.log(`   curl http://localhost:${config.CLINE_API_PORT}/health`)
	console.log("")
}, 2000)
