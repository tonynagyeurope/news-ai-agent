/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',          // SSG + S3 kompatibilis
  images: { unoptimized: true }
};
export default nextConfig;
