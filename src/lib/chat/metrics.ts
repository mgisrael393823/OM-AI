export const metrics = {
  count: (_name: string, _value: number, _tags?: Record<string, string>) => {},
  timing: (_name: string, _value: number, _tags?: Record<string, string>) => {}
}
// TODO[Claude]: bind to chosen telemetry backend and add dashboards/alerts
