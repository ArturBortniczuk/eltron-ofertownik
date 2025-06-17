/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  
  reactStrictMode: false,
  
  webpack: (config, { isServer, webpack }) => {
    // Dodaj plugin do ignorowania problematycznych modułów
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^cloudflare:sockets$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^pg-cloudflare$/,
      })
    );

    // Konfiguracja dla client-side - całkowicie blokuj pg
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pg': false,
        'pg-native': false,
        'pg-cloudflare': false,
        'cloudflare:sockets': false,
        canvas: false,
        encoding: false,
      };
      
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        dns: false,
        child_process: false,
        'cloudflare:sockets': false,
      };
    }
    
    // Konfiguracja dla server-side
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('pg-native');
      config.externals.push('cloudflare:sockets');
      config.externals.push('pg-cloudflare');
    }
    
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
