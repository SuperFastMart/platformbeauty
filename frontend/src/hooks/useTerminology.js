import { useState, useEffect } from 'react';
import api from '../api/client';

const TERMS = {
  clients: { person: 'Client', people: 'Clients' },
  customers: { person: 'Customer', people: 'Customers' },
};

function getStored() {
  const label = localStorage.getItem('customer_label');
  return TERMS[label] || TERMS.customers;
}

let fetchPromise = null;

export default function useTerminology() {
  const [terms, setTerms] = useState(getStored);

  useEffect(() => {
    // Already fetched this session
    if (fetchPromise) {
      fetchPromise.then(t => setTerms(t));
      return;
    }
    fetchPromise = api.get('/admin/settings/terminology')
      .then(({ data }) => {
        const label = data.value || 'customers';
        localStorage.setItem('customer_label', label);
        const t = TERMS[label] || TERMS.customers;
        return t;
      })
      .catch(() => TERMS.customers);

    fetchPromise.then(t => setTerms(t));
  }, []);

  return terms;
}

// Call this when the setting is changed to update all components
export function updateTerminology(label) {
  localStorage.setItem('customer_label', label);
  fetchPromise = Promise.resolve(TERMS[label] || TERMS.customers);
}
