import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Next.js confunda la raíz del workspace por el lockfile vacío
  // en la carpeta padre (Proyecto cochera/package-lock.json).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
