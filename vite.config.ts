import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath, URL } from "node:url"

export default defineConfig(({ command }) => {
  return {
    base: command === "serve" ? "./" : "/babylon-study/",
    plugins: [
      vue(),
    ],
    optimizeDeps: {
      exclude: ['@babylonjs/core']
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    }
  }
})