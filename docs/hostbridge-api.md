# Cline Hostbridge API

## Overview

El Cline Hostbridge API permite interactuar con Cline de forma programática a través de **HTTP REST únicamente**. Proporciona endpoints para enviar mensajes de chat, gestionar tareas y monitorear el estado del sistema.

**🔄 Arquitectura simplificada:** Esta versión está optimizada para usar solo HTTP, sin WebSocket ni gRPC, para máxima simplicidad y confiabilidad.

## Quick Start

### 1. Instalar dependencias
```bash
npm install
```

### 2. Elegir modo de inicio

#### Opción A: Solo API (Recomendado para desarrollo)
```bash
npm run start:api:only
```

#### Opción B: Cline Completo + API (Producción)
```bash
npm run start:api
```

### 3. Verificar que funciona
```bash
curl http://localhost:26042/health
```

## ⚠️ Importante: Opciones de Inicio

Cline tiene **dos modos** de operación para el hostbridge API:

### **🚀 Modo API-Only** (Recomendado para desarrollo)
- ✅ **Rápido**: Inicia solo el servidor API
- ✅ **Independiente**: No requiere Cline core
- ✅ **Testing**: Perfecto para desarrollo de clientes
- ❌ **Limitado**: Respuestas mock, sin IA real

```bash
npm run start:api:only
```

### **🔋 Modo Completo** (Producción)
- ✅ **Completo**: Cline core + API server
- ✅ **Real**: Integración total con modelos de IA
- ❌ **Lento**: Tarda más en iniciar
- ❌ **Pesado**: Más recursos requeridos

```bash
npm run start:api
```

**📖 Ver [Guía de Opciones de Inicio](startup-options.md) para más detalles.**

## Configuración

### Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `CLINE_API_PORT` | Puerto del servidor API | `26042` |
| `API_MODE` | Habilita el modo API | `true` |
| `STANDALONE_MODE` | Habilita el modo standalone | `true` |
| `EXTENSION_DIR` | Directorio de la extensión | `process.cwd()` |
| `INSTALL_DIR` | Directorio de instalación | `./dist-standalone` |

### Ejemplo de configuración
```bash
$env:CLINE_API_PORT="8080"
$env:API_MODE="true"
npm run api
```

### ⚠️ Puertos utilizados por Cline

Cline usa varios puertos para diferentes servicios:

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| `26040` | Protobus | Comunicación interna gRPC |
| `26041` | Hostbridge Core | Puente de comunicación principal |
| `26042` | **API Server** | **Nuestro hostbridge API (por defecto)** |
| `3000` | App Base URL | Configuración por defecto |
| `7777` | API Base URL | Configuración por defecto |

**El puerto 26042 fue elegido específicamente para evitar conflictos con los servicios core de Cline.**

## API Endpoints

### Health Check
```http
GET /health
```

**Respuesta:**
```json
{
  "status": "ready",
  "timestamp": "2025-08-28T10:30:00.000Z",
  "version": "0.0.1",
  "clients": 2,
  "extensionContext": {
    "extensionPath": "/path/to/extension",
    "dataPath": "/path/to/data"
  }
}
```

### Chat con Cline
```http
POST /api/chat
Content-Type: application/json

{
  "message": "Explain this code: function hello() { return 'world'; }",
  "context": {
    "file": "example.js",
    "line": 1
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "message": "Cline received: \"Explain this code...\"",
    "timestamp": "2025-08-28T10:30:00.000Z",
    "response": "Esta función retorna la cadena 'world'..."
  },
  "timestamp": "2025-08-28T10:30:00.000Z"
}
```

### Gestión de Tareas

#### Listar tareas
```http
GET /api/tasks
```

#### Ejecutar tarea
```http
POST /api/tasks
Content-Type: application/json

{
  "task": "analyze_code",
  "parameters": {
    "file": "/path/to/file.js",
    "type": "security_check"
  }
}
```

### Configuración
```http
GET /api/config
```

## Arquitectura HTTP-Only

### ¿Por qué solo HTTP?

- **✅ Simplicidad**: Menos complejidad, menos puntos de falla
- **✅ Estabilidad**: HTTP es más confiable que WebSocket para muchos casos de uso
- **✅ Compatibilidad**: Funciona con cualquier cliente HTTP estándar
- **✅ Escalabilidad**: Más fácil de deployar y escalar
- **✅ Debugging**: Más fácil de debuggear y monitorear

### Polling para Updates

Para obtener updates en tiempo real, puedes hacer polling de los endpoints:

```javascript
// Polling de mensajes cada 2 segundos
setInterval(async () => {
  const response = await fetch('/api/messages');
  const data = await response.json();
  // Procesar nuevos mensajes...
}, 2000);
```

## Ejemplos de uso

### cURL Examples

```bash
# Health check
curl http://localhost:26042/health

# Send chat message
curl -X POST http://localhost:26042/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a React component for a button",
    "context": {
      "framework": "React",
      "typescript": true
    }
  }'

# Get tasks
curl http://localhost:26042/api/tasks

# Execute task
curl -X POST http://localhost:26042/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task": "lint_code",
    "parameters": {
      "directory": "./src",
      "rules": "standard"
    }
  }'
```

### JavaScript Client

