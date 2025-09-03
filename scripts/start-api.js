#!/usr/bin/env node

/**
 * Cline Standalone API Server
 *
 * This script starts Cline in standalone mode with the hostbridge API enabled.
 * It provides both REST and WebSocket endpoints for interacting with Cline programmatically.
 */

const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs")

// Configuration
const config = {
	CLINE_API_PORT: process.env.CLINE_API_PORT || "26042", // Changed from 3000 to avoid conflicts
	API_MODE: "true",
	STANDALONE_MODE: "true",
	EXTENSION_DIR: process.env.EXTENSION_DIR || process.cwd(),
	INSTALL_DIR: process.env.INSTALL_DIR || path.join(process.cwd(), "dist-standalone"),
	IS_DEV: process.env.IS_DEV || "false",
	// 🔑 AÑADE TU CLAVE DE OPENAI AQUÍ (reemplaza con tu clave real):
	OPENAI_API_KEY: process.env.OPENAI_API_KEY || "PON-TU-CLAVE-REAL-DE-OPENAI-AQUI",
}

// Validate that required files exist
const clineCorePath = path.join(config.INSTALL_DIR, "cline-core.js")
if (!fs.existsSync(clineCorePath)) {
	console.error(`❌ Error: cline-core.js not found at ${clineCorePath}`)
	console.error("   Please run: npm run compile-standalone")
	process.exit(1)
}

console.log("🚀 Starting Cline Standalone API Server...")
console.log("📁 Install Dir:", config.INSTALL_DIR)
console.log("🔌 API Port:", config.CLINE_API_PORT)
console.log("🌐 API Mode: Enabled")
console.log("🤖 OpenAI Key:", config.OPENAI_API_KEY ? "✅ Configured" : "❌ Missing")
console.log("")
console.log("ℹ️  Note: Cline core services use ports 26040-26041")
console.log("   API Server uses port 26042 to avoid conflicts")
console.log("")

// Set environment variables
Object.keys(config).forEach((key) => {
	process.env[key] = config[key]
})

// Start the Cline core process
const clineProcess = spawn("node", [clineCorePath], {
	stdio: "inherit",
	env: process.env,
	cwd: process.cwd(),
})

// Handle process events
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
	console.log("\n🛑 Shutting down Cline API server...")
	clineProcess.kill("SIGINT")
})

process.on("SIGTERM", () => {
	console.log("\n🛑 Shutting down Cline API server...")
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
	console.log(`   curl -X POST http://localhost:${config.CLINE_API_PORT}/api/chat \\`)
	console.log(`        -H "Content-Type: application/json" \\`)
	console.log(`        -d '{"message": "Hello Cline!"}'`)
	console.log("")
}, 2000)
