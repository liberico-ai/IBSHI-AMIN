/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["minio", "@prisma/client", "prisma"],
  },
};

export default nextConfig;
