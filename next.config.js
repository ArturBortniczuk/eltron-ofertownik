/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  
  // Wyłącz React Strict Mode
  reactStrictMode: false,
  
  // Webpack config dla jsPDF
  webpack: (config, { isServer }) => {    
    // Dodaj fallback dla node modules w browserze
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      canvas: false,
    };
    
    // Dodaj alias dla jsPDF
    config.resolve.alias = {
      ...config.resolve.alias,
      jspdf: require.resolve('jspdf/dist/jspdf.node.min.js'),
    };
    
    return config;
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
