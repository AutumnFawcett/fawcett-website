// Shared schema; no environment-variable or administrator bypass.
export const WRITE_FENCE_PATH = "systemControls/writeFence";
export const OPEN_EMULATOR_FENCE = Object.freeze({ schemaVersion: 1, state: "open", epoch: "synthetic-initial", writerProtocol: 1 });
export function writesOpen(value) {
  return value?.schemaVersion === 1 && value.state === "open" && value.writerProtocol === 1
    && typeof value.epoch === "string" && value.epoch.length > 0 && value.epoch.length <= 80
    && !/[^A-Za-z0-9_-]/.test(value.epoch);
}
export function maintenanceError() {
  return Object.assign(new Error("Studio updates are paused. Your account and saved history are safe. Please try again later."), { code: "maintenance", status: 503 });
}
