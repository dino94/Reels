import path from "node:path";

export default {
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
};
