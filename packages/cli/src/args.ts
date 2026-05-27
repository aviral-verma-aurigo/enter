export interface CliArgs {
  command: "run" | "export" | "version" | "help" | "login" | "logout";
  positional: string[];
  print: boolean;
  autonomous?: string;
  /** Propose a plan and exit (interactive plan-first mode). */
  plan?: string;
  /** Execute a previously proposed plan from `~/.enter/plans/<name>.md`. */
  executePlan?: string;
  model?: string;
  provider?: string;
  soul?: string;
  session?: string;
  maxTurns?: number;
  noColor: boolean;
  simple: boolean;
  exportSessionId?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    command: "run",
    positional: [],
    print: false,
    noColor: false,
    simple: false,
  };
  if (argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    out.command = "help";
    return out;
  }
  if (argv[0] === "version" || argv[0] === "--version" || argv[0] === "-v") {
    out.command = "version";
    return out;
  }
  if (argv[0] === "export") {
    out.command = "export";
    if (argv[1]) out.exportSessionId = argv[1];
    return out;
  }
  if (argv[0] === "login" || argv[0] === "logout") {
    out.command = argv[0];
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === "--provider") {
        const v = argv[++i];
        if (!v) throw new Error("--provider requires a name");
        out.provider = v;
      } else {
        throw new Error(`Unknown flag for '${argv[0]}': ${a}`);
      }
    }
    return out;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--print":
      case "-p":
        out.print = true;
        break;
      case "--autonomous": {
        const v = argv[++i];
        if (!v) throw new Error("--autonomous requires a goal string");
        out.autonomous = v;
        break;
      }
      case "--plan": {
        const v = argv[++i];
        if (!v) throw new Error("--plan requires a goal string");
        out.plan = v;
        break;
      }
      case "--execute-plan": {
        const v = argv[++i];
        if (!v) throw new Error("--execute-plan requires a path to a saved plan");
        out.executePlan = v;
        break;
      }
      case "--model":
        out.model = argv[++i];
        break;
      case "--provider":
        out.provider = argv[++i];
        break;
      case "--soul":
        out.soul = argv[++i];
        break;
      case "--session":
        out.session = argv[++i];
        break;
      case "--max-turns": {
        const v = argv[++i];
        if (!v) throw new Error("--max-turns requires a number");
        out.maxTurns = Number.parseInt(v, 10);
        break;
      }
      case "--no-color":
        out.noColor = true;
        break;
      case "--simple":
        out.simple = true;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
        out.positional.push(a);
    }
  }
  return out;
}

export function helpText(): string {
  return `enter — an autonomous teammate that ships pull requests

USAGE
  enter [prompt...]
  enter --print "<prompt>"
  enter --autonomous "<goal>" [--max-turns N]
  enter --plan "<goal>"               propose a plan, don't execute
  enter --execute-plan <plan-path>    execute a previously proposed plan
  enter login [--provider <name>]     save an API key to ~/.enter/keys.json
  enter logout [--provider <name>]    remove a saved API key
  enter export <session-id>
  enter version
  enter help

FLAGS
  --print               headless one-shot
  --autonomous <goal>   run autonomous loop until done/max-turns
  --plan <goal>         plan-first mode: investigate read-only, propose a plan, exit
  --execute-plan <path> execute a plan saved earlier under ~/.enter/plans/
  --model <id>          provider-specific model id
  --provider <name>     provider (e.g. anthropic, openai)
  --soul <path>         override SOUL.md path
  --session <id>        resume session by id
  --max-turns <n>       autonomous-mode turn cap
  --no-color            disable ANSI
  --simple              use plain readline REPL instead of the rich interactive UI

ENV
  ANTHROPIC_API_KEY     overrides the saved key (otherwise read from ~/.enter/keys.json)
  ENTER_HOME            override ~/.enter
  ENTER_MODEL           default model id
  ENTER_PROVIDER        default provider
  ENTER_LOG             debug|info|warn|error (default info)
`;
}
