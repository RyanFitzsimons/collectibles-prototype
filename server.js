// server.js: A Node.js/Express server handling API endpoints for the frontend.

const express = require('express');
const { promisify } = require('util');
const path = require('path');
const db = require('./db'); // Imports SQLite database connection
const { validateInventoryItem } = require('./inventory'); // Imports item validation

const app = express();
app.use(express.json()); // Parses incoming JSON requests
app.use(express.static(path.join(__dirname, 'public'))); // Serves static files from public/

// Promisifies database methods for async/await usage
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

// Root route - Serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add Inventory Item - dds an item to inventory, validates via validateInventoryItem, stores JSON fields (e.g., attributes).
app.post('/items', (req, res) => {
  const item = req.body;
  try {
    validateInventoryItem(item); // Ensures item meets category rules
    const sql = `
      INSERT INTO inventory (name, attributes, condition, condition_history, tags, category, value, 
        value_last_updated, value_history, cost_price, modification_cost, input_vat, acquisition, 
        trade_origin_tx_id, location, status, status_updated, image, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      item.name,
      JSON.stringify(item.attributes),
      JSON.stringify(item.condition),
      JSON.stringify(item.condition_history),
      JSON.stringify(item.tags || []),
      item.category,
      item.value,
      item.value_last_updated || new Date().toISOString(),
      JSON.stringify(item.value_history || [{ date: new Date().toISOString(), value: item.value }]),
      item.cost_price,
      item.modification_cost || 0,
      item.input_vat || 0,
      JSON.stringify(item.acquisition || { source: "Unknown", date: new Date().toISOString() }),
      item.trade_origin_tx_id || null,
      item.location || null,
      item.status || "In Stock",
      item.status_updated || new Date().toISOString(),
      item.image || null,
      item.notes || null
    ];
    // Inserts item into database
    db.run(sql, params, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, ...item }); // Returns new item ID
    });
  } catch (e) {
    res.status(400).json({ error: e.message }); // Returns validation errors
  }
});

// Record Transaction - Records a transaction, calculates VAT (16.67% of margin if VAT-registered), links items via transaction_items
app.post('/transactions', async (req, res) => {
  const tx = req.body;
  const taxStatus = await dbGet('SELECT * FROM tax_status WHERE status_id = 1');
  const regDate = taxStatus.vat_registration_date ? new Date(taxStatus.vat_registration_date) : null;
  const deregDate = taxStatus.vat_deregistration_date ? new Date(taxStatus.vat_deregistration_date) : null;
  const txDate = new Date(tx.timestamp || new Date());

  // Calculates VAT if within VAT registration period
  if (regDate && txDate >= regDate && (!deregDate || txDate < deregDate)) {
    const inventory = await dbAll('SELECT * FROM inventory');
    let vatTotal = 0;
    tx.items.forEach(ti => {
      if (ti.direction === 'Out') {
        const item = inventory.find(i => i.id === ti.item_id);
        const margin = ti.price - (item.cost_price + (item.modification_cost || 0));
        if (margin > 0) vatTotal += Math.round(margin * 0.16666666666666666); // VAT at 1/6 of margin
      }
    });
    tx.vat_applicable = 1;
    tx.vat_amount = vatTotal;
  } else {
    tx.vat_applicable = 0;
    tx.vat_amount = 0;
  }

  const sql = `
    INSERT INTO transactions (type, total_value, payment_method, cash_amount, timestamp, vat_amount, vat_applicable)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [tx.type, tx.total_value, tx.payment_method, tx.cash_amount, tx.timestamp || new Date().toISOString(), tx.vat_amount, tx.vat_applicable];
  // Inserts transaction and links items
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    const txId = this.lastID;
    const itemsSql = `INSERT INTO transaction_items (tx_id, item_id, price, market_value, direction) VALUES (?, ?, ?, ?, ?)`;
    tx.items.forEach(item => {
      db.run(itemsSql, [txId, item.item_id, item.price, item.market_value || item.price, item.direction]);
    });
    res.status(201).json({ tx_id: txId, ...tx });
  });
});

