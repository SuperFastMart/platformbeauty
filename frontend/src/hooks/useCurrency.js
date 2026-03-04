import { useState, useEffect } from 'react';
import api from '../api/client';

const CURRENCIES = {
  GBP: { code: 'GBP', symbol: '£', label: 'British Pound' },
  USD: { code: 'USD', symbol: '$', label: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', label: 'Euro' },
};

function getStored() {
  const code = localStorage.getItem('currency');
  return CURRENCIES[code] || CURRENCIES.GBP;
}

let fetchPromise = null;

export default function useCurrency() {
  const [currency, setCurrency] = useState(getStored);

  useEffect(() => {
    if (fetchPromise) {
      fetchPromise.then(c => setCurrency(c));
      return;
    }
    fetchPromise = api.get('/admin/site-settings')
      .then(({ data }) => {
        const code = data.currency || 'GBP';
        localStorage.setItem('currency', code);
        return CURRENCIES[code] || CURRENCIES.GBP;
      })
      .catch(() => CURRENCIES.GBP);

    fetchPromise.then(c => setCurrency(c));
  }, []);

  return currency;
}

export function formatCurrency(amount, currencyObj) {
  if (amount == null || isNaN(amount)) return `${currencyObj.symbol}0.00`;
  return `${currencyObj.symbol}${Number(amount).toFixed(2)}`;
}

export function updateCurrency(code) {
  localStorage.setItem('currency', code);
  fetchPromise = Promise.resolve(CURRENCIES[code] || CURRENCIES.GBP);
}

export { CURRENCIES };
