import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import Farmers from './pages/Farmers'
import Expenses from './pages/Expenses'
import Revenue from './pages/Revenue'
import Reports from './pages/Reports'
import {
  canManageFarmers,
  canWriteFinance,
  clearAuthToken,
  getCurrentUser,
  getNavLinksForRole,
  hasAuthToken,
  isUnauthorized,
  logout,
} from './api/client'

export default function App() {
  const [route, setRoute] = useState('dashboard')
  const [auth, setAuth] = useState({ status: 'loading', user: null, message: '' })

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      if (!hasAuthToken()) {
        if (active) {
          setAuth({ status: 'unauthenticated', user: null, message: '' })
        }
        return
      }

      try {
        const user = await getCurrentUser()
        if (!active) return

        setAuth({ status: 'authenticated', user, message: '' })
      } catch (error) {
        clearAuthToken()

        if (!active) return

        const message = isUnauthorized(error)
          ? 'Your session expired. Sign in again.'
          : 'Could not connect to the backend API.'

        setAuth({ status: 'unauthenticated', user: null, message })
      }
    }

    bootstrapSession()

    return () => {
      active = false
    }
  }, [])

  const links = useMemo(() => {
    if (auth.status !== 'authenticated' || !auth.user) return []
    return getNavLinksForRole(auth.user.role)
  }, [auth])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    if (links.length === 0) return

    const routeAllowed = links.some((item) => item.id === route)
    if (!routeAllowed) {
      setRoute(links[0].id)
    }
  }, [auth.status, links, route])

  function handleAuthenticated(user) {
    const allowed = getNavLinksForRole(user.role)
    setAuth({ status: 'authenticated', user, message: '' })

    if (allowed.length > 0) {
      setRoute(allowed[0].id)
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      clearAuthToken()
    }

    setAuth({ status: 'unauthenticated', user: null, message: '' })
    setRoute('dashboard')
  }

  function handleAuthError(error) {
    if (!isUnauthorized(error)) return

    clearAuthToken()
    setAuth({
      status: 'unauthenticated',
      user: null,
      message: 'Your session expired. Sign in again.',
    })
  }

  if (auth.status === 'loading') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h2>Loading session...</h2>
          <div className="muted">Checking authentication state.</div>
        </div>
      </div>
    )
  }

  if (auth.status !== 'authenticated' || !auth.user) {
    return <Login onAuthenticated={handleAuthenticated} message={auth.message} />
  }

  const role = auth.user.role
  const farmerManagement = canManageFarmers(role)
  const financeWrite = canWriteFinance(role)

  const titles = {
    dashboard: 'Dashboard',
    farmers: 'Farmers',
    expenses: 'Expenses',
    revenue: 'Revenue',
    reports: 'Reports',
  }

  return (
    <div className="app">
      <Sidebar
        route={route}
        setRoute={setRoute}
        links={links}
        user={auth.user}
        onLogout={handleLogout}
      />

      <main className="main">
        <section key={route} className="route-view" aria-label={titles[route] || 'Page'}>
          {route === 'dashboard' && <Dashboard onAuthError={handleAuthError} />}
          {route === 'farmers' && (
            <Farmers canEdit={farmerManagement} onAuthError={handleAuthError} />
          )}
          {route === 'expenses' && (
            <Expenses canEdit={financeWrite} onAuthError={handleAuthError} />
          )}
          {route === 'revenue' && <Revenue canEdit={financeWrite} onAuthError={handleAuthError} />}
          {route === 'reports' && <Reports onAuthError={handleAuthError} />}
        </section>
      </main>
    </div>
  )
}