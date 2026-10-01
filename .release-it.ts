// Import from source, not from "@dnbhq/release-config": consumers can extend this file with
// `"extends": "github:davidsneighbour/release-config"`, and the downloaded repository has no dist/.
import { createReleaseConfig } from "./src/index.ts";
import type { Config } from "release-it";

const config: Config = createReleaseConfig();

export default config;
