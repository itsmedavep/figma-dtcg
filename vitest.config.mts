// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",

        // 1️⃣ Include only the source‑level test folders
        include: [
            "src/**/*.test.{js,ts,jsx,tsx,mjs,mts,cts}",
            "tests/__tests__/**/*.test.{js,ts,jsx,tsx,mjs,mts,cts}",
        ],

        // 2️⃣ Explicitly ignore the compiled output folder
        exclude: [".tmp-tests/**"],
    },
});
