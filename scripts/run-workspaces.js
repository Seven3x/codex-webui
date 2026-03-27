var childProcess = require("child_process");

var scriptName = process.argv[2];
var workspaces = ["packages/shared", "apps/backend", "apps/frontend"];

if (!scriptName) {
  console.error("Usage: node ./scripts/run-workspaces.js <script-name>");
  process.exit(1);
}

for (var i = 0; i < workspaces.length; i += 1) {
  var workspace = workspaces[i];
  var result = childProcess.spawnSync("npm", ["run", scriptName, "-w", workspace], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
