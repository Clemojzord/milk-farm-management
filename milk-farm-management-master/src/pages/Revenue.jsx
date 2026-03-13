import React, { useEffect, useState } from 'react'
import { createRevenue, getRevenue } from '../api/client'

const getToday = () => new Date().toISOString().slice(0, 10)

export default function Revenue({ canEdit, onAuthError }) {
  const [revenue, setRevenue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ date: getToday(), product: 'Milk', quantity: 0, unitPrice: 0 })

  useEffect(() => {
    let active = true

    async function loadList() {
      try {
        const rows = await getRevenue()
        if (!active) return

        setRevenue(Array.isArray(rows) ? rows : [])
        setError('')
      } catch (e) {
        if (!active) return

        setError(e.message || 'Failed to load revenue records')
        onAuthError?.(e)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadList()

    return () => {
      active = false
    }
  }, [onAuthError])

  async function add() {
    if (!canEdit) return

    try {
      const created = await createRevenue({
        date: form.date,
        product: form.product,
        quantity: parseFloat(form.quantity || 0),
        unitPrice: parseFloat(form.unitPrice || 0),
      })

      setRevenue((prev) => [...prev, created])
      setForm({ date: getToday(), product: 'Milk', quantity: 0, unitPrice: 0 })
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to add revenue')
      onAuthError?.(e)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Revenue</h2>
        <div className="muted">Record income from sales</div>
      </div>

      {!canEdit ? <div className="card read-only-note">Read-only access for your role.</div> : null}
      {loading ? <div className="card">Loading revenue...</div> : null}
      {error ? <div className="card auth-error">{error}</div> : null}

      <div className="card section-spacer">
        <h4>Add Revenue</h4>
        <div className="form-row">
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Product"
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="form-row">
          <input
            className="input"
            placeholder="Quantity"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value || '0') })}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Unit Price"
            type="number"
            value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: parseFloat(e.target.value || '0') })}
            disabled={!canEdit}
          />
        </div>
        <button className="btn" onClick={add} disabled={!canEdit}>Add Revenue</button>
      </div>

      <div className="card">
        <h4>Revenue List</h4>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {revenue.map((item) => (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{item.product}</td>
                <td>{item.quantity}</td>
                <td>${(Number(item.unitPrice) || 0).toFixed(2)}</td>
                <td>${(Number(item.total) || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}