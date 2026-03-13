import React, { useEffect, useState } from 'react'
import { login } from '../api/client'

export default function Login({ onAuthenticated, message }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setError(message || '')
  }, [message])

  async function handleSubmit(event) {
    event.preventDefault()
    const cleanUser = username.trim().toLowerCase()

    if (!cleanUser || !password) {
      setError('Enter both username and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const user = await login(cleanUser, password)
      onAuthenticated(user)
    } catch (e) {
      setError(e.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">Milk Farm Management</div>
        <h2>Sign In</h2>
        <div className="muted">Use your role account to continue.</div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error ? <div className="auth-error">{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-help muted">
          <div>Default accounts:</div>
          <div>admin / admin123</div>
          <div>accountant / accountant123</div>
          <div>viewer / viewer123</div>
        </div>
      </div>
    </div>
  )
}