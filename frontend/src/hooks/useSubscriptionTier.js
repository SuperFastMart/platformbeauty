import { useState, useEffect } from 'react';
import api from '../api/client';

// Module-level cache to avoid refetching on every component mount
let cachedData = null;
let fetchPromise = null;

function fetchTier() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = api.get('/admin/subscription/tier')
    .then(({ data }) => {
      cachedData = {
        tier: data.tier || 'free',
        status: data.status,
        trialEndsAt: data.trial_ends_at,
      };
      return cachedData;
    })
    .catch(() => {
      cachedData = { tier: 'free', status: 'unknown', trialEndsAt: null };
      return cachedData;
    })
    .finally(() => {
      // Allow re-fetch after 60 seconds
      setTimeout(() => { fetchPromise = null; }, 60000);
    });
  return fetchPromise;
}

const TIER_LEVEL = { free: 0, growth: 1, pro: 2 };

export default function useSubscriptionTier() {
  const [data, setData] = useState(cachedData || { tier: null, status: null, trialEndsAt: null });
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
      return;
    }
    fetchTier().then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const trialDaysLeft = data.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const hasAccess = (requiredTier) => {
    if (!data.tier) return true; // Loading — don't block
    return (TIER_LEVEL[data.tier] || 0) >= (TIER_LEVEL[requiredTier] || 0);
  };

  return { tier: data.tier, status: data.status, trialDaysLeft, loading, hasAccess };
}

// Force cache clear (e.g. after subscription change)
export function clearTierCache() {
  cachedData = null;
  fetchPromise = null;
}
