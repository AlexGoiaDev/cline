import { ExternalDiffViewProvider } from "@hosts/external/ExternalDiffviewProvider"
import { ExternalWebviewProvider } from "@hosts/external/ExternalWebviewProvider"
import { ExternalHostBridgeClientManager } from "@hosts/external/host-bridge-client-manager"
import { WebviewProviderType } from "@shared/webview/types"
import { initialize, tearDown } from "@/common"
import { WebviewProvider } from "@/core/webview"
import { AuthHandler } from "@/hosts/external/AuthHandler"
import { HostProvider } from "@/hosts/host-provider"
import { DiffViewProvider } from "@/integrations/editor/DiffViewProvider"
import { ClineHostBridge } from "./hostbridge-api"
import { startProtobusService, waitForHostBridgeReady } from "./protobus-service"
import { log } from "./utils"
import { extensionContext } from "./vscode-context"

// Global hostbridge instance
let hostbridge: ClineHostBridge | null = null

async function main() {
	log("\n\n\nStarting cline-core service...\n\n\n")

	// Start API server FIRST if in API mode (it provides the hostbridge)
	if (process.env.API_MODE === "true" || process.env.STANDALONE_MODE === "true") {
		log("Starting Cline API Server...")
		try {
			hostbridge = new ClineHostBridge()
			await hostbridge.start()
			log("✅ API Server ready!")
		} catch (err) {
			log(`Warning: Could not start API server: ${err}`)
		}
	}

	try {
		await waitForHostBridgeReady()
		log("HostBridge is serving; continuing startup")
	} catch (err) {
		log(`ERROR: HostBridge error: ${String(err)}`)
		process.exit(1)
	}

	setupHostProvider()

	// Set up global error handlers to prevent process crashes
	setupGlobalErrorHandlers()

	const webviewProvider = await initialize(extensionContext)

	AuthHandler.getInstance().setEnabled(true)

	// Connect the controller to the API if hostbridge is running
	if (hostbridge && webviewProvider.controller) {
		hostbridge.setClineController(webviewProvider.controller)
		log("✅ API Controller connected to Cline")
	}

	startProtobusService(webviewProvider.controller)
}

function setupHostProvider() {
	const createWebview = (_: WebviewProviderType): WebviewProvider => {
		return new ExternalWebviewProvider(extensionContext, WebviewProviderType.SIDEBAR)
	}
	const createDiffView = (): DiffViewProvider => {
		return new ExternalDiffViewProvider()
	}
	const getCallbackUri = (): Promise<string> => {
		return AuthHandler.getInstance().getCallbackUri()
	}

	HostProvider.initialize(createWebview, createDiffView, new ExternalHostBridgeClientManager(), log, getCallbackUri)
}

/**
 * Sets up global error handlers to prevent the process from crashing
 * on unhandled exceptions and promise rejections
 */
function setupGlobalErrorHandlers() {
	// Handle unhandled exceptions
	process.on("uncaughtException", (error: Error) => {
		log(`ERROR: Uncaught exception: ${error.message}`)
		log(`Stack trace: ${error.stack}`)
		// Log the error but don't exit the process
	})

	// Handle unhandled promise rejections
	process.on("unhandledRejection", (reason: any, _promise: Promise<any>) => {
		log(`ERROR: Unhandled promise rejection: ${reason}`)
		if (reason instanceof Error) {
			log(`Stack trace: ${reason.stack}`)
		}
		// Log the error but don't exit the process
	})

	// Handle process warnings (optional, for debugging)
	process.on("warning", (warning: Error) => {
		log(`Process Warning: ${warning.name}: ${warning.message}`)
	})

	// Graceful shutdown handlers
	process.on("SIGINT", async () => {
		log("Received SIGINT, shutting down gracefully...")
		if (hostbridge) {
			await hostbridge.stop()
		}
		process.exit(0)
	})

	process.on("SIGTERM", async () => {
		log("Received SIGTERM, shutting down gracefully...")
		tearDown()
		if (hostbridge) {
			await hostbridge.stop()
		}
		process.exit(0)
	})
}

main()
