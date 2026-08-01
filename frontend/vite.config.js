import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno del backend para el proxy
  const env = loadEnv(mode, '../', ''); 
  
  return {
    envDir: '../',
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT) || 3001,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.PORT || 3000}`,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
