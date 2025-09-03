import { Controller } from "@core/controller/index"
import * as grpc from "@grpc/grpc-js"
import { ReflectionService } from "@grpc/reflection"
import cors from "cors"
import express, { NextFunction, Request, Response } from "express"
import * as health from "grpc-health-check"
import { createServer } from "http"
import * as os from "os"
// @ts-ignore - proto-utils.mjs no tiene tipos TypeScript
import "dotenv/config"
import { ApiProvider } from "@/shared/api"
import { getPackageDefinition } from "../../scripts/proto-utils.mjs"
import { host } from "../generated/grpc-js/index"
import { log } from "./utils"

export interface ApiResponse {
	success: boolean
	data?: any
	error?: string
	timestamp: string
}

export class ClineHostBridge {
	private app = express()
	private server = createServer(this.app)
	private port = parseInt(process.env.CLINE_API_PORT || "26042")
	private isReady = false

	// Reference to the Cline controller for real integration
	private clineController: Controller | null = null

	// gRPC server for Cline Core integration
	private grpcServer: grpc.Server | null = null
	private grpcPort = parseInt(process.env.HOST_BRIDGE_PORT || "26041")

	constructor() {
		this.setupMiddleware()
		this.setupRoutes()
		this.setupGrpcHealthCheck()
	}

	private setupMiddleware() {
		this.app.use(cors({ origin: true, credentials: true }))
		this.app.use(express.json())
		this.app.use((req: Request, res: Response, next: NextFunction) => {
			log(`API: ${req.method} ${req.path}`)
			next()
		})
	}

	private setupRoutes() {
		this.apiHealth()
		this.apiChat()
		this.apiWorkspace()
		this.apiStatus()
		this.apiMessages()
		this.taskStatus()
	}

	private apiHealth() {
		this.app.get("/health", (req: Request, res: Response) => {
			res.json({
				status: "ready",
				timestamp: new Date().toISOString(),
				message: "Cline API Server is running",
			})
		})
	}

	private apiWorkspace() {
		this.app.post("/api/workspace", (req: Request, res: Response) => {
			try {
				const { path: workspacePath } = req.body

				if (!workspacePath) {
					res.status(400).json({
						success: false,
						error: "Workspace path is required",
						timestamp: new Date().toISOString(),
					})
					return
				}

				const fs = require("fs")
				const path = require("path")

				const absolutePath = path.resolve(workspacePath)
				log(`🔍 Setting workspace: ${absolutePath}`)

				if (!fs.existsSync(absolutePath)) {
					res.status(400).json({
						success: false,
						error: `Directory does not exist: ${absolutePath}`,
						timestamp: new Date().toISOString(),
					})
					return
				}

				process.chdir(absolutePath)
				log(`📁 Workspace changed to: ${absolutePath}`)

				res.json({
					success: true,
					data: {
						message: "Workspace directory changed successfully",
						workingDirectory: process.cwd(),
					},
					timestamp: new Date().toISOString(),
				})
			} catch (error: any) {
				res.status(500).json({
					success: false,
					error: `Failed to change workspace: ${error.message}`,
					timestamp: new Date().toISOString(),
				})
			}
		})
	}

	private apiStatus() {
		this.app.get("/api/status", (req: Request, res: Response) => {
			const hasController = !!this.clineController
			const hasActiveTask = hasController && !!this.clineController?.task

			res.json({
				success: true,
				data: {
					clineReady: hasController,
					hasActiveTask: hasActiveTask,
					taskId: hasActiveTask ? this.clineController?.task?.taskId : undefined,
					uptime: process.uptime(),
					workingDirectory: process.cwd(),
				},
				timestamp: new Date().toISOString(),
			})
		})
	}

