'use client'

import { ConfigProvider } from 'antd'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { I18nProvider } from './i18n-context'
import { newshockLightTheme, newshockDarkTheme } from './design-tokens'

type Mode = 'light' | 'dark'

interface ThemeModeContextValue {
  mode: Mode
  setMode: (m: Mode) => void
  toggle: () => void
}

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'light',
  setMode: () => {},
  toggle: () => {},
})

export const useThemeMode = () => useContext(ThemeModeContext)

export function Providers({
  children,
  initialMode = 'light',
}: {
  children: ReactNode
  initialMode?: Mode
}) {
  const [mode, setModeState] = useState<Mode>(initialMode)

  // one-time reconcile with whatever the inline <head> script set on first paint.
  // Why: when cookie is missing but localStorage has 'dark', SSR uses light but
  // the inline script flips dataset.theme to dark before hydration. Sync state to it.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const attr = document.documentElement.dataset.theme
    if ((attr === 'dark' || attr === 'light') && attr !== mode) {
      setModeState(attr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = mode
    }
  }, [mode])

  const setMode = (m: Mode) => {
    setModeState(m)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('theme-mode', m)
      } catch {}
      document.cookie = `theme-mode=${m};path=/;max-age=31536000;samesite=lax`
    }
  }

  const toggle = () => setMode(mode === 'light' ? 'dark' : 'light')

  return (
    <ThemeModeContext.Provider value={{ mode, setMode, toggle }}>
      <ConfigProvider theme={mode === 'dark' ? newshockDarkTheme : newshockLightTheme}>
        <I18nProvider>{children}</I18nProvider>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  )
}
