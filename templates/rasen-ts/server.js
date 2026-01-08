import express from 'express'
import { createServer as createViteServer } from 'vite'

const app = express()

// Create Vite server in middleware mode
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom'
})

// Use vite's connect instance as middleware
app.use(vite.middlewares)

app.use('*', async (req, res) => {
  const url = req.originalUrl

  try {
    // Load the server entry
    const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
    
    // Render the application HTML
    const html = render(url)
    
    res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
  } catch (e) {
    vite.ssrFixStacktrace(e)
    console.error(e)
    res.status(500).end(e.message)
  }
})

const PORT = 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
})
