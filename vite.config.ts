import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  visualizer({
    open: false,
    filename: "dist/stats.html",
    gzipSize: true,
    brotliSize: true,
  }),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "vendor-react";
            if (id.includes("@radix-ui")) return "vendor-ui";
            if (id.includes("react-hook-form") || id.includes("zod")) return "vendor-form";
            if (id.includes("@trpc")) return "vendor-trpc";
            if (id.includes("date-fns") || id.includes("clsx")) return "vendor-utils";
            if (id.includes("recharts")) return "vendor-charts";
            if (id.includes("@fullcalendar")) return "vendor-calendar";
            if (id.includes("@tiptap")) return "vendor-editor";
            return "vendor-other";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: "terser",
  } as any,
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "*.vercel.app",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