	private apiMessages() {
		this.app.get("/api/messages", (req: Request, res: Response) => {
			if (!this.clineController) {
				res.status(503).json({
					success: false,
					error: "Cline controller not initialized",
					timestamp: new Date().toISOString(),
				})
				return
			}

			const messages = this.clineController.task?.messageStateHandler?.getClineMessages() || []
			res.json({
				success: true,
				data: {
					messages: messages.map((msg: any) => ({
						type: msg.type,
						ask: msg.ask,
						say: msg.say,
						text: msg.text,
						ts: msg.ts,
						partial: msg.partial,
					})),
					taskId: this.clineController.task?.ulid || null,
				},
				timestamp: new Date().toISOString(),
			})
		})
	}

	private apiChat() {
		this.app.post("/api/chat", async (req: Request, res: Response): Promise<void> => {
			try {
				const { message, timeout = 300000 } = req.body // Default 5 minutes timeout

				if (!message) {
					res.status(400).json({
						success: false,
						error: "Message is required",
						timestamp: new Date().toISOString(),
					})
					return
				}

				if (!this.clineController) {
					res.status(503).json({
						success: false,
						error: "Cline controller not initialized",
						timestamp: new Date().toISOString(),
					})
					return
				}

				log(`💬 Processing chat message: "${message}" (timeout: ${timeout}ms)`)

				try {
					log(`🆕 Creating new task with: "${message}"`)

					// Force OpenAI configuration right before creating task
					await this.ensureOpenAIConfiguration()

					// Use the controller's initTask method directly (core approach)
					await this.clineController.togglePlanActMode("plan")
					await this.clineController.initTask(message, [], []) // task, images, files
					log(`✅ New task created successfully using core`)
					await this.clineController.togglePlanActMode("plan")
					console.log(this.clineController)

					// Wait for task completion using intelligent polling
					await this.sleep(120000) // Initial wait before polling

					const messages = this.clineController?.task?.messageStateHandler?.getClineMessages() || []

					// Extract safe task information without circular references
					const taskInfo = {
						taskId: this.clineController?.task?.ulid,
						taskDescription: messages[0]?.text || "No description",
						messageCount: messages.length,
						lastActivity: messages[messages.length - 1]?.ts || null,
						// Check if completed
						isCompleted: messages.some(
							(msg: any) => msg.say === "completion_result" || msg.ask === "completion_result",
						),
					}

					log(`📊 Task completion result: ${messages.length} messages`)

					res.json({
						success: true,
						data: {
							messages: messages.map((msg: any) => ({
								type: msg.type,
								ask: msg.ask,
								say: msg.say,
								text: msg.text || "", // Truncate long text
								ts: msg.ts,
							})),
							taskInfo: taskInfo,
						},
						timestamp: new Date().toISOString(),
					})
					this.clineController.task = undefined
				} catch (clineError: any) {
					log(`❌ Cline core error: ${clineError.message}`)
					res.status(500).json({
						success: false,
						error: `Cline core processing error: ${clineError.message}`,
						timestamp: new Date().toISOString(),
					})
				}
			} catch (error: any) {
				log(`❌ API error: ${error.message}`)
				res.status(500).json({
					success: false,
					error: error.message,
					timestamp: new Date().toISOString(),
				})
			}
		})
	}

	private taskStatus() {
		this.app.get("/api/task/status", (req: Request, res: Response) => {
			if (!this.clineController) {
				res.status(503).json({
					success: false,
					error: "Cline controller not initialized",
					timestamp: new Date().toISOString(),
				})
				return
			}

			const task = this.clineController.task
			if (!task) {
				res.status(404).json({
					success: false,
					error: "No active task found",
					timestamp: new Date().toISOString(),
				})
				return
			}

			// Extract safe task information without circular references
			const messages = task.messageStateHandler?.getClineMessages() || []
			const safeTaskInfo = {
				taskId: task.ulid,
				taskDescription: messages[0]?.text || "No description",
				messageCount: messages.length,
				isActive: true,
				lastActivity: messages[messages.length - 1]?.ts || null,
				isCompleted: messages.some((msg: any) => msg.say === "completion_result" || msg.ask === "completion_result"),
			}

			res.json({
				success: true,
				data: safeTaskInfo,
				timestamp: new Date().toISOString(),
			})
		})
	}

