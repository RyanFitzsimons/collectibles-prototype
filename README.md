# collectibles-prototype

Full Application Overview
With all files (except collectibles.db, which is runtime-generated), here’s the complete picture:

Frontend (index.html, script.js, styles.css):
A single-page app with sections for adding items/transactions and viewing reports.
Communicates with the backend via fetch to /items, /transactions, etc.
Displays VAT quarters (Q1: Apr-Jun, etc.), profit, and tax data.
Backend (server.js, db.js, inventory.js):
Express server with SQLite persistence.
Manages inventory, transactions, and tax/VAT calculations.
Validates items by category before insertion.
Database (collectibles.db):
Stores structured data with JSON fields for flexibility (e.g., attributes, condition).
Tracks financials (e.g., cost_price, input_vat, vat_amount).
VAT/Tax Integration:
VAT quarters align with UK Stagger 1 (e.g., Q4: Jan-Mar), with output VAT on sales margins and input VAT from purchases.
Tax report includes income tax and NICs based on profit, with a rolling revenue check for VAT threshold (£90,000).
Current Date Context: March 07, 2025, places us in Q4 (Jan-Mar) for VAT, post-VAT registration (March 01, 2025).
