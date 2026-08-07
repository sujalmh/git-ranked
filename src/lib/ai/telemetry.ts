export type ApiTelemetryEvent = {
  type: 'api_request' | 'api_response' | 'api_error';
  provider: string;
  endpoint: string;
  model?: string;
  task?: string;
  status?: number;
  latencyMs?: number;
  summary: string;
};

export type TelemetryListener = (event: ApiTelemetryEvent) => void;

let activeListener: TelemetryListener | null = null;

export function setTelemetryListener(listener: TelemetryListener | null) {
  activeListener = listener;
}

export function emitTelemetry(event: ApiTelemetryEvent) {
  if (activeListener) {
    try {
      activeListener(event);
    } catch {
      // ignore
    }
  }
}
