// Preload for tsx scripts: loads .env (never committed) before the script runs. Usage: tsx -r ./scripts/env.cjs <file>
require("dotenv").config({ quiet: true });