	private setupGrpcHealthCheck() {
		this.grpcServer = new grpc.Server()

		// Set up health check service
		const healthImpl = new health.HealthImplementation({ "": "SERVING" })
		healthImpl.addToServer(this.grpcServer)

		// Add host bridge services using mock implementations
		this.grpcServer.addService(
			host.WorkspaceServiceService,
			this.createMockService<host.WorkspaceServiceServer>("WorkspaceService"),
		)
		this.grpcServer.addService(host.WindowServiceService, this.createMockService<host.WindowServiceServer>("WindowService"))
		this.grpcServer.addService(host.EnvServiceService, this.createMockService<host.EnvServiceServer>("EnvService"))
		this.grpcServer.addService(host.DiffServiceService, this.createMockService<host.DiffServiceServer>("DiffService"))
		this.grpcServer.addService(host.WatchServiceService, this.createMockService<host.WatchServiceServer>("WatchService"))

		// Add reflection service for debugging
		try {
			const packageDefinition = getPackageDefinition()
			const hostBridgeServiceNames = Object.keys(packageDefinition).filter(
				(name) => name.startsWith("host.") || name.startsWith("grpc.health"),
			)
			const reflection = new ReflectionService(packageDefinition, {
				services: hostBridgeServiceNames,
			})
			reflection.addToServer(this.grpcServer)
		} catch (error) {
			log(`Warning: Could not add reflection service: ${error}`)
		}

		// Start gRPC health check server
		const grpcHost = `127.0.0.1:${this.grpcPort}`
		this.grpcServer.bindAsync(grpcHost, grpc.ServerCredentials.createInsecure(), (err) => {
			if (err) {
				log(`Warning: Could not start gRPC health check on ${grpcHost}: ${err.message}`)
				return
			}
			this.grpcServer!.start()
			log(`✅ gRPC HostBridge Server ready on ${grpcHost}`)
		})
	}

	private createMockService<T extends grpc.UntypedServiceImplementation>(serviceName: string): T {
		const handler: ProxyHandler<T> = {
			get(_target, prop) {
				return (call: any, callback: any) => {
					log(`HostBridge: ${serviceName}.${String(prop)} called`)

					// Special cases that need specific return values
					switch (prop) {
						case "getWorkspacePaths":
							callback(null, { paths: [process.cwd()] })
							return
						case "getMachineId":
							callback(null, { value: "cline-standalone-" + os.hostname() })
							return
						case "clipboardReadText":
							callback(null, { value: "" })
							return
						case "getWebviewHtml":
							callback(null, {
								html: "<html><body><h1>Cline Standalone</h1></body></html>",
							})
							return
						case "showTextDocument":
							callback(null, {
								document_path: call.request?.path || "",
								view_column: 1,
								is_active: true,
							})
							return
						case "showMessage":
							log(`📢 Message: ${call.request?.message || "No message"}`)
							callback(null, { response: 1 })
							return
						case "getVisibleTabs":
						case "getOpenTabs":
							callback(null, { paths: [] })
							return
						case "showOpenDialogue":
							callback(null, { paths: [] })
							return
						case "getDiagnostics":
							callback(null, { file_diagnostics: [] })
							return
						case "getDocumentText":
							callback(null, { content: "" })
							return
						case "openDiff":
							callback(null, { diff_id: "standalone-diff-" + Date.now() })
							return
						case "subscribeToFile":
							call.end()
							return
					}

					// Default: return empty object
					callback(null, {})
				}
			},
		}

		return new Proxy({} as T, handler)
	}

	/**
	 * Set the Cline controller reference and configure OpenAI
	 */
	public async setClineController(controller: Controller) {
		this.clineController = controller
		await this.ensureWorkspaceConfiguration()
		await this.setupOpenAIConfiguration(controller)
		await this.clineController.togglePlanActMode("plan")
		log("🔗 Cline Controller connected to API")
	}

