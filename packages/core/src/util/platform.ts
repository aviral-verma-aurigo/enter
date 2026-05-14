import os from "node:os";

export const isWindows = process.platform === "win32";

export function homeDir(): string {
  return os.homedir();
}

export interface ShellChoice {
  cmd: string;
  args: (command: string) => string[];
}

export function getShell(prefer?: "auto" | "powershell" | "cmd" | "bash"): ShellChoice {
  const choice = prefer ?? "auto";
  if (choice === "powershell" || (choice === "auto" && isWindows)) {
    return {
      cmd: "powershell.exe",
      args: (command) => ["-NoProfile", "-NonInteractive", "-Command", command],
    };
  }
  if (choice === "cmd") {
    return { cmd: "cmd.exe", args: (command) => ["/d", "/s", "/c", command] };
  }
  return { cmd: "sh", args: (command) => ["-lc", command] };
}
