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
          if (!id.includes("node_modules")) return;

          // Matches a package whether installed flat (`/node_modules/<pkg>/`)
          // or via pnpm (`/node_modules/.pnpm/<pkg>@`). Used for exact names so
          // e.g. `react` does not also swallow `react-dom`, `react-query`, etc.
          const pkg = (name: string) =>
            id.includes(`/node_modules/${name}/`) ||
            id.includes(`/node_modules/.pnpm/${name}@`);

          // Rich-text editor (TipTap + ProseMirror) — only loaded on editor pages.
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";

          // Calendar (FullCalendar) — only loaded on the calendar page.
          if (id.includes("@fullcalendar")) return "vendor-calendar";

          // Charts: recharts pulls in the whole d3 family + helpers.
          if (
            id.includes("recharts") ||
            id.includes("/d3-") ||
            id.includes("victory-vendor") ||
            id.includes("react-smooth") ||
            id.includes("internmap")
          )
            return "vendor-charts";

          // Icon set — large and used across the app; isolate for caching.
          if (id.includes("lucide-react")) return "vendor-icons";

          // Animation runtime.
          if (
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils") ||
            pkg("motion")
          )
            return "vendor-motion";

          // Radix UI primitives (shadcn/ui foundation).
          if (id.includes("@radix-ui")) return "vendor-ui";

          // Data layer: tRPC + react-query + superjson serializer.
          if (id.includes("@trpc") || id.includes("@tanstack") || id.includes("superjson"))
            return "vendor-data";

          // Forms + schema validation.
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            pkg("zod")
          )
            return "vendor-form";

          // React core only (precise — keeps satellite react-* libs out).
          if (
            pkg("react") ||
            pkg("react-dom") ||
            pkg("scheduler") ||
            pkg("react-is") ||
            id.includes("react/jsx-runtime")
          )
            return "vendor-react";

          // Small shared utilities.
          if (id.includes("date-fns") || id.includes("clsx") || id.includes("tailwind-merge"))
            return "vendor-utils";

          return "vendor-other";
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
