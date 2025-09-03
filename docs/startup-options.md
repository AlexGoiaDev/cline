# Cline Hostbridge - Opciones de Inicio

## Problema de Dependencias

Cline tiene dos tipos de "hostbridge":

1. **Core Hostbridge** (puerto 26041) - Parte integral de Cline core
2. **API Hostbridge** (puerto 26042) - Nuestro servidor REST/WebSocket

## Opciones de Inicio

### 1. **Solo API** (Recomendado para desarrollo)
```bash
npm run start:api:only
```

**Características:**
- ✅ Solo inicia el servidor API REST/WebSocket
- ✅ No requiere que Cline core esté funcionando
- ✅ Rápido de iniciar
- ✅ Ideal para testing y desarrollo de integraciones
- ❌ Funcionalidad limitada (mock responses)

**Cuándo usar:**
- Desarrollo de clientes API
- Testing de endpoints
- Prototipado rápido
- Cuando no necesitas las funciones completas de Cline

### 2. **Cline Completo + API** (Producción)
```bash
npm run start:api
```

**Características:**
- ✅ Cline core completo + API server
- ✅ Todas las funcionalidades de Cline disponibles
- ✅ API real integrada con Cline
- ❌ Más lento de iniciar
- ❌ Requiere más recursos

**Cuándo usar:**
- Producción
- Cuando necesitas funcionalidad completa de Cline
- Integración real con modelos de IA

### 3. **Solo Core** (Modo original)
```bash
$env:API_MODE="false"
node dist-standalone/cline-core.js
```

**Características:**
- ✅ Solo Cline core original
- ❌ Sin API REST/WebSocket
- ❌ Solo funciona con interfaces nativas

## Orden de Inicio Recomendado

### Para Desarrollo:
```bash
# Terminal 1: Solo API para desarrollo rápido
npm run start:api:only

# Terminal 2: Tu aplicación cliente
curl http://localhost:26042/health
```

### Para Producción:
```bash
# Una sola terminal: Cline completo + API
npm run start:api
```

### Para Testing:
```bash
# Script de test
npm run compile-standalone
npm run start:api:only &
sleep 5
curl http://localhost:26042/health
npm test
```

## Puertos y Servicios

| Puerto | Servicio | Modo | Descripción |
|--------|----------|------|-------------|
| 26040 | Protobus | Full | Comunicación gRPC interna |
| 26041 | Core Hostbridge | Full | Puente core de Cline |
| 26042 | **API Hostbridge** | **API/Full** | **Nuestro servidor REST/WebSocket** |

## Troubleshooting

### Problema: "Waiting for hostbridge to be ready..."
**Solución:** Usa modo API-only si no necesitas Cline core:
```bash
npm run start:api:only
```

### Problema: Puerto en uso
**Solución:** Cambia el puerto de la API:
```bash
$env:CLINE_API_PORT="8080"
npm run start:api:only
```

### Problema: Cline core no inicia
**Solución:** Verifica dependencias:
```bash
npm run clean
npm run compile-standalone
npm run start:api:only  # Prueba solo API primero
```

## Variables de Entorno

```bash
# Puerto del API server
$env:CLINE_API_PORT="26042"

# Habilitar/deshabilitar API
$env:API_MODE="true"

# Modo standalone
$env:STANDALONE_MODE="true"

# Solo API (sin Cline core)
$env:API_ONLY="true"

# Desarrollo (logs detallados)
$env:IS_DEV="true"
```

## Flujo de Desarrollo Recomendado

1. **Desarrollo inicial:**
   ```bash
   npm run start:api:only
   ```

2. **Testing de integración:**
   ```bash
   npm run start:api  # Full stack
   ```

3. **Producción:**
   ```bash
   npm run start:api
   # O usar scripts de deployment
   ```

## Integración con CI/CD

```yaml
# GitHub Actions example
- name: Test API
  run: |
    npm run start:api:only &
    sleep 10
    npm run test:api
    
- name: Test Full Stack
  run: |
    npm run start:api &
    sleep 30
    npm run test:integration
```
