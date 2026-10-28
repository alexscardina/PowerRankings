import { useEffect, useState } from 'react';

/**
 * Local input state that does not reset when the parent re-renders with
 * an older saved value. Resets only when `resetKey` changes (team/edition).
 */
export default function useDraftField(externalValue, resetKey) {
  const [value, setValue] = useState(externalValue || '');

  useEffect(() => {
    setValue(externalValue || '');
  }, [resetKey]);

  return [value, setValue];
}