	/**
	 * Ensure workspace is configured correctly for standalone mode
	 */
	private async ensureWorkspaceConfiguration(): Promise<void> {
		const currentWorkspace = process.cwd()
		log(`📁 Workspace configured: ${currentWorkspace}`)

		// You could also set a default workspace here if needed:
		// const defaultWorkspace = process.env.CLINE_WORKSPACE || process.cwd()
		// if (defaultWorkspace !== process.cwd()) {
		//     process.chdir(defaultWorkspace)
		//     log(`📁 Workspace changed to default: ${defaultWorkspace}`)
		// }
	}

	/**
	 * Ensure OpenAI configuration is applied before creating tasks
	 */
	private async ensureOpenAIConfiguration(): Promise<void> {
		if (!this.clineController || !this.clineController.stateManager) {
			log(`❌ Cannot ensure OpenAI config - controller or stateManager not available`)
			return
		}

		const OPENAI_API_KEY = this.unwrapEnv(process.env.OPENAI_API_KEY)
		const PLAN_MODEL = this.unwrapEnv(process.env.PLAN_MODEL)
		const ACT_MODEL = this.unwrapEnv(process.env.ACT_MODEL)
		const API_PROVIDER = this.unwrapEnv(process.env.API_PROVIDER) as ApiProvider

		try {
			// Set API key in secrets (encrypted storage)
			await this.clineController.stateManager.setSecretsBatch({
				openAiNativeApiKey: OPENAI_API_KEY,
			})

			// Set provider and model configuration in global state
			await this.clineController.stateManager.setGlobalStateBatch({
				planModeApiProvider: API_PROVIDER,
				actModeApiProvider: API_PROVIDER,
				planModeApiModelId: PLAN_MODEL,
				actModeApiModelId: ACT_MODEL,
				mode: "plan",
			})

			log(`🔄 Forced OpenAI configuration before task creation`)
		} catch (error: any) {
			log(`❌ Failed to force OpenAI configuration: ${error.message}`)
		}
	}

	/**
	 * Configure OpenAI for the controller
	 */
	private async setupOpenAIConfiguration(controller: any) {
		try {
			// Read configuration from environment (preferred) and fallback to sensible defaults
			const OPENAI_API_KEY = this.unwrapEnv(process.env.OPENAI_API_KEY)
			const PLAN_MODEL = this.unwrapEnv(process.env.PLAN_MODEL)
			const ACT_MODEL = this.unwrapEnv(process.env.ACT_MODEL)
			const API_PROVIDER = this.unwrapEnv(process.env.API_PROVIDER)

			if (!OPENAI_API_KEY) {
				log(`❌ No OpenAI API key configured`)
				return
			}

			// Wait for StateManager to be initialized
			if (!controller.stateManager || !controller.stateManager.isInitialized) {
				log(`⏳ Waiting for StateManager to initialize...`)

				let attempts = 0
				const maxAttempts = 50

				while ((!controller.stateManager || !controller.stateManager.isInitialized) && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 200))
					attempts++
				}

				if (!controller.stateManager || !controller.stateManager.isInitialized) {
					log(`❌ StateManager failed to initialize after ${maxAttempts * 200}ms`)
					return
				}
			}

			log(`✅ StateManager initialized, setting API configuration...`)

