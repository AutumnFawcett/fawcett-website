import { spawn } from "node:child_process";
import { resolve } from "node:path";
import nextEnv from "@next/env";

const [command, ...args] = process.argv.slice(2);
if (!["next", "firebase", "node"].includes(command)) throw new Error("Unsupported local command");
nextEnv.loadEnvConfig(process.cwd(), command === "next" && args[0] === "dev");
const env = { ...process.env };
if (env.VERCEL_ENV !== "production") {
  // Platform ADC is unrelated to local emulators. Drop only its binding in the
  // child; never read the credential file or modify the parent environment.
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  env.FIREBASE_EMULATORS_PATH ||= resolve(".firebase-cache/emulators");
  env.XDG_CONFIG_HOME ||= resolve(".firebase-cache/config");
}
const executable = command === "node" ? process.execPath : resolve("node_modules/.bin", command);
const child = spawn(executable, args, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
