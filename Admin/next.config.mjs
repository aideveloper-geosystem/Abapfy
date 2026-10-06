import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MUI resolve seus estilos via emotion no server component tree — evita
  // que o Next tente empacotar os pacotes de ícone/inteiros do MUI duas vezes.
  transpilePackages: ['@mui/x-charts', '@mui/x-data-grid'],
  // external/ tem lockfile próprio, mas mora dentro do repo do app desktop
  // (que também tem pnpm-lock.yaml) — sem isso o Next tenta adivinhar a raiz
  // do "monorepo" e erra.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url))
}

export default nextConfig