			try {
				// Set API key in secrets (encrypted storage)
				await controller.stateManager.updateSecrets({
					openAiNativeApiKey: OPENAI_API_KEY,
				})

				// Set provider and model configuration in global state
				await controller.stateManager.updateGlobalState({
					planModeApiProvider: API_PROVIDER,
					actModeApiProvider: API_PROVIDER,
					planModeApiModelId: PLAN_MODEL,
					actModeApiModelId: ACT_MODEL,
					mode: "plan",
				})

				log(`✅ OpenAI API configuration set successfully`)
				log(`📋 Provider: ${API_PROVIDER}, Plan Model: ${PLAN_MODEL}, Act Model: ${ACT_MODEL}`)
			} catch (error: any) {
				log(`❌ Failed to set API configuration: ${error.message}`)
			}
		} catch (error: any) {
			log(`❌ Error in setupOpenAIConfiguration: ${error.message}`)
		}
	}

	/**
	 * Wait for task completion by monitoring messages with intelligent polling
	 * @param maxTimeoutMs Maximum timeout in milliseconds (default: 3 minutes)
	 * @returns Promise that resolves when task is completed or timeout is reached
	 */
	private async waitForTaskCompletion(maxTimeoutMs: number = 180000): Promise<void> {
		const startTime = Date.now()
		const POLL_INTERVAL_MS = 1000 // Check every second
		const MAX_CONSECUTIVE_ERRORS = 3

		let consecutiveErrors = 0
		let lastMessageCount = 0
		let stableCount = 0

		log(`⏳ Waiting for task completion (max timeout: ${maxTimeoutMs}ms, polling every ${POLL_INTERVAL_MS}ms)`)

		while (Date.now() - startTime < maxTimeoutMs) {
			try {
				// Reset error counter on successful poll
				consecutiveErrors = 0

				// Check if task and message handler still exist
				if (!this.clineController?.task?.messageStateHandler) {
					log(`❌ Task or message handler no longer available`)
					break
				}

				const messages = this.clineController.task.messageStateHandler.getClineMessages() || []
				const currentMessageCount = messages.length

				// Look for completion signals
				const completionAsk = messages.find((msg: any) => msg.type === "ask" && msg.ask === "completion_result")

				if (completionAsk) {
					const elapsedTime = Date.now() - startTime
					log(`✅ Task completion detected after ${elapsedTime}ms (completion_result ask found)`)
					return
				}

				// Check for explicit completion result
				const completionSay = messages.find((msg: any) => msg.type === "say" && msg.say === "completion_result")

				if (completionSay) {
					// Wait a bit more to see if ask follows
					await this.sleep(2000)
					const updatedMessages = this.clineController.task.messageStateHandler.getClineMessages() || []
					const finalCompletionAsk = updatedMessages.find(
						(msg: any) => msg.type === "ask" && msg.ask === "completion_result",
					)

					if (finalCompletionAsk) {
						const elapsedTime = Date.now() - startTime
						log(`✅ Task completion detected after ${elapsedTime}ms (completion sequence found)`)
						return
					}
				}

				// Monitor message activity for detecting stalled tasks
				if (currentMessageCount === lastMessageCount) {
					stableCount++
				} else {
					stableCount = 0
					lastMessageCount = currentMessageCount
					log(`📄 Message count: ${currentMessageCount} (active)`)
				}

				// Wait before next poll
				await this.sleep(POLL_INTERVAL_MS)
			} catch (error: any) {
				consecutiveErrors++
				log(`❌ Error during polling (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${error.message}`)

				if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
					log(`❌ Too many consecutive polling errors, stopping wait`)
					throw new Error(`Polling failed after ${MAX_CONSECUTIVE_ERRORS} consecutive errors: ${error.message}`)
				}

				// Wait longer before retry on error
				await this.sleep(POLL_INTERVAL_MS * 2)
			}
		}

		// Timeout reached
		const elapsedTime = Date.now() - startTime
		log(`⏰ Task completion timeout reached after ${elapsedTime}ms`)
		throw new Error(`Task did not complete within ${maxTimeoutMs}ms timeout`)
	}

	/**
	 * Sleep utility for async polling
	 * @param ms Milliseconds to sleep
	 */
	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	private unwrapEnv(value?: string): string {
		if (!value) return ""
		const v = value.trim()
		return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
	}

	public async start(): Promise<void> {
		return new Promise((resolve) => {
			this.server.listen(this.port, () => {
				this.isReady = true
				log(`🚀 Cline HTTP API Server ready on http://localhost:${this.port}`)
				resolve()
			})
		})
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			this.server.close(() => {
				if (this.grpcServer) {
					this.grpcServer.forceShutdown()
				}
				log("🛑 Cline API Server stopped")
				resolve()
			})
		})
	}
}
