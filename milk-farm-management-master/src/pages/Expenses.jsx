import React, { useEffect, useState } from 'react'
import { createExpense, getExpenses } from '../api/client'

const categories = ['Farmer Payments', 'Milk Processing', 'Equipment Maintenance', 'Transportation', 'Workers Wages', 'Other']
const getToday = () => new Date().toISOString().slice(0, 10)

export default function Expenses({ canEdit, onAuthError }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ date: getToday(), category: categories[0], description: '', amount: 0 })

  useEffect(() => {
    let active = true

    async function loadList() {
      try {
        const rows = await getExpenses()
        if (!active) return

        setExpenses(Array.isArray(rows) ? rows : [])
        setError('')
      } catch (e) {
        if (!active) return

        setError(e.message || 'Failed to load expenses')
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
      const created = await createExpense({
        date: form.date,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount || 0),
      })

      setExpenses((prev) => [...prev, created])
      setForm({ date: getToday(), category: categories[0], description: '', amount: 0 })
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to add expense')
      onAuthError?.(e)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Expenses</h2>
        <div className="muted">Track outgoing costs</div>
      </div>

      {!canEdit ? <div className="card read-only-note">Read-only access for your role.</div> : null}
      {loading ? <div className="card">Loading expenses...</div> : null}
      {error ? <div className="card auth-error">{error}</div> : null}

      <div className="card section-spacer">
        <h4>Add Expense</h4>
        <div className="form-row">
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            disabled={!canEdit}
          />
          <select
            className="select"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            disabled={!canEdit}
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <button className="btn" onClick={add} disabled={!canEdit}>Add Expense</button>
      </div>

      <div className="card">
        <h4>Expense List</h4>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((item) => (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{item.category}</td>
                <td className="muted">{item.description}</td>
                <td>${(Number(item.amount) || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}