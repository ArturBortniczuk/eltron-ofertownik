/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  // Wyłącz React Strict Mode
  reactStrictMode: false,
  
  // Wyłącz SWC minifier który może powodować problemy
  swcMinify: false,
  
  // Dodaj experimental flags dla lepszej stabilności
  experimental: {
    suppressHydrationWarning: true
  },
  
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
