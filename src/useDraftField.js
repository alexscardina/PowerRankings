import { useEffect, useRef, useState } from 'react';

/**
 * Local input state that does not reset when the parent re-renders with
 * an older saved value. Resets only when `resetKey` changes (team/edition).
 */
export default function useDraftField(externalValue, resetKey) {
  const [value, setValue] = useState(externalValue || '');
  const externalRef = useRef(externalValue);
  externalRef.current = externalValue;

  useEffect(() => {
    setValue(externalRef.current || '');
  }, [resetKey]);

  return [value, setValue];
}
