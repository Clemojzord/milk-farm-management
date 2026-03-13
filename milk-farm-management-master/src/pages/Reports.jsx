import React, { useEffect, useState } from 'react'
import { getState } from '../api/client'
import { downloadCSV } from '../utils/csv'

const emptyData = { farmers: [], expenses: [], revenue: [] }

export default function Reports({ onAuthError }) {
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadAll() {
      try {
        const state = await getState()
        if (!active) return

        setData(state || emptyData)
        setError('')
      } catch (e) {
        if (!active) return

        setError(e.message || 'Failed to load report data')
        onAuthError?.(e)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadAll()

    return () => {
      active = false
    }
  }, [onAuthError])

  function exportCSV(name, rows, columns) {
    downloadCSV(name, rows, columns)
  }

  const farmers = Array.isArray(data.farmers) ? data.farmers : []
  const expenses = Array.isArray(data.expenses) ? data.expenses : []
  const revenue = Array.isArray(data.revenue) ? data.revenue : []

  const farmersExportRows = farmers.map((farmer) => {
    const deliveries = farmer.deliveries || []
    const totalLiters = deliveries.reduce((sum, delivery) => sum + (Number(delivery.liters) || 0), 0)

    return {
      id: farmer.id,
      name: farmer.name,
      phone: farmer.phone || '',
      location: farmer.location,
      price: farmer.price,
      balance: farmer.balance,
      deliveriesCount: deliveries.length,
      totalLiters,
    }
  })

  return (
    <div>
      <div className="page-header">
        <h2>Reports</h2>
        <div className="muted">Export data for accounting</div>
      </div>

      {loading ? <div className="card">Loading report data...</div> : null}
      {error ? <div className="card auth-error">{error}</div> : null}

      <div className="cards">
        <div className="card">
          <h4>Expenses</h4>
          <div className="muted">{expenses.length} records</div>
          <button
            className="btn"
            onClick={() => exportCSV('expenses', expenses, ['id', 'date', 'category', 'description', 'amount'])}
          >
            Export CSV
          </button>
        </div>

        <div className="card">
          <h4>Revenue</h4>
          <div className="muted">{revenue.length} records</div>
          <button
            className="btn"
            onClick={() => exportCSV('revenue', revenue, ['id', 'date', 'product', 'quantity', 'unitPrice', 'total'])}
          >
            Export CSV
          </button>
        </div>

        <div className="card">
          <h4>Farmers</h4>
          <div className="muted">{farmers.length} records</div>
          <button
            className="btn"
            onClick={() =>
              exportCSV('farmers', farmersExportRows, [
                'id',
                'name',
                'phone',
                'location',
                'price',
                'balance',
                'deliveriesCount',
                'totalLiters',
              ])
            }
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}