import React, { useEffect, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { getDashboardSummary } from '../api/client'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

const emptySummary = {
  totals: {
    milkLiters: 0,
    expenses: 0,
    revenue: 0,
    net: 0,
    farmerOutstanding: 0,
  },
  counts: {
    farmers: 0,
    expenses: 0,
    revenue: 0,
  },
  updatedAt: null,
}

export default function Dashboard({ onAuthError }) {
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadSummary() {
      try {
        const data = await getDashboardSummary()
        if (!active) return

        setSummary(data || emptySummary)
        setError('')
      } catch (e) {
        if (!active) return

        setError(e.message || 'Failed to load dashboard data')
        onAuthError?.(e)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [onAuthError])

  const totals = summary?.totals || emptySummary.totals
  const counts = summary?.counts || emptySummary.counts

  const revenueVsExpense = {
    labels: ['Revenue', 'Expenses'],
    datasets: [
      {
        label: 'Amount',
        data: [totals.revenue || 0, totals.expenses || 0],
        backgroundColor: ['#0fb5a6', '#f97316'],
      },
    ],
  }

  const profitSeries = [totals.net * 0.8, totals.net, totals.net * 1.12]

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <div className="muted">
          {summary?.updatedAt ? `Updated ${new Date(summary.updatedAt).toLocaleString()}` : 'Overview'}
        </div>
      </div>

      {loading ? <div className="card">Loading summary...</div> : null}
      {error ? <div className="card auth-error">{error}</div> : null}

      <div className="cards">
        <div className="card">
          <div className="muted">Total Milk Collected</div>
          <h3>{(totals.milkLiters || 0).toFixed(2)} L</h3>
        </div>
        <div className="card">
          <div className="muted">Total Expenses</div>
          <h3>${(totals.expenses || 0).toFixed(2)}</h3>
        </div>
        <div className="card">
          <div className="muted">Total Revenue</div>
          <h3>${(totals.revenue || 0).toFixed(2)}</h3>
        </div>
        <div className="card">
          <div className="muted">Net Profit / Loss</div>
          <h3 className={(totals.net || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
            ${(totals.net || 0).toFixed(2)}
          </h3>
        </div>
      </div>

      <div className="cards section-spacer" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="muted">Farmers</div>
          <h3>{counts.farmers || 0}</h3>
        </div>
        <div className="card">
          <div className="muted">Expense Records</div>
          <h3>{counts.expenses || 0}</h3>
        </div>
        <div className="card">
          <div className="muted">Revenue Records</div>
          <h3>{counts.revenue || 0}</h3>
        </div>
        <div className="card">
          <div className="muted">Outstanding Farmer Balance</div>
          <h3>${(totals.farmerOutstanding || 0).toFixed(2)}</h3>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <h4>Revenue vs Expenses</h4>
          <Bar data={revenueVsExpense} />
        </div>
        <div className="card">
          <h4>Profit Trend (Snapshot)</h4>
          <Line
            data={{
              labels: ['Previous', 'Current', 'Projected'],
              datasets: [{ label: 'Profit', data: profitSeries, borderColor: '#0fb5a6' }],
            }}
          />
        </div>
      </div>
    </div>
  )
}