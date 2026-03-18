const { spawn } = require("child_process");

const activeChildren = new Set();
let cleanupRegistered = false;

const terminateChild = (child, signal = "SIGTERM") => {
  if (!child || child.killed) {
    return;
  }

  try {
    child.kill(signal);
  } catch (error) {
    // Best effort cleanup for subprocesses during shutdown.
  }
};

const terminateActiveChildren = () => {
  for (const child of activeChildren) {
    terminateChild(child, "SIGTERM");
  }

  setTimeout(() => {
    for (const child of activeChildren) {
      terminateChild(child, "SIGKILL");
    }
  }, 5000).unref();
};

const registerCleanupHandlers = () => {
  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;

  const handleShutdownSignal = (signal) => {
    terminateActiveChildren();
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  };

  process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
  process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
  process.on("uncaughtException", (error) => {
    terminateActiveChildren();
    console.error(error);
    process.exit(1);
  });
};

registerCleanupHandlers();

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    activeChildren.add(child);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });

    child.on("close", (code) => {
      activeChildren.delete(child);
      if (code !== 0) {
        const error = new Error(
          `Command failed (${command} ${args.join(" ")}): ${stderr || stdout}`.trim()
        );
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });

module.exports = {
  runCommand,
  terminateActiveChildren,
};
