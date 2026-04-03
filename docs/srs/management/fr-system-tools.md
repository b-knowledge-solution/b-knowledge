# FR: System Tools

> Administrative dashboard for monitoring and managing external system tools (Grafana, Prometheus, Kibana, etc.) with health checks and tool execution.

## 1. Overview

The System Tools feature provides administrators with a centralized interface to monitor and interact with external observability and infrastructure tools. Tools are defined via a JSON configuration file and displayed in the admin UI with health status indicators.

### 1.1 Goals

- Provide quick-access links to monitoring tools (Grafana, Prometheus, Kibana, Jaeger, etc.)
- Show health/connectivity status for each tool
- Allow privileged execution of tool-specific actions
- Support configurable tool definitions via external JSON config

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| User with `view_system_tools` | View tool list and health status |
| Admin with `manage_system` | Execute system tool actions |

## 2. Functional Requirements

### 2.1 Tool Listing

- **FR-ST-001**: The system shall display a list of configured system tools from the JSON config file.
- **FR-ST-002**: Each tool shall show: name, description, icon, access URL, and enabled/disabled status.
- **FR-ST-003**: Tools shall be ordered by the `order` field in the configuration.

### 2.2 Health Monitoring

- **FR-ST-010**: The system shall check connectivity/readiness of configured tools.
- **FR-ST-011**: Health status shall be returned for each tool (reachable/unreachable).

### 2.3 Tool Execution

- **FR-ST-020**: Admin users shall execute tool-specific actions by tool ID.
- **FR-ST-021**: Tool execution shall require the `manage_system` permission.

## 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/system-tools` | Yes | List available system tools |
| GET | `/api/system-tools/health` | Yes | Get system health status |
| POST | `/api/system-tools/:id/run` | Admin | Execute a system tool |

## 4. Configuration

Tools are defined in `docker/config/system-tools.config.json` (or path specified by `SYSTEM_TOOLS_CONFIG_PATH`):

```json
[
  {
    "id": "grafana",
    "name": "Grafana",
    "description": "Metrics dashboard",
    "icon": "https://...",
    "url": "http://localhost:3000",
    "order": 1,
    "enabled": true
  }
]
```

## 5. Dependencies

- [Admin Operations](/srs/management/fr-admin-operations) — System tools are accessible from the admin dashboard
- [Infrastructure](/basic-design/system-infra/infrastructure-deployment) — External tool deployment
