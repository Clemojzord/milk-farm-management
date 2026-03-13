import React, { useEffect, useState } from 'react'
import { addFarmerDelivery, createFarmer, getFarmers, markFarmerPaid } from '../api/client'

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

const initialForm = { name: '', phone: '', location: '', price: 0 }

export default function Farmers({ canEdit, onAuthError }) {
  const [farmers, setFarmers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)

  useEffect(() => {
    let active = true

    async function loadList() {
      try {
        const rows = await getFarmers()
        if (!active) return

        setFarmers(Array.isArray(rows) ? rows : [])
        setError('')
      } catch (e) {
        if (!active) return

        setError(e.message || 'Failed to load farmers')
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
    const name = form.name.trim()
    if (!name || !canEdit) return

    try {
      const created = await createFarmer({
        name,
        phone: form.phone,
        location: form.location,
        price: Number(form.price) || 0,
      })

      setFarmers((prev) => [...prev, created])
      setForm(initialForm)
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to add farmer')
      onAuthError?.(e)
    }
  }

  async function addDelivery(farmerId) {
    if (!canEdit) return

    const liters = parseFloat(prompt('Amount delivered in liters')) || 0
    if (liters <= 0) return

    try {
      const updated = await addFarmerDelivery(farmerId, { liters, date: getToday() })
      setFarmers((prev) => prev.map((item) => (item.id === farmerId ? updated : item)))
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to add delivery')
      onAuthError?.(e)
    }
  }

  async function markPaid(farmerId) {
    if (!canEdit) return

    try {
      const updated = await markFarmerPaid(farmerId)
      setFarmers((prev) => prev.map((item) => (item.id === farmerId ? updated : item)))
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to mark farmer as paid')
      onAuthError?.(e)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Farmers</h2>
        <div className="muted">Manage farmer profiles and deliveries</div>
      </div>

      {!canEdit ? <div className="card read-only-note">Read-only access for your role.</div> : null}
      {loading ? <div className="card">Loading farmers...</div> : null}
      {error ? <div className="card auth-error">{error}</div> : null}

      <div className="card section-spacer">
        <h4>Add Farmer</h4>
        <div className="form-row">
          <input
            className="input"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Phone Number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="form-row">
          <input
            className="input"
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="input"
            placeholder="Price per liter"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value || '0') })}
            disabled={!canEdit}
          />
        </div>
        <button className="btn" onClick={add} disabled={!canEdit}>Add Farmer</button>
      </div>

      <div className="card">
        <h4>Farmer List</h4>
        <div className="muted section-spacer">Delivery date is saved automatically as today&apos;s date.</div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Location</th>
              <th>Price/L</th>
              <th>Delivered (L)</th>
              <th>Last Delivery</th>
              <th>Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {farmers.map((farmer) => (
              <tr key={farmer.id}>
                <td>{farmer.name}</td>
                <td className="muted">{farmer.phone || '-'}</td>
                <td>{farmer.location}</td>
                <td>${(Number(farmer.price) || 0).toFixed(2)}</td>
                <td>
                  {(farmer.deliveries || [])
                    .reduce((sum, delivery) => sum + (Number(delivery.liters) || 0), 0)
                    .toFixed(2)}
                </td>
                <td>
                  {farmer.deliveries && farmer.deliveries.length
                    ? farmer.deliveries[farmer.deliveries.length - 1].date
                    : '-'}
                </td>
                <td>${(Number(farmer.balance) || 0).toFixed(2)}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn" onClick={() => addDelivery(farmer.id)} disabled={!canEdit}>
                      Add Delivery
                    </button>
                    <button className="btn" onClick={() => markPaid(farmer.id)} disabled={!canEdit}>
                      Mark Paid
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}