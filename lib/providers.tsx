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

export function Providers({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light')

  useEffect(() => {
    const saved = (typeof window !== 'undefined'
      ? (localStorage.getItem('theme-mode') as Mode | null)
      : null)
    if (saved === 'light' || saved === 'dark') {
      setModeState(saved)
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = mode
    }
  }, [mode])

  const setMode = (m: Mode) => {
    setModeState(m)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-mode', m)
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
