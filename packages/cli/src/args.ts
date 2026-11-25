export interface CliArgs {
  command: "run" | "export" | "version" | "help" | "schedule";
  positional: string[];
  /** Subcommand for `enter schedule`: add | list | remove | run-due. */
  scheduleAction?: string;
  /** --every <minutes> for `schedule add`. */
  everyMinutes?: number;
  /** --at <HH:MM> for `schedule add`. */
  dailyAt?: string;
  print: boolean;
  autonomous?: string;
  /** Propose a plan and exit (interactive plan-first mode). */
  plan?: string;
  /** Execute a previously proposed plan from `~/.enter/plans/<name>.md`. */
  executePlan?: string;
  model?: string;
  executionModel?: string;
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
  if (argv[0] === "schedule") {
    out.command = "schedule";
    out.scheduleAction = argv[1];
    for (let i = 2; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === "--every") {
        const v = argv[++i];
        if (!v) throw new Error("--every requires minutes");
        out.everyMinutes = Number.parseInt(v, 10);
      } else if (a === "--at") {
        const v = argv[++i];
        if (!v) throw new Error("--at requires HH:MM");
        out.dailyAt = v;
      } else if (a === "--max-turns") {
        const v = argv[++i];
        if (!v) throw new Error("--max-turns requires a number");
        out.maxTurns = Number.parseInt(v, 10);
      } else if (a.startsWith("--")) {
        throw new Error(`Unknown schedule flag: ${a}`);
      } else {
        out.positional.push(a);
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
      case "--execution-model":
        out.executionModel = argv[++i];
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
  enter export <session-id>
  enter schedule add <name> "<goal>" (--every <minutes> | --at <HH:MM>) [--max-turns N]
  enter schedule list
  enter schedule remove <name>
  enter schedule run-due               run all due schedules, then exit (cron-friendly)
  enter version
  enter help

FLAGS
  --print               headless one-shot
  --autonomous <goal>   run autonomous loop until done/max-turns
  --plan <goal>         plan-first mode: investigate read-only, propose a plan, exit
  --execute-plan <path> execute a plan saved earlier under ~/.enter/plans/
  --model <id>          model for thinking/planning (the main agent)
  --execution-model <id> model for execution: subagents, skill authoring, --execute-plan
  --provider <name>     provider (e.g. anthropic, openai)
  --soul <path>         override SOUL.md path
  --session <id>        resume session by id
  --max-turns <n>       autonomous-mode turn cap
  --no-color            disable ANSI
  --simple              use plain readline REPL instead of the rich interactive UI

ENV
  ANTHROPIC_API_KEY     required for default provider
  ENTER_HOME            override ~/.enter
  ENTER_MODEL           default main (thinking/planning) model id
  ENTER_EXECUTION_MODEL default execution model id (subagents, --execute-plan)
  ENTER_PROVIDER        default provider
  ENTER_LOG             debug|info|warn|error (default info)
`;
}
