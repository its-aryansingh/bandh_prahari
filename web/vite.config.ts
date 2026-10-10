import { defineConfig } from "vite";

// Relative base so the build works on Amplify, S3 or opened from a folder.
export default defineConfig({
  base: "./",
  build: { target: "es2020", assetsInlineLimit: 0, cssCodeSplit: false },
});
