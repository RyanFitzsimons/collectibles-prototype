function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
      section.style.display = section.id === sectionId ? 'block' : 'none';
    });
  }
  
  function toggleCIBFields(select) {
    const cibFields = document.getElementById('cib-fields');
    cibFields.style.display = select.value === 'CIB' ? 'block' : 'none';
    const inputs = cibFields.querySelectorAll('input');
    inputs.forEach(input => input.required = select.value === 'CIB');
  }
  
  // Set initial visibility for CIB fields on page load
  document.addEventListener('DOMContentLoaded', () => {
    toggleCIBFields(document.querySelector('select[name="condition_type"]'));
  });
  
  document.getElementById('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const item = Object.fromEntries(formData);
    
    item.attributes = {
      platform: item.platform,
      region: item.region,
      packaging: item.packaging,
      ...(item.edition && { edition: item.edition })
    };
    
    item.condition = { type: item.condition_type };
    if (item.condition_type === 'CIB') {
      item.condition.value = item.condition_value;
      item.condition.components = {
        box: item.box,
        disc: item.disc,
        manual: item.manual
      };
    }
    
    item.condition_history = [item.condition];
    
    delete item.platform;
    delete item.region;
    delete item.packaging;
    delete item.edition;
    delete item.condition_type;
    delete item.condition_value;
    delete item.box;
    delete item.disc;
    delete item.manual;
  
    try {
      const res = await fetch('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      document.getElementById('item-result').textContent = res.ok ? `Added item: ${data.id}` : `Error: ${data.error}`;
    } catch (err) {
      document.getElementById('item-result').textContent = `Error: ${err.message}`;
    }
  });
  
  document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const tx = Object.fromEntries(formData);
    tx.items = [{ item_id: parseInt(tx.item_id), price: parseFloat(tx.price), direction: 'Out' }];
    delete tx.item_id;
    delete tx.price;
  
    try {
      const res = await fetch('/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
      const data = await res.json();
      document.getElementById('transaction-result').textContent = res.ok ? `Added transaction: ${data.tx_id}` : `Error: ${data.error}`;
    } catch (err) {
      document.getElementById('transaction-result').textContent = `Error: ${err.message}`;
    }
  });
  
  async function fetchProfitReport() {
    try {
      const res = await fetch('/profit-report');
      const data = await res.json();
      const tbody = document.querySelector('#profit-table tbody');
      tbody.innerHTML = '';
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id}</td>
          <td>${row.name}</td>
          <td>${row.category}</td>
          <td>${row.cost.toFixed(2)}</td>
          <td>${row.soldPrice ? row.soldPrice.toFixed(2) : 'N/A'}</td>
          <td>${row.profit ? row.profit.toFixed(2) : 'N/A'}</td>
          <td>${row.vat.toFixed(2)}</td>
          <td>${row.date || 'N/A'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Profit report error:', err);
    }
  }
  
  async function fetchTaxReport() {
    try {
      const res = await fetch('/tax-report');
      const data = await res.json();
      document.getElementById('tax-result').innerHTML = `
        <p>Profit: £${data.profit.toFixed(2)}</p>
        <p>Income Tax: £${data.incomeTax.toFixed(2)}</p>
        <p>NICs: £${data.nics.toFixed(2)}</p>
        <p>VAT: £${data.vat.toFixed(2)}</p>
        <p>Rolling Revenue: £${data.rollingRevenue.toFixed(2)}</p>
        <p>VAT Status: ${data.vatStatus}</p>
      `;
    } catch (err) {
      document.getElementById('tax-result').textContent = `Error: ${err.message}`;
    }
  }
  
  document.getElementById('vat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { year, quarter } = Object.fromEntries(formData);
  
    try {
      const res = await fetch(`/vat-return?year=${year}&quarter=${quarter}`);
      const data = await res.json();
      document.getElementById('vat-result').innerHTML = `
        <p>Year: ${data.year}</p>
        <p>Quarter: Q${data.quarter}</p>
        <p>Period: ${data.period}</p>
        <p>Output VAT: £${data.outputVat.toFixed(2)}</p>
        <p>Input VAT: £${data.inputVat.toFixed(2)}</p>
        <p>Net VAT: £${data.netVat.toFixed(2)}</p>
      `;
    } catch (err) {
      document.getElementById('vat-result').textContent = `Error: ${err.message}`;
    }
  });
  
  // Show add-item section by default
  showSection('add-item');