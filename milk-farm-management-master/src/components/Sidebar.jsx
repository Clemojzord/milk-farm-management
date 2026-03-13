import React from 'react'

export default function Sidebar({ route, setRoute, links, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">MF</span>
        <div>
          <div className="brand-title">Milk Farm</div>
          <div className="brand-subtitle">Management</div>
        </div>
      </div>

      <ul className="nav">
        {links.map((item) => (
          <li key={item.id}>
            <button
              className={route === item.id ? 'active' : ''}
              onClick={() => setRoute(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-user">
        <div className="sidebar-user-name">{user.displayName}</div>
        <div className="sidebar-user-meta">
          <span className="role-pill">{user.role}</span>
          <span className="muted">@{user.username}</span>
        </div>
        <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
      </div>
    </aside>
  )
}