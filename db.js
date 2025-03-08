const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/collectibles.db');

// Initialize database schema
db.serialize(() => {
  // Inventory table with input_vat
  db.run(`
    CREATE TABLE inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      attributes TEXT,
      condition TEXT,
      condition_history TEXT,
      tags TEXT,
      category TEXT,
      value REAL,
      value_last_updated TEXT,
      value_history TEXT,
      cost_price REAL NOT NULL,
      modification_cost REAL DEFAULT 0,
      input_vat REAL DEFAULT 0,
      acquisition TEXT,
      trade_origin_tx_id INTEGER,
      location TEXT,
      status TEXT,
      status_updated TEXT,
      image TEXT,
      notes TEXT
    )
  `);

  // Transactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      tx_id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      type TEXT,
      total_value REAL,
      payment_method TEXT,
      cash_amount REAL,
      e_payment_amount REAL,
      e_payment_note TEXT,
      trade_credit_amount REAL,
      discount REAL,
      final_total REAL,
      timestamp TEXT,
      vat_amount REAL,
      vat_applicable INTEGER,
      notes TEXT
    )
  `);

  // Transaction Items table
  db.run(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      tx_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_id INTEGER,
      item_id INTEGER,
      price REAL,
      market_value REAL,
      direction TEXT,
      FOREIGN KEY (tx_id) REFERENCES transactions(tx_id),
      FOREIGN KEY (item_id) REFERENCES inventory(id)
    )
  `);

  // Inventory Adjustments table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      adjustment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      date TEXT,
      value_change REAL,
      reason TEXT,
      FOREIGN KEY (item_id) REFERENCES inventory(id)
    )
  `);

  // Tax Status table - Create first, then seed
  db.run(`
    CREATE TABLE IF NOT EXISTS tax_status (
      status_id INTEGER PRIMARY KEY,
      vat_registration_date TEXT,
      vat_deregistration_date TEXT,
      revenue_threshold REAL,
      tax_year_start TEXT,
      notes TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating tax_status table:', err.message);
      return;
    }
    // Check and seed tax_status
    db.get('SELECT COUNT(*) as count FROM tax_status', (err, row) => {
      if (err) {
        console.error('Error checking tax_status count:', err.message);
        return;
      }
      if (!row || row.count === 0) {
        db.run(`
          INSERT INTO tax_status (status_id, vat_registration_date, vat_deregistration_date, revenue_threshold, tax_year_start, notes)
          VALUES (1, '2025-03-01', NULL, 90000.0, '2025-01-01', 'Monitoring for VAT threshold')
        `, (err) => {
          if (err) console.error('Error seeding tax_status:', err.message);
        });
      }
    });
  });
});

module.exports = db;