// Get Profit Report - Returns a profit report with cost, sold price, profit, and VAT per item.
app.get('/profit-report', (req, res) => {
  db.all(`
    SELECT i.id, i.name, i.category, i.cost_price, i.modification_cost, ti.price, t.timestamp, t.vat_amount
    FROM inventory i
    LEFT JOIN transaction_items ti ON i.id = ti.item_id AND ti.direction = 'Out'
    LEFT JOIN transactions t ON ti.tx_id = t.tx_id
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const report = rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      cost: row.cost_price + (row.modification_cost || 0),
      soldPrice: row.price || null,
      profit: row.price ? row.price - (row.cost_price + (row.modification_cost || 0)) : null,
      vat: row.vat_amount || 0,
      date: row.timestamp || null
    }));
    res.json(report);
  });
});

// Get Tax Report - Calculates profit, income tax, NICs, VAT, and rolling revenue for the tax year.
app.get('/tax-report', async (req, res) => {
  try {
    const taxStatus = await dbGet('SELECT * FROM tax_status WHERE status_id = 1');
    const transactions = await dbAll('SELECT * FROM transactions');
    const transactionItems = await dbAll('SELECT * FROM transaction_items');
    const inventory = await dbAll('SELECT * FROM inventory');
    const adjustments = await dbAll('SELECT * FROM inventory_adjustments');

    // Determines tax year based on earliest transaction
    const earliestTxDate = transactions.length > 0 ? new Date(transactions[0].timestamp) : new Date();
    const taxYearStart = new Date(earliestTxDate.getFullYear(), 0, 1).toISOString().split('T')[0];
    const taxYearEnd = new Date(earliestTxDate.getFullYear() + 1, 0, 1).toISOString().split('T')[0];

    const txList = transactions.map(tx => ({
      ...tx,
      items: transactionItems.filter(ti => ti.tx_id === tx.tx_id)
    }));

    // Updates VAT for applicable transactions
    const regDate = taxStatus.vat_registration_date ? new Date(taxStatus.vat_registration_date) : null;
    const deregDate = taxStatus.vat_deregistration_date ? new Date(taxStatus.vat_deregistration_date) : null;
    txList.forEach(tx => {
      const txDate = new Date(tx.timestamp);
      if (regDate && txDate >= regDate && (!deregDate || txDate < deregDate)) {
        let vatTotal = 0;
        tx.items.forEach(ti => {
          if (ti.direction === 'Out') {
            const item = inventory.find(i => i.id === ti.item_id);
            const margin = ti.price - (item.cost_price + (item.modification_cost || 0));
            if (margin > 0) vatTotal += Math.round(margin * 0.16666666666666666);
          }
        });
        tx.vat_applicable = 1;
        tx.vat_amount = vatTotal;
        db.run('UPDATE transactions SET vat_applicable = ?, vat_amount = ? WHERE tx_id = ?', [1, vatTotal, tx.tx_id]);
      }
    });

    // Calculates revenue for the tax year
    const revenue = txList
      .filter(tx => tx.timestamp >= taxYearStart && tx.timestamp <= taxYearEnd && (tx.type === 'Sale' || tx.type === 'Trade-Out'))
      .reduce((sum, tx) => {
        const txRevenue = tx.items
          .filter(ti => ti.direction === 'Out')
          .reduce((itemSum, ti) => itemSum + ti.price, 0);
        return sum + txRevenue;
      }, 0);

      // Calculates cost of goods sold
    const soldItemIds = new Set();
    const costOfGoodsSold = txList
      .filter(tx => tx.timestamp >= taxYearStart && tx.timestamp <= taxYearEnd)
      .flatMap(tx => tx.items)
      .filter(ti => ti.direction === 'Out')
      .reduce((sum, ti) => {
        if (!soldItemIds.has(ti.item_id)) {
          soldItemIds.add(ti.item_id);
          const item = inventory.find(i => i.id === ti.item_id);
          const cost = item ? item.cost_price + (item.modification_cost || 0) : 0;
          return sum + cost;
        }
        return sum;
      }, 0);

      // Sums adjustment losses
    const adjustmentsLoss = adjustments
      .filter(adj => adj.date >= taxYearStart && adj.date <= taxYearEnd)
      .reduce((sum, adj) => sum + Math.abs(adj.value_change), 0);

    const profit = revenue - costOfGoodsSold - adjustmentsLoss;

    // Applies UK 2025 tax rules
    const personalAllowance = profit > 100000 ? Math.max(12570 - ((profit - 100000) / 2), 0) : 12570;
    const taxableProfit = Math.max(profit - personalAllowance, 0);
    let incomeTax = 0;

    if (taxableProfit > 0) {
      const basicRateLimit = 50270 - personalAllowance;
      const higherRateLimit = 125140 - personalAllowance;

      if (taxableProfit <= basicRateLimit) {
        incomeTax = taxableProfit * 0.2; // Basic rate
      } else if (taxableProfit <= higherRateLimit) {
        incomeTax = (basicRateLimit * 0.2) + ((taxableProfit - basicRateLimit) * 0.4); // Higher rate
      } else {
        incomeTax = (basicRateLimit * 0.2) + ((higherRateLimit - basicRateLimit) * 0.4) + ((taxableProfit - higherRateLimit) * 0.45); // Additional rate
      }
    }
 
    const class2NIC = profit > 6725 ? 179.40 : 0; // Class 2 NIC flat rate
    const class4NIC = taxableProfit <= 50270 ? taxableProfit * 0.09 : (50270 - 12570) * 0.09 + (taxableProfit - 50270) * 0.02; // Class 4 NIC
    const nics = class2NIC + class4NIC;

    // Calculates VAT for the tax year
    const outputVat = txList
      .filter(tx => tx.vat_applicable && tx.timestamp >= taxYearStart && tx.timestamp <= taxYearEnd)
      .reduce((sum, tx) => sum + tx.vat_amount, 0);
    const inputVat = inventory
      .filter(item => soldItemIds.has(item.id))
      .reduce((sum, item) => sum + (item.input_vat || 0), 0);
    const vat = outputVat - inputVat;

    // Checks rolling 12-month revenue for VAT threshold
    const currentDate = new Date().toISOString();
    const startDate = new Date(currentDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const rollingRevenue = txList
      .filter(tx => tx.timestamp >= startDate.toISOString() && tx.timestamp <= currentDate)
      .reduce((sum, tx) => sum + tx.cash_amount, 0);
    const vatStatus = rollingRevenue > taxStatus.revenue_threshold ? 'Register' : 'Below Threshold';

    res.json({
      profit,
      incomeTax,
      nics,
      vat,
      rollingRevenue,
      vatStatus
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// VAT Return - Provides VAT details (output/input/net) for a specified year and quarter.
app.get('/vat-return', async (req, res) => {
  try {
    const { year, quarter } = req.query;
    if (!year || !quarter || !['1', '2', '3', '4'].includes(quarter)) {
      return res.status(400).json({ error: 'Year and quarter (1-4) required' });
    }

    const taxYear = parseInt(year, 10);
    const quarterNum = parseInt(quarter, 10);
    let startDate, endDate;

    // Defines quarter periods (UK Stagger 1)
    switch (quarterNum) {
      case 1:
        startDate = new Date(taxYear, 3, 1).toISOString().split('T')[0]; // Apr 1
        endDate = new Date(taxYear, 5, 30).toISOString().split('T')[0]; // Jun 30
        break;
      case 2:
        startDate = new Date(taxYear, 6, 1).toISOString().split('T')[0]; // Jul 1
        endDate = new Date(taxYear, 8, 30).toISOString().split('T')[0]; // Sep 30
        break;
      case 3:
        startDate = new Date(taxYear, 9, 1).toISOString().split('T')[0]; // Oct 1
        endDate = new Date(taxYear, 11, 31).toISOString().split('T')[0]; // Dec 31
        break;
      case 4:
        startDate = new Date(taxYear, 0, 1).toISOString().split('T')[0]; // Jan 1
        endDate = new Date(taxYear, 2, 31).toISOString().split('T')[0]; // Mar 31
        break;
    }

    const transactions = await dbAll('SELECT * FROM transactions');
    const transactionItems = await dbAll('SELECT * FROM transaction_items');
    const inventory = await dbAll('SELECT * FROM inventory');

    const txList = transactions.map(tx => ({
      ...tx,
      items: transactionItems.filter(ti => ti.tx_id === tx.tx_id)
    }));

    const soldItemIds = new Set();
    txList
      .filter(tx => tx.timestamp >= startDate && tx.timestamp <= endDate)
      .flatMap(tx => tx.items)
      .filter(ti => ti.direction === 'Out')
      .forEach(ti => soldItemIds.add(ti.item_id));

    const outputVat = txList
      .filter(tx => tx.vat_applicable && tx.timestamp >= startDate && tx.timestamp <= endDate)
      .reduce((sum, tx) => sum + tx.vat_amount, 0);
    const inputVat = inventory
      .filter(item => soldItemIds.has(item.id))
      .reduce((sum, item) => sum + (item.input_vat || 0), 0);
    const netVat = outputVat - inputVat;

    res.json({
      year: taxYear,
      quarter: quarterNum,
      period: `${startDate} to ${endDate}`,
      outputVat,
      inputVat,
      netVat
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Starts the server on port 3000
app.listen(3000, () => console.log('Server running on port 3000'));