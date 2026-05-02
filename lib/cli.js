function print(value) {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export function registerCli(api, runtime) {
  api.registerCli(
    ({ program }) => {
      const root = program.command("memory-plus").description("Memory Plus maintenance commands");

      root
        .command("init")
        .description("Initialize the file-backed memory store")
        .action(async () => {
          print(await runtime.init());
        });

      root
        .command("status")
        .description("Show the current memory index")
        .action(async () => {
          print(await runtime.status());
        });

      root
        .command("search")
        .description("Search memory")
        .argument("<query>", "Search query")
        .action(async (query) => {
          print(await runtime.search(query));
        });

      root
        .command("inspect")
        .description("Inspect memory state")
        .action(async () => {
          print(await runtime.inspect());
        });

      root
        .command("capture")
        .description("Capture a memory candidate from free text")
        .argument("<text>", "Candidate text")
        .action(async (text) => {
          print(await runtime.captureText(text));
        });

      root
        .command("promote")
        .description("Promote pending candidates")
        .option("--reflect", "Run conservative reflection generation after promotion")
        .action(async (options) => {
          print(await runtime.promote({}, { reflect: options.reflect === true }));
        });

      root
        .command("summarize")
        .description("Create an episodic summary from pending candidates")
        .option("--title <title>", "Optional episode title")
        .action(async (options) => {
          print(await runtime.summarize({}, options));
        });

      root
        .command("reflect")
        .description("Generate reflective memory from repeated evidence")
        .option("--force", "Bypass the minimum evidence count")
        .action(async (options) => {
          print(await runtime.reflect({}, { force: options.force === true }));
        });

      root
        .command("forget")
        .description("Forget a memory record by id")
        .argument("<id>", "Record id")
        .option("--kind <kind>", "candidate|semantic|episode|reflection|auto")
        .action(async (id, options) => {
          print(await runtime.forget({ id, kind: options.kind || "auto" }));
        });

      root
        .command("rebuild-index")
        .description("Rebuild index.yaml from the on-disk store")
        .action(async () => {
          print(await runtime.rebuildIndex());
        });

      root
        .command("doctor")
        .description("Validate store health and cross-references")
        .action(async () => {
          print(await runtime.doctor());
        });
    },
    { commands: ["memory-plus"] }
  );
}
