import './polyfill'
import './style.css'
import { App } from './app'
import { audio } from './audio'
import { islandScreen } from './ui/island'
import { menuScreen } from './ui/menu'
import { playScreen } from './ui/play'

async function registerServiceWorker(app: App): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const { registerSW } = await import('virtual:pwa-register')
    const updateSW = registerSW({
      immediate: true,
      // A new version waits until Wyne is on the start screen, never in the middle of a game.
      onNeedRefresh() {
        app.updateReady(() => {
          void updateSW(true)
          window.setTimeout(() => location.reload(), 4000)
        })
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        const check = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) void registration.update()
        }
        document.addEventListener('visibilitychange', check)
        window.addEventListener('online', check)
      },
    })
  } catch {
    // No service worker in dev, or blocked: the game runs fine without one.
  }
}

function boot(): void {
  const mount = document.getElementById('app')
  if (!mount) return
  const app = new App(mount)
  app.register('menu', menuScreen)
  app.register('play', playScreen)
  app.register('island', islandScreen)
  app.go('menu')
  ;(window as unknown as { __app: App }).__app = app

  // No pinch zoom, no double tap zoom, no rubber banding, no long-press menus.
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener('dblclick', (e) => e.preventDefault())
  document.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('pointerdown', () => audio.unlock(), { capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') app.persist()
  })

  void registerServiceWorker(app)
}

boot()