```javascript
class ClineAPIClient {
  constructor(baseUrl = 'http://localhost:26042') {
    this.baseUrl = baseUrl;
  }

  async chat(message, context = {}) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context })
    });
    return response.json();
  }

  async getTasks() {
    const response = await fetch(`${this.baseUrl}/api/tasks`);
    return response.json();
  }

  async executeTask(task, parameters = {}) {
    const response = await fetch(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, parameters })
    });
    return response.json();
  }

  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/status`);
    return response.json();
  }

  async getMessages() {
    const response = await fetch(`${this.baseUrl}/api/messages`);
    return response.json();
  }

  // Polling helper for real-time updates
  startPolling(callback, interval = 2000) {
    return setInterval(async () => {
      try {
        const messages = await this.getMessages();
        const status = await this.getStatus();
        callback({ messages, status });
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, interval);
  }

  stopPolling(intervalId) {
    clearInterval(intervalId);
  }
}

// Usage
const cline = new ClineAPIClient();

// Send a chat message
cline.chat('Explain this error: TypeError: undefined is not a function')
  .then(response => console.log(response));

// Start polling for updates
const pollingId = cline.startPolling(({ messages, status }) => {
  console.log('New messages:', messages);
  console.log('Current status:', status);
});

// Stop polling when done
// cline.stopPolling(pollingId);
```

### Python Client

```python
import requests
import time
import json

class ClineAPIClient:
    def __init__(self, base_url='http://localhost:26042'):
        self.base_url = base_url
    
    def chat(self, message, context=None):
        url = f"{self.base_url}/api/chat"
        data = {"message": message}
        if context:
            data["context"] = context
        
        response = requests.post(url, json=data)
        return response.json()
    
    def get_tasks(self):
        url = f"{self.base_url}/api/tasks"
        response = requests.get(url)
        return response.json()
    
    def execute_task(self, task, parameters=None):
        url = f"{self.base_url}/api/tasks"
        data = {"task": task}
        if parameters:
            data["parameters"] = parameters
        
        response = requests.post(url, json=data)
        return response.json()
    
    def get_status(self):
        url = f"{self.base_url}/api/status"
        response = requests.get(url)
        return response.json()
    
    def get_messages(self):
        url = f"{self.base_url}/api/messages"
        response = requests.get(url)
        return response.json()
    
    def start_polling(self, callback, interval=2):
        """Start polling for updates"""
        import threading
        
        def poll():
            while getattr(self, '_polling', True):
                try:
                    messages = self.get_messages()
                    status = self.get_status()
                    callback(messages, status)
                except Exception as e:
                    print(f"Polling error: {e}")
                time.sleep(interval)
        
        self._polling = True
        thread = threading.Thread(target=poll)
        thread.start()
        return thread
    
    def stop_polling(self):
        """Stop polling"""
        self._polling = False

# Usage
cline = ClineAPIClient()

# Send chat message
response = cline.chat(
    "Review this code for security issues",
    context={"language": "javascript", "framework": "express"}
)
print(response)

# Start polling for updates
def handle_updates(messages, status):
    print(f"Messages: {messages}")
    print(f"Status: {status}")

polling_thread = cline.start_polling(handle_updates)

# Stop polling when done
# cline.stop_polling()
```

## Error Handling

### HTTP Errors

| Status | Descripción |
|--------|-------------|
| 400 | Bad Request - Parámetros faltantes o inválidos |
| 500 | Internal Server Error - Error en el procesamiento |

### Error Response Format

```json
{
  "success": false,
  "error": "Message is required",
  "timestamp": "2025-08-28T10:30:00.000Z"
}
```

## Troubleshooting

### Puerto en uso
```bash
# Cambiar puerto
$env:CLINE_API_PORT="8080"
npm run api
```

### Problemas de compilación
```bash
# Limpiar y recompilar
npm run clean
npm run compile-standalone
npm run api
```

### Verificar logs
Los logs se muestran en la consola. Para más detalle:
```bash
$env:IS_DEV="true"
npm run api
```

## Integration Examples

### VS Code Extension Integration

```typescript
// En tu extensión de VS Code
const clineClient = new ClineAPIClient('http://localhost:26042');

vscode.commands.registerCommand('myext.askCline', async () => {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selectedText = editor.document.getText(editor.selection);
    const response = await clineClient.chat(
      `Explain this code: ${selectedText}`,
      { 
        file: editor.document.fileName,
        language: editor.document.languageId 
      }
    );
    
    vscode.window.showInformationMessage(response.data.response);
  }
});
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Code Review with Cline
  run: |
    npm run start:api &
    sleep 10
    
    curl -X POST http://localhost:26042/api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "message": "Review the changes in this PR for best practices",
        "context": {"pr": "${{ github.event.number }}"}
      }' > review.json
    
    cat review.json
```

## Limits and Performance

- **Message Size**: Máximo 50MB por request
- **Concurrent Connections**: Sin límite específico (limitado por recursos del sistema)
- **Rate Limiting**: No implementado (considera añadir en producción)
- **Timeout**: 30 segundos para operaciones de chat

## Security Considerations

- **CORS**: Habilitado para todos los orígenes (ajustar para producción)
- **Authentication**: No implementada (añadir según necesidades)
- **HTTPS**: No configurado (usar reverse proxy en producción)
- **Input Validation**: Básica (revisar según casos de uso)
