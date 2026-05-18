/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["minio", "@prisma/client", "prisma", "exceljs", "pdfkit", "nodemailer"],
  },
};

export default nextConfig;